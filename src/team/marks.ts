// The one-stop shop's returns and Intrastat's reports marked as sent, the same whether the accountant does it on the
// company's own page or ticks it in the filing bundle (filings/bundle.ts): each kept with the file as it went, an event
// in the history, and for OSS a message to the client with the tax to pay.
import { BRAND } from '../config'
import { sha256Hex } from '../db'
import { formatEurExact } from '../format'
import { bell, ringStatement } from '../bell'
import { textDay } from '../app/booking'
import { eventStatement, membersOf, messageStatement, type Company } from '../app/store'
import { ossXml, quarterRange } from '../app/oss'
import { fileOssStatement, ossQuarter } from '../app/oss-store'
import { declarationsToSend, instatXml, intrastatView, settingsOf, splitAddress, type Declaration, type Flow, type IntrastatSettings, type IntrastatView, type Psi } from '../app/intrastat'
import { fileIntrastatStatement, intrastatDocs, intrastatFilings, monthsBefore } from '../app/intrastat-store'
import { team as t } from './copy'

export const BRATISLAVA_TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** The envelope's number (AAxxxxx): the month, the flow and the filing, so the file downloaded and the one kept agree. */
export const envelopeOf = (month: string, flow: Flow, seq: number): number => Number(`${month.slice(5, 7)}${flow === 'A' ? 1 : 2}${String(seq % 100).padStart(2, '0')}`)

export function psiOf(company: Company, s: IntrastatSettings): Psi | null {
  if (!company.icdph || !company.address) return null
  const a = splitAddress(company.address)
  return {
    vatId: company.icdph,
    name: company.name,
    street: a.street,
    postal: a.postal,
    city: a.city,
    address: company.address,
    contact: s.contact ?? company.accountantName,
    phone: s.phone,
    email: s.email ?? company.accountantEmail ?? BRAND.email,
  }
}

/** A bell for the client's people when a message from us waits (once, while the one before is unread). */
export async function ringClient(db: D1Database, company: Company, messageId: string, origin: string): Promise<D1PreparedStatement[]> {
  const unread = await db.prepare("SELECT 1 AS x FROM messages WHERE company_id = ? AND side = 'firmony' AND seen_at IS NULL LIMIT 1").bind(company.id).first()
  if (unread) return []
  const members = await membersOf(db, company.id)
  return members.map((m) => ringStatement(db, 'answer', messageId, m.email, bell.answer(`${origin}/app/spravy`)))
}

/** What marking came to: done, someone marked it first, it is not ready (or changed since), or the company lacks its VAT number or address. */
export type MarkResult = 'filed' | 'already' | 'notReady' | 'company'

/** The day it was sent: the one typed, when after the period and not in the future, else today. */
const sentOn = (typed: string | null, after: string, today: string): string => (typed && typed <= today && typed > after ? typed : today)

/** A fingerprint of what goes (the reports or the file), so a tick in the bundle marks only what was downloaded. */
export const fingerprint = async (text: string): Promise<string> => (await sha256Hex(text)).slice(0, 24)

/** A quarter's OSS return marked as filed, with the client told what to pay. `expect`: the fingerprint of the file sent. */
export async function markOssFiled(db: D1Database, company: Company, quarter: string, typed: string | null, today: string, by: string, origin: string, expect?: string): Promise<MarkResult> {
  if (!company.ossSince || !company.icdph) return 'company'
  const view = await ossQuarter(db, company.id, company.ossSince, quarter, today)
  if (view.filed) return 'already'
  if (view.state !== 'ready') return 'notReady'
  const xml = ossXml(company.icdph, quarter, view.lines, view.corrections)
  if (expect !== undefined && expect !== (await fingerprint(xml))) return 'notReady'
  const filedOn = sentOn(typed, quarterRange(quarter).to, today)
  const label = t.oss.quarter(quarter)
  const messageId = crypto.randomUUID()
  const body = view.total > 0 ? t.oss.message(label, formatEurExact(view.total), textDay(view.due)) : t.oss.messageNil(label)
  const done = await db.batch([
    fileOssStatement(db, company.id, view, xml, filedOn, by),
    eventStatement(db, { company: company.id, user: by, action: 'oss.filed', subject: quarter, detail: { total: view.total } }),
  ])
  if ((done[0]?.meta?.changes ?? 0) === 0) return 'already'
  await db.batch([...(await ringClient(db, company, messageId, origin)), messageStatement(db, { id: messageId, company: company.id, author: by, side: 'firmony', body, payment: null })])
  return 'filed'
}

/** A month and flow of Intrastat as it stands: what goes next (null when nothing does) and its number among the month's filings. */
export async function intrastatNext(
  db: D1Database,
  company: Company,
  month: string,
  flow: Flow,
  today: string,
): Promise<{ psi: Psi | null; view: IntrastatView; declarations: Declaration[] | null; seq: number }> {
  const settings = company.intrastat ?? settingsOf(null)
  const [docs, filings] = await Promise.all([intrastatDocs(db, company, { from: monthsBefore(month, 3) }), intrastatFilings(db, company.id)])
  const own = filings.get(`${month}:${flow}`) ?? []
  const view = intrastatView(docs, month, flow, settings, own, today)
  return { psi: psiOf(company, settings), view, declarations: declarationsToSend(view), seq: own.length + 1 }
}

/** The file of what goes next, dated now. */
export function intrastatFileOf(psi: Psi, month: string, flow: Flow, declarations: readonly Declaration[], seq: number, on: string, at = new Date()): string {
  return instatXml(psi, month, flow, declarations, envelopeOf(month, flow, seq), { date: on, time: BRATISLAVA_TIME.format(at) })
}

/** What goes next of a month and flow marked as sent, kept with its file. `expect`: the fingerprint of the reports downloaded. */
export async function markIntrastatFiled(db: D1Database, company: Company, month: string, flow: Flow, typed: string | null, today: string, by: string, expect?: string): Promise<MarkResult> {
  const { psi, view, declarations, seq } = await intrastatNext(db, company, month, flow, today)
  if (!psi) return 'company'
  if (!declarations) return view.state === 'filed' ? 'already' : 'notReady'
  if (expect !== undefined && expect !== (await fingerprint(JSON.stringify(declarations)))) return 'notReady'
  const filedOn = sentOn(typed, `${month}-31`, today)
  const xml = intrastatFileOf(psi, month, flow, declarations, seq, filedOn)
  const done = await db.batch([
    fileIntrastatStatement(db, company.id, month, flow, seq, envelopeOf(month, flow, seq), declarations, xml, filedOn, by),
    eventStatement(db, {
      company: company.id,
      user: by,
      action: 'intrastat.filed',
      subject: `${month}:${flow}`,
      detail: { seq, declarations: declarations.length, items: declarations.reduce((n, d) => n + d.items.length, 0) },
    }),
  ])
  return (done[0]?.meta?.changes ?? 0) === 0 ? 'already' : 'filed'
}
