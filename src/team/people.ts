// Everybody Firmony knows, on one page for the administrator (his word of 27 October 2026: the e-mails, contacts and
// data of every user, as much as there is, simple and clear). One row a person, by e-mail: an account (a client, the
// free invoicing, the team), a request from the site, an investor's sign-up, whatever of it the person has. Birth
// numbers and identity documents stay on the client's identification page (AML), never here.
import { INVESTORS, PLANS } from '../config'
import type { User } from '../app/store'
import { csvCell } from './store'

/**
 * The owner of Firmony: the administrator who opened the team as its first (his word of 27 October 2026: the e-mails,
 * phones and data of the people are his alone, from his own account, never an accountant's or another administrator's,
 * who could take them to a competitor or found a firm of their own with them).
 */
export async function isOwner(db: D1Database, user: Pick<User, 'id' | 'team'>): Promise<boolean> {
  if (user.team !== 'admin') return false
  const row = await db
    .prepare(
      `SELECT COALESCE((SELECT user_id FROM events WHERE action = 'team.bootstrap' ORDER BY at, id LIMIT 1),
                       (SELECT user_id FROM auth_bootstrap WHERE id = 1)) AS owner`,
    )
    .first<{ owner: string | null }>()
  return Boolean(row?.owner) && row?.owner === user.id
}

/** What a person is to us. A lead sent a request and is no client (yet). */
export type PersonKind = 'client' | 'invoicing' | 'lead' | 'investor' | 'team'
export const PERSON_KINDS: readonly PersonKind[] = ['client', 'invoicing', 'lead', 'investor', 'team']
export const KIND_NAMES: Record<PersonKind, string> = {
  client: 'Klient',
  invoicing: 'Fakturácia zadarmo',
  lead: 'Záujemca',
  investor: 'Investor',
  team: 'Tím',
}
/** The filter in the page's address, in Slovak. */
export const KIND_SLUGS: Record<PersonKind, string> = { client: 'klienti', invoicing: 'fakturacia', lead: 'zaujemcovia', investor: 'investori', team: 'tim' }

export type CompanyState = 'client' | 'ending' | 'ended' | 'invoicing' | 'none'
export const STATE_NAMES: Record<CompanyState, string> = {
  client: 'Klient',
  ending: 'Končí',
  ended: 'Skončil',
  invoicing: 'Fakturácia zadarmo',
  none: 'Bez zmluvy',
}

