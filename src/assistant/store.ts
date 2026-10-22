import { now, sha256Hex } from '../db'
import { AML_TODAY_SQL, amlToday } from '../aml/retention'
import { ASSISTANT, assistantTopic, type AssistantTopic } from './model'

export interface AssistantScope { company: string; actor: string; side: 'client' | 'team' }
export const assistantScopeSql = (c='c', actor='?2', side='?3') => `${c}.closed_at IS NULL AND ${c}.purge_started_at IS NULL AND ${c}.aml_archived_at IS NULL
  AND (${c}.contract_at IS NOT NULL OR ${c}.demo=1) AND (${c}.ends_on IS NULL OR ${c}.ends_on>=${AML_TODAY_SQL})
  AND EXISTS(SELECT 1 FROM users u WHERE u.id=${actor} AND (${side}='client' AND EXISTS(SELECT 1 FROM members m WHERE m.company_id=${c}.id AND m.user_id=u.id)
    OR ${side}='team' AND (u.team='admin' OR u.team='accountant' AND ${c}.accountant_id=u.id)))`
export async function assistantAllowed(db:D1Database,s:AssistantScope):Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 AS ok FROM companies c WHERE c.id=?1 AND ${assistantScopeSql()}`).bind(s.company,s.actor,s.side).first())
}
interface Use { company_id:string;actor:string;side:string;fingerprint:string;state:string;topic:string|null }
export type Reservation = {kind:'new'|'pending'|'limit'|'conflict'|'unavailable'} | {kind:'cached';topic:AssistantTopic}

/** A counted reservation is never refunded after an uncertain network result. Retrying its id never calls AI again. */
export async function reserveQuestion(db:D1Database,s:AssistantScope,id:string,question:string,document:string):Promise<Reservation> {
  const fingerprint=await sha256Hex(JSON.stringify({question,document})),at=now(),day=amlToday()
  const previous=()=>db.prepare('SELECT company_id,actor,side,fingerprint,state,topic FROM assistant_uses WHERE id=?').bind(id).first<Use>()
  const seen=(r:Use):Reservation=>r.company_id!==s.company||r.actor!==s.actor||r.side!==s.side||r.fingerprint!==fingerprint ? {kind:'conflict'}
    : r.state==='done'&&assistantTopic(r.topic) ? {kind:'cached',topic:assistantTopic(r.topic)!} : {kind:r.state==='pending'?'pending':'unavailable'}
  const prior=await previous();if(prior)return seen(prior)
  try {
    // One INSERT observes and increments all limits atomically; concurrent Workers cannot reserve past the cap.
    const r=await db.prepare(`INSERT OR IGNORE INTO assistant_uses(id,company_id,actor,side,fingerprint,day,created_at,model)
      SELECT ?4,?1,?2,?3,?5,?6,?7,?8 FROM companies c WHERE c.id=?1 AND ${assistantScopeSql()}
      AND EXISTS(SELECT 1 FROM assistant_control WHERE id=1 AND enabled=1)
      AND (SELECT COUNT(*) FROM assistant_uses WHERE day=?6)< ?9
      AND (SELECT COUNT(*) FROM assistant_uses WHERE day=?6 AND company_id=?1)< ?10
      AND (SELECT COUNT(*) FROM assistant_uses WHERE day=?6 AND actor=?2)< ?11
      AND NOT EXISTS(SELECT 1 FROM assistant_uses WHERE actor=?2 AND state='pending' AND created_at>?12)`)
      .bind(s.company,s.actor,s.side,id,fingerprint,day,at,ASSISTANT.model,ASSISTANT.globalDaily,ASSISTANT.companyDaily,ASSISTANT.userDaily,at-ASSISTANT.pendingSeconds).run()
    if((r.meta.changes??0)>0)return {kind:'new'}
  } catch {
    const saved=await previous().catch(()=>null)
    return saved?seen(saved):{kind:'unavailable'}
  }
  const saved=await previous();return saved?seen(saved):{kind:'limit'}
}

export async function finishQuestion(db:D1Database,s:AssistantScope,id:string,result:{topic:AssistantTopic;input:number;output:number}|null):Promise<boolean> {
  const at=now()
  if(result){
    const r=await db.prepare(`UPDATE assistant_uses SET state='done',topic=?5,finished_at=?6,input_tokens=?7,output_tokens=?8
      WHERE id=?4 AND company_id=?1 AND actor=?2 AND side=?3 AND state='pending'
      AND EXISTS(SELECT 1 FROM assistant_control WHERE id=1 AND enabled=1)
      AND EXISTS(SELECT 1 FROM companies c WHERE c.id=?1 AND ${assistantScopeSql()})`)
      .bind(s.company,s.actor,s.side,id,result.topic,at,result.input,result.output).run()
    if((r.meta.changes??0)>0)return true
  }
  await db.prepare(`UPDATE assistant_uses SET state='failed',finished_at=?5,input_tokens=?6,output_tokens=?7
    WHERE id=?4 AND company_id=?1 AND actor=?2 AND side=?3 AND state='pending'`)
    .bind(s.company,s.actor,s.side,id,at,result?.input??null,result?.output??null).run()
  return false
}
export async function assistantControl(db:D1Database) {
  const [control,usage]=await db.batch<Record<string,unknown>>([
    db.prepare('SELECT enabled,changed_at FROM assistant_control WHERE id=1'),
    db.prepare(`SELECT COUNT(*) AS calls,SUM(state='pending') AS pending,SUM(state='failed') AS failed,
      COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,SUM(input_tokens IS NULL) AS unknown
      FROM assistant_uses WHERE day=?`).bind(amlToday()),
  ])
  return {enabled:control?.results[0]?.enabled===1,calls:Number(usage?.results[0]?.calls??0),pending:Number(usage?.results[0]?.pending??0),
    failed:Number(usage?.results[0]?.failed??0),input:Number(usage?.results[0]?.input??0),output:Number(usage?.results[0]?.output??0),unknown:Number(usage?.results[0]?.unknown??0)}
}
export async function setAssistantEnabled(db:D1Database,actor:string,enabled:boolean):Promise<boolean> {
  const at=now(),r=await db.batch([
    db.prepare("UPDATE assistant_control SET enabled=?1,changed_at=?2,changed_by=?3 WHERE id=1 AND EXISTS(SELECT 1 FROM users WHERE id=?3 AND team='admin')").bind(enabled?1:0,at,actor),
    db.prepare(`INSERT INTO events(at,user_id,action,subject,detail) SELECT ?1,?2,'assistant.control','cloud',?3 WHERE changes()>0`)
      .bind(at,actor,JSON.stringify({enabled})),
  ])
  return (r[0]?.meta.changes??0)>0
}
