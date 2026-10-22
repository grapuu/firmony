import { assistantAnswer } from './context'
import { assistantAllowed, assistantControl, finishQuestion, reserveQuestion, type AssistantScope } from './store'
import { assistantId, assistantQuestion, type AssistantAnswer } from './model'
import { classifyQuestion } from './provider'
import { getDocument, type Company } from '../app/store'

export interface AssistantResult { status:200|404|409|422|429|503; error?:string; answer?:AssistantAnswer; question:string; document:string }

export async function askAssistant(db:D1Database,key:string|undefined,s:AssistantScope,company:Company,
  fields:{id:unknown;question:unknown;document:unknown},fresh:()=>Promise<boolean>):Promise<AssistantResult> {
  const question=assistantQuestion(fields.question),document=typeof fields.document==='string'?fields.document:'',id=fields.id
  const base={question:typeof fields.question==='string'?fields.question.slice(0,1200):'',document}
  const fail=(status:Exclude<AssistantResult['status'],200>,error:string):AssistantResult=>({...base,status,error})
  if(!question)return fail(422,'Napíšte otázku najviac na 1 200 znakov. Neposielajte prílohy, heslá ani údaje, ktoré s otázkou nesúvisia.')
  if(!assistantId(id))return fail(422,'Otvorte novú otázku a odošlite ju znova.')
  if(document&&!/^[A-Za-z0-9-]{1,64}$/.test(document))return fail(404,'Doklad nie je dostupný.')
  if(!await fresh()||!await assistantAllowed(db,s))return fail(409,'Prihlásený účet, firma alebo oprávnenie sa zmenili. Obnovte stránku pred ďalším krokom.')
  if(document&&!await getDocument(db,s.company,document))return fail(404,'Doklad nie je dostupný.')
  if(!key||!(await assistantControl(db)).enabled)return fail(503,'AI teraz nie je dostupná. Vyberte rýchlu otázku nižšie alebo pripravte otázku účtovníčke.')
  const requestId=id.toLowerCase()
  let reservation:Awaited<ReturnType<typeof reserveQuestion>>
  try{reservation=await reserveQuestion(db,s,requestId,question,document)}catch{return fail(503,'Uloženie otázky nevieme potvrdiť. Váš text zostáva vo formulári. Vyberte rýchlu otázku alebo pripravte otázku účtovníčke.')}
  if(reservation.kind==='conflict')return fail(409,'Toto odoslanie už patrí inej otázke. Použite Novú otázku; Váš text zostáva vo formulári.')
  if(reservation.kind==='limit')return fail(429,'Teraz sme dosiahli limit AI otázok alebo sa ešte spracúva predošlá. Rýchle otázky a kontakt s účtovníčkou môžete použiť hneď.')
  if(reservation.kind==='pending')return fail(409,'Spracovanie tejto otázky ešte nemáme potvrdené. Opakované odoslanie nespustí ďalšie volanie. Použite rýchlu otázku alebo pripravte správu účtovníčke.')
  if(reservation.kind==='unavailable')return fail(503,'Výsledok AI teraz nevieme potvrdiť. Váš text zostáva vo formulári; rýchle otázky a účtovníčka sú dostupné.')
  let topic=reservation.kind==='cached'?reservation.topic:null
  if(reservation.kind==='new') {
    const result=await classifyQuestion(key,question)
    const freshAccess=await fresh()
    let saved=false
    try{saved=await finishQuestion(db,s,requestId,freshAccess?result:null)}catch{return fail(503,'Uloženie výsledku nemáme potvrdené. Opakované odoslanie nespustí ďalšie volanie. Váš text zostáva vo formulári a môžete ho odovzdať účtovníčke.')}
    if(!freshAccess)return fail(409,'Prihlásený účet, firma alebo oprávnenie sa zmenili. Obnovte stránku pred ďalším krokom.')
    if(!saved||!result)return fail(503,'Výsledok AI teraz nevieme spoľahlivo potvrdiť. Vyberte rýchlu otázku alebo pripravte otázku účtovníčke.')
    topic=result.topic
  }
  if(!topic||!await fresh())return fail(409,'Účet alebo firma sa zmenili. Obnovte stránku.')
  const answer=await assistantAnswer(db,s,company,topic,document)
  if(!answer||!await fresh())return fail(404,'Údaje už nie sú dostupné pre tento účet.')
  return {...base,status:200,answer}
}