export interface PersonCompany {
  id: string
  name: string
  ico: string | null
  role: string
  plan: string
  state: CompanyState
  since: string | null
  endsOn: string | null
  accountant: string | null
  demo: boolean
}
export interface PersonRequest {
  id: string
  createdAt: number
  name: string
  phone: string | null
  company: string | null
  ico: string | null
  plan: string
  situation: string
  status: string
  source: string | null
  note: string | null
}
export interface PersonInvestor {
  id: string
  createdAt: number
  updatedAt: number
  brokers: string[]
  way: string | null
  source: string | null
}
export interface Person {
  /** Opaque, for the detail page's address: never the e-mail. */
  key: string
  email: string
  name: string | null
  phone: string | null
  kinds: PersonKind[]
  team: string | null
  userId: string | null
  companies: PersonCompany[]
  requests: PersonRequest[]
  investor: PersonInvestor | null
  createdAt: number
  lastSignIn: number | null
  lastActive: number | null
  passkeys: number
  reminders: boolean | null
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const latest = (...values: (number | null)[]): number | null => values.reduce<number | null>((a, b) => (b === null ? a : a === null || b > a ? b : a), null)

export function companyState(c: { invoicingOnly: boolean; contractAt: number | null; endsOn: string | null; closedAt: number | null; purgedAt: number | null }, today: string): CompanyState {
  if (c.invoicingOnly) return 'invoicing'
  if (c.purgedAt !== null || c.closedAt !== null) return 'ended'
  if (c.endsOn) return c.endsOn < today ? 'ended' : 'ending'
  return c.contractAt !== null ? 'client' : 'none'
}

/** Everybody, the latest active first. A fixed number of queries whatever the number of people. */
export async function peopleOf(db: D1Database, today: string): Promise<Person[]> {
  const [users, members, requests, orders, investors] = await db.batch<Row>([
    db.prepare(
      `SELECT u.id, u.email, u.name, u.team, u.created_at, u.reminders,
              (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkeys,
              (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS signin,
              (SELECT MAX(e.at) FROM events e WHERE e.user_id = u.id) AS active
         FROM users u`,
    ),
    db.prepare(
      `SELECT m.user_id, m.role, c.id, c.name, c.ico, c.plan, c.invoicing_only, c.contract_at, c.start_on, c.ends_on,
              c.closed_at, c.purged_at, c.demo, c.operator, a.name AS accountant
         FROM members m JOIN companies c ON c.id = m.company_id LEFT JOIN users a ON a.id = c.accountant_id
        ORDER BY m.created_at`,
    ),
    db.prepare('SELECT id, created_at, ico, company, plan, situation, name, email, phone, note, source, status FROM requests ORDER BY created_at DESC LIMIT 20000'),
    db.prepare("SELECT email, phone FROM orders WHERE phone IS NOT NULL AND phone <> '' ORDER BY created_at DESC LIMIT 20000"),
    db.prepare('SELECT id, created_at, updated_at, email, brokers, way, source FROM investor_requests LIMIT 20000'),
  ])
  const people = new Map<string, Person>()
  const keyOf = (email: string) => email.trim().toLowerCase()
  const blank = (email: string, key: string, createdAt: number): Person => ({
    key,
    email: email.trim(),
    name: null,
    phone: null,
    kinds: [],
    team: null,
    userId: null,
    companies: [],
    requests: [],
    investor: null,
    createdAt,
    lastSignIn: null,
    lastActive: null,
    passkeys: 0,
    reminders: null,
  })
  const byUser = new Map<string, Person>()
  for (const u of users?.results ?? []) {
    const email = String(u.email)
    const p = blank(email, `u-${String(u.id)}`, Number(u.created_at))
    p.userId = String(u.id)
    p.name = str(u.name)
    p.team = str(u.team)
    p.passkeys = Number(u.passkeys ?? 0)
    p.lastSignIn = num(u.signin)
    p.lastActive = latest(num(u.active), p.lastSignIn)
    p.reminders = Number(u.reminders) === 1
    people.set(keyOf(email), p)
    byUser.set(p.userId, p)
  }
  for (const m of members?.results ?? []) {
    const p = byUser.get(String(m.user_id))
    if (!p || Number(m.operator) === 1) continue
    const state = companyState(
      { invoicingOnly: Number(m.invoicing_only) === 1, contractAt: num(m.contract_at), endsOn: str(m.ends_on), closedAt: num(m.closed_at), purgedAt: num(m.purged_at) },
      today,
    )
    p.companies.push({
      id: String(m.id),
      name: String(m.name),
      ico: str(m.ico),
      role: String(m.role),
      plan: String(m.plan),
      state,
      since: str(m.start_on),
      endsOn: str(m.ends_on),
      accountant: str(m.accountant),
      demo: Number(m.demo) === 1,
    })
  }
  for (const r of requests?.results ?? []) {
    const email = String(r.email)
    let p = people.get(keyOf(email))
    if (!p) {
      p = blank(email, `r-${String(r.id)}`, Number(r.created_at))
      people.set(keyOf(email), p)
    }
    p.requests.push({
      id: String(r.id),
      createdAt: Number(r.created_at),
      name: String(r.name),
      phone: str(r.phone),
      company: str(r.company),
      ico: str(r.ico),
      plan: String(r.plan),
      situation: String(r.situation),
      status: String(r.status),
      source: str(r.source),
      note: str(r.note),
    })
  }
  for (const o of orders?.results ?? []) {
    const p = people.get(keyOf(String(o.email)))
    if (p && !p.phone) p.phone = str(o.phone)
  }
  for (const i of investors?.results ?? []) {
    const email = String(i.email)
    let p = people.get(keyOf(email))
    if (!p) {
      p = blank(email, `i-${String(i.id)}`, Number(i.created_at))
      people.set(keyOf(email), p)
    }
    p.investor = {
      id: String(i.id),
      createdAt: Number(i.created_at),
      updatedAt: Number(i.updated_at),
      brokers: typeof i.brokers === 'string' && i.brokers !== '' ? i.brokers.split(',') : [],
      way: str(i.way),
      source: str(i.source),
    }
  }
  for (const p of people.values()) {
    // Requests come newest first: the newest says the name and phone of somebody without an account.
    const newest = p.requests[0]
    if (!p.name && newest) p.name = newest.name
    const phone = p.requests.find((r) => r.phone)?.phone
    if (phone) p.phone = phone
    p.createdAt = Math.min(p.createdAt, ...p.requests.map((r) => r.createdAt), p.investor?.createdAt ?? Number.MAX_SAFE_INTEGER)
    p.lastActive = latest(p.lastActive, newest?.createdAt ?? null, p.investor?.updatedAt ?? null)
    const states = p.companies.map((c) => c.state)
    const client = states.some((s) => s === 'client' || s === 'ending' || s === 'ended' || s === 'none')
    if (client) p.kinds.push('client')
    if (states.includes('invoicing')) p.kinds.push('invoicing')
    if (p.requests.length > 0 && !client) p.kinds.push('lead')
    if (p.investor) p.kinds.push('investor')
    if (p.team) p.kinds.push('team')
  }
  return [...people.values()].sort((a, b) => (b.lastActive ?? b.createdAt) - (a.lastActive ?? a.createdAt) || a.email.localeCompare(b.email))
}

/** Every word must be found in what we know of the person. */
export function matchesSearch(p: Person, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [
    p.email,
    p.name,
    p.phone?.replace(/\s+/g, ''),
    p.phone,
    ...p.companies.flatMap((c) => [c.name, c.ico]),
    ...p.requests.flatMap((r) => [r.company, r.ico, r.name, r.source]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return words.every((w) => hay.includes(w))
}

export const planName = (plan: string): string => PLANS.find((p) => p.id === plan)?.name ?? (plan === 'mieru' ? 'Na mieru' : plan === 'neviem' ? 'Nevybraný' : plan)
export const brokerName = (id: string): string => INVESTORS.brokers.find((b) => b.id === id)?.name ?? id

const dayIso = (seconds: number | null) => (seconds === null ? '' : new Date(seconds * 1000).toISOString().slice(0, 10))

/** The list for Slovak Excel, every column a person has. */
export function peopleCsv(list: Person[]): string {
  const head = ['E-mail', 'Meno', 'Telefón', 'Kto je', 'Firmy', 'IČO', 'Balík', 'Stav firmy', 'Klient od', 'Účtovníčka', 'Prvý kontakt', 'Posledné prihlásenie', 'Posledná aktivita', 'Prihlasovacie kľúče', 'Žiadosti z webu', 'Zdroj', 'Investor: brokeri', 'Investor: spôsob']
  const lines = list.map((p) => [
    p.email,
    p.name,
    p.phone,
    p.kinds.map((k) => KIND_NAMES[k]).join(', '),
    p.companies.map((c) => c.name).join(', '),
    p.companies.map((c) => c.ico ?? '').filter(Boolean).join(', '),
    p.companies.map((c) => planName(c.plan)).join(', '),
    p.companies.map((c) => STATE_NAMES[c.state]).join(', '),
    p.companies.map((c) => c.since ?? '').filter(Boolean).join(', '),
    [...new Set(p.companies.map((c) => c.accountant ?? '').filter(Boolean))].join(', '),
    dayIso(p.createdAt),
    dayIso(p.lastSignIn),
    dayIso(p.lastActive),
    p.userId ? p.passkeys : '',
    p.requests.length || '',
    [...new Set([...p.requests.map((r) => r.source ?? ''), p.investor?.source ?? ''].filter(Boolean))].join(', '),
    p.investor ? p.investor.brokers.map(brokerName).join(', ') : '',
    p.investor?.way ?? '',
  ])
  return `﻿${[head, ...lines].map((r) => r.map((cell) => csvCell(cell as string | number | null)).join(';')).join('\r\n')}\r\n`
}

export interface PersonDetail {
  passkeys: { name: string; createdAt: number; lastUsedAt: number | null }[]
  events: { at: number; action: string; company: string | null }[]
}

/** What only one person's page shows: the passkeys by name and what the person did last. */
export async function personDetail(db: D1Database, userId: string): Promise<PersonDetail> {
  const [keys, events] = await db.batch<Row>([
    db.prepare('SELECT name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at').bind(userId),
    db
      .prepare('SELECT e.at, e.action, c.name AS company FROM events e LEFT JOIN companies c ON c.id = e.company_id WHERE e.user_id = ? ORDER BY e.at DESC, e.id DESC LIMIT 40')
      .bind(userId),
  ])
  return {
    passkeys: (keys?.results ?? []).map((k) => ({ name: String(k.name), createdAt: Number(k.created_at), lastUsedAt: num(k.last_used_at) })),
    events: (events?.results ?? []).map((e) => ({ at: Number(e.at), action: String(e.action), company: str(e.company) })),
  }
}
