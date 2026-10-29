// A client won at a meeting (his word of 29 October 2026, 23:29 and 23:33): the designated person starts the order on
// his phone from the register, the director's phone joins it by a QR code, the director fills in the declaration there,
// the designated person verifies the identification in person (aml/in-person.ts), records the prepared checks and
// approves, both sign the contract on paper, and the director's phone opens the app. Every step is a state the database
// already holds: nothing is kept about a meeting but who started it, when the director's phone first opened it and when
// it signed in. Both pages follow it by asking for `stateOf` every few seconds (public/live.js).
import { getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { sha256Hex } from '../db'
import type { Order } from '../order'

/** Where a meeting stands, in the order its steps come. */
export type MeetingStep = 'connect' | 'declare' | 'identify' | 'approve' | 'sign' | 'enter' | 'done'

export interface MeetingFacts {
  status: string
  seen: boolean
  dossier: string | null
  /** The in-person identification of the newest dossier. */
  identified: boolean
  checks: number
  decision: number | null
  company: string | null
  entered: boolean
}

export async function meetingFacts(db: D1Database, orderId: string): Promise<MeetingFacts | null> {
  const row = await db.prepare(`SELECT o.status, o.company_id, o.meeting_seen_at, o.meeting_entered_at, d.id AS dossier,
      EXISTS (SELECT 1 FROM aml_in_person p WHERE p.dossier_id = d.id AND p.facts_hash = d.facts_hash) AS identified,
      (SELECT COUNT(*) FROM aml_checks k WHERE k.dossier_id = d.id) AS checks,
      (SELECT MAX(a.id) FROM aml_decisions a WHERE a.dossier_id = d.id) AS decision
    FROM orders o LEFT JOIN aml_dossiers d ON d.id = (SELECT n.id FROM aml_dossiers n WHERE n.order_id = o.id ORDER BY n.sequence DESC LIMIT 1)
    WHERE o.id = ? AND o.meeting_by IS NOT NULL`).bind(orderId).first<Record<string, unknown>>()
  if (!row) return null
  return {
    status: String(row.status), seen: row.meeting_seen_at !== null, dossier: typeof row.dossier === 'string' ? row.dossier : null,
    identified: row.identified === 1, checks: Number(row.checks ?? 0), decision: typeof row.decision === 'number' ? row.decision : null,
    company: typeof row.company_id === 'string' ? row.company_id : null, entered: row.meeting_entered_at !== null,
  }
}

/**
 * The step a meeting is at. `admitted` says whether the designated person's approval stands (admissionForOrder): a
 * decision alone may be a hold or one an edit made stale.
 */
export function stepOf(f: MeetingFacts, admitted: boolean): MeetingStep {
  if (f.company) return f.entered ? 'done' : 'enter'
  if (!f.seen && !f.dossier) return 'connect'
  if (!f.dossier) return 'declare'
  if (!f.identified) return 'identify'
  return admitted ? 'sign' : 'approve'
}

/** What a page asks for every few seconds: a change of it loads the page again. The director's page needs less of it. */
export function stateText(f: MeetingFacts, side: 'desk' | 'client'): string {
  return side === 'desk'
    ? [f.status, f.seen ? 1 : 0, f.dossier ?? '', f.identified ? 1 : 0, f.checks, f.decision ?? '', f.company ?? '', f.entered ? 1 : 0].join(':')
    : [f.status, f.dossier ?? '', f.identified ? 1 : 0, f.company ?? '', f.entered ? 1 : 0].join(':')
}

/**
 * The link the director's phone opens lives only in the order's hash and in a cookie of the designated person's own
 * browser, kept for this meeting's pages alone: so his page can show the same QR code again after a reload, and nothing
 * else ever holds it.
 */
const cookieOf = (c: Context) => (new URL(c.req.url).protocol === 'https:' ? '__Secure-firmony-meeting' : 'firmony-meeting')
export function keepLink(c: Context, orderId: string, token: string): void {
  setCookie(c, cookieOf(c), token, { path: `/ucto/stretnutie/${orderId}`, httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', maxAge: 86400 })
}
/** The token of the director's link, when this browser started it and it still opens the order. */
export async function keptLink(c: Context, order: Order): Promise<string | null> {
  const token = getCookie(c, cookieOf(c)) ?? ''
  return /^[A-Za-z0-9_-]{43}$/.test(token) && order.tokenHash && (await sha256Hex(token)) === order.tokenHash ? token : null
}

/** "Peter" of "Ing. Peter Novák, PhD.": the given name, for a greeting. */
export function firstName(name: string): string {
  const words = name.replace(/,.*$/, '').split(/\s+/).filter((w) => w && !/\.$/.test(w))
  return words[0] ?? name
}
