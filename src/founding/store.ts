// The s. r. o. for 1 € in the database: an application reached by its links, its files in R2 under foundings/<id>/, the
// designated person's checks and decision, every move with who made it, and at the end the company it gave rise to.
// Every write names the revision it read (`rev`) and moves it: two tabs, two people or a link opened twice never move an
// application twice, and nothing is written over what somebody else changed meanwhile.
import { LEAST_LOADED_ACCOUNTANT_SQL } from '../team/assign'
import { BRAND, FORMATION, OFFLINE_TERMS, TEAM, planById } from '../config'
import { now, sha256Hex } from '../db'
import { userByEmail } from '../app/store'
import { newLink, newToken } from '../app/session'
import { sniffPaper } from '../app/papers'
import { operatorOf, priceListTariff } from '../team/billing-store'
import { inboxCode } from '../team/store'
import { lookupCompany } from '../rpo'
import { bell, ringStatement } from '../bell'
import { bratislavaDay } from '../time'
import { queueIfChangedStatement } from '../mail'
import { textDay } from '../app/booking'
import { formationContractText } from '../content/formation-contract'
import { bytesHash } from '../aml/store'
import { quoteSql } from '../aml/model'
import { FINAL, FOUNDING_TOTAL, IDENTITY_NOTE, checksNeeded, editable, foundingOf, foundingVs, identityStands, identityWaysOf, mayMove, stepsOf, type CheckKind, type IdentityWay, type Founder, type Founding, type FoundingStatus, type PlannedCompany } from './model'

const DAY = 86_400
/** A link to an application works this long; every email to the founder carries a new one. */
const LINK_DAYS = 180

type Env = { DB: D1Database; FILES?: R2Bucket }

export async function foundingById(db: D1Database, id: string): Promise<Founding | null> {
  const row = await db.prepare('SELECT * FROM foundings WHERE id = ? AND purge_started_at IS NULL').bind(id).first<Record<string, unknown>>()
  return row ? foundingOf(row) : null
}

/** A new link to an application, kept by its hash: the statement that keeps it, and the token for the email. */
export async function linkStatement(db: D1Database, foundingId: string): Promise<{ token: string; statement: D1PreparedStatement }> {
  const token = newToken()
  const ts = now()
  return { token, statement: db.prepare('INSERT INTO founding_links (token, founding_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), foundingId, ts, ts + LINK_DAYS * DAY) }
}

/**
 * The application of a link, or null. An open one past its days lapses here, when it is next looked at: nothing was
 * paid or ordered by then, and its files go (the founder can apply again).
 */
export async function foundingByToken(env: Env, token: string): Promise<Founding | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const row = await env.DB.prepare(
    'SELECT f.* FROM founding_links l JOIN foundings f ON f.id = l.founding_id WHERE l.token = ? AND l.expires_at > ? AND f.purge_started_at IS NULL',
  )
    .bind(await sha256Hex(token), now())
    .first<Record<string, unknown>>()
  if (!row) return null
  const f = foundingOf(row)
  if (f.status === 'open' && f.expiresAt < now() && !f.paidAt) {
    if (await move(env.DB, f, null, 'lapsed', 'Prihláška nebola dokončená včas.')) await dropFiles(env.FILES, f)
    return foundingById(env.DB, f.id)
  }
  return f
}

/** The latest application of an address that is still going: asked for again, it gets a new link instead of a twin. */
export async function liveFoundingOf(db: D1Database, email: string): Promise<Founding | null> {
  const row = await db
    .prepare(`SELECT * FROM foundings WHERE email = ? AND purge_started_at IS NULL AND status NOT IN (${FINAL.map((s) => `'${s}'`).join(',')}) ORDER BY created_at DESC LIMIT 1`)
    .bind(email.toLowerCase())
    .first<Record<string, unknown>>()
  const f = row ? foundingOf(row) : null
  // An open one past its days is no longer going (it lapses when its link is opened).
  return f && !(f.status === 'open' && f.expiresAt < now() && !f.paidAt) ? f : null
}

/**
 * A new application, or a new link to the one this address has going, rung to the address. The symbol of a new
 * application's payment is the next free one of the year.
 */
export async function applyFor(db: D1Database, input: { email: string; phone: string | null; plan: string; source?: Record<string, string> | null }, origin: string): Promise<string> {
  const email = input.email.toLowerCase()
  const live = await liveFoundingOf(db, email)
  if (live) {
    const link = await linkStatement(db, live.id)
    await db.batch([link.statement, ringStatement(db, 'founding-link', `${live.id}:${crypto.randomUUID()}`, email, bell.foundingLink(`${origin}/zalozenie/${link.token}`, FORMATION.applyDays))])
    return live.id
  }
  const year = Number(bratislavaDay(now()).slice(0, 4))
  const ts = now()
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.prepare('SELECT COUNT(*) AS n FROM foundings WHERE substr(vs, 2, 4) = ?').bind(String(year)).first<{ n: number }>()
    const vs = foundingVs(year, Number(count?.n ?? 0) + 1 + attempt)
    const id = crypto.randomUUID()
    const link = await linkStatement(db, id)
    try {
      await db.batch([
        db
          .prepare('INSERT INTO foundings (id, created_at, expires_at, email, phone, plan, source, vs, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, ts, ts + FORMATION.applyDays * DAY, email, input.phone, planById(input.plan)?.id ?? 'start', input.source && Object.keys(input.source).length > 0 ? JSON.stringify(input.source) : null, vs, ts),
        eventRow(db, id, null, 'created', 'open', ''),
        link.statement,
        ringStatement(db, 'founding-link', `${id}:${ts}`, email, bell.foundingLink(`${origin}/zalozenie/${link.token}`, FORMATION.applyDays)),
      ])
      return id
    } catch (error) {
      if (!/UNIQUE/i.test(error instanceof Error ? error.message : '')) throw error
    }
  }
  throw new Error('no free payment symbol')
}

/**
 * A reminder to the founder of an application still open (team/nudge.ts), once for each of its steps since `since` (the
 * day the application opened or was returned): recorded among its events, then rung with a new link and the day it is
 * open until. A run that finds the step recorded, or the application handed over meanwhile, sends nothing.
 */
export async function nudgeFounder(db: D1Database, f: Founding, step: number, since: number, origin: string, ts: number = now()): Promise<boolean> {
  const link = await linkStatement(db, f.id)
  const note = `Pripomienka ${step + 1}`
  const [recorded] = await db.batch([
    db
      .prepare(
        `INSERT INTO founding_events (id, founding_id, at, by, action, status, note) SELECT ?1, ?2, ?3, NULL, 'nudged', 'open', ?4
          WHERE EXISTS (SELECT 1 FROM foundings WHERE id = ?2 AND status = 'open' AND expires_at > ?3 AND purge_started_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM founding_events WHERE founding_id = ?2 AND action = 'nudged' AND note = ?4 AND at >= ?5)`,
      )
      .bind(crypto.randomUUID(), f.id, ts, note, since),
    queueIfChangedStatement(db, {
      key: `bell:founding-nudge:${f.id}:${since}:${step}:${f.email.toLowerCase()}`,
      to: f.email,
      ...bell.foundingNudge(`${origin}/zalozenie/${link.token}`, textDay(bratislavaDay(f.expiresAt - DAY))),
    }),
    link.statement,
  ])
  return (recorded?.meta?.changes ?? 0) === 1
}

function eventRow(db: D1Database, founding: string, by: string | null, action: string, status: FoundingStatus, note: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO founding_events (id, founding_id, at, by, action, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), founding, now(), by, action, status, note.slice(0, 2000))
}

/** An event written only when the statement before it changed the application (the revision it read still held). */
function eventIfChanged(db: D1Database, founding: string, by: string | null, action: string, status: FoundingStatus, note: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO founding_events (id, founding_id, at, by, action, status, note) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1')
    .bind(crypto.randomUUID(), founding, now(), by, action, status, note.slice(0, 2000))
}

/** An update of the application from the revision it was read at; `set` is SQL with its own placeholders first. */
function update(db: D1Database, f: Founding, set: string, values: unknown[], extra = ''): D1PreparedStatement {
  return db.prepare(`UPDATE foundings SET ${set}, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?${extra}`).bind(...values, now(), f.id, f.rev)
}

const changed = (result: D1Result | undefined) => (result?.meta?.changes ?? 0) === 1

/** A move of the application, only from the revision it was read at and only where the rules let it go. */
function moveBatch(db: D1Database, f: Founding, by: string | null, to: FoundingStatus, note: string): D1PreparedStatement[] {
  return [update(db, f, 'status = ?', [to], ` AND status = ${quoteSql(f.status)}`), eventIfChanged(db, f.id, by, 'moved', to, note)]
}

export async function move(db: D1Database, f: Founding, by: string | null, to: FoundingStatus, note: string, also: D1PreparedStatement[] = []): Promise<boolean> {
  if (!mayMove(f.status, to)) return false
  const [result] = await db.batch([...moveBatch(db, f, by, to, note), ...also])
  return changed(result)
}

/**
 * The founder's and the company's data. Any change takes back the contract given to sign, so that what the founder
 * signs is the contract as the data are now (a signature on an earlier text no longer counts, stepsOf).
 */
export async function saveData(db: D1Database, f: Founding, founder: Founder, company: PlannedCompany, phone: string | null): Promise<boolean> {
  if (!editable(f)) return false
  const [result] = await db.batch([
    update(db, f, 'founder = ?, company = ?, phone = ?, data_at = ?, contract_text = NULL, contract_hash = NULL, contract_version = NULL', [JSON.stringify(founder), JSON.stringify(company), phone, now()], " AND status = 'open'"),
    eventIfChanged(db, f.id, null, 'data', 'open', ''),
  ])
  return changed(result)
}

const ID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
export const ID_BYTES = 10 * 1024 * 1024
export const SIGNED_BYTES = 25 * 1024 * 1024

/** A photo of the identity document, one side: a picture or a PDF by its bytes, up to 10 MB. */
export async function saveIdSide(env: Env, f: Founding, side: 'front' | 'back', bytes: Uint8Array): Promise<'saved' | 'type' | 'size' | 'state' | 'storage'> {
  if (!editable(f)) return 'state'
  if (!env.FILES) return 'storage'
  if (bytes.length > ID_BYTES) return 'size'
  const type = sniffPaper(bytes)
  if (!type || !ID_TYPES.has(type.type)) return 'type'
  const key = `foundings/${f.id}/id/${side}-${crypto.randomUUID()}.${type.ext}`
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: type.type } })
  const [result] = await env.DB.batch([
    update(env.DB, f, `${side === 'front' ? 'id_front_key' : 'id_back_key'} = ?, id_at = ?`, [key, now()], " AND status = 'open'"),
    eventIfChanged(env.DB, f.id, null, `id-${side}`, 'open', ''),
  ])
  if (!changed(result)) {
    await env.FILES.delete(key).catch(() => undefined)
    return 'state'
  }
  const old = side === 'front' ? f.idFrontKey : f.idBackKey
  if (old) await env.FILES.delete(old).catch(() => undefined)
  return 'saved'
}

/** The account and the symbol the contract names for the payment: europio's account for invoices. */
export async function paymentTarget(db: D1Database, f: Founding): Promise<{ iban: string; vs: string; beneficiary: string } | null> {
  const operator = await operatorOf(db)
  return operator?.invoiceIban ? { iban: operator.invoiceIban, vs: f.vs, beneficiary: operator.name } : null
}

const TURNOVER_WORDS: Record<string, string> = { 'do-50': 'do 50 000 €', '50-200': '50 000 až 200 000 €', '200-1000': '200 000 až 1 000 000 €', 'nad-1000': 'viac ako 1 000 000 €' }
const skDay = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`

/**
 * The founder's declaration that goes with the contract and is signed with it (§ 7 and § 10 of Act No. 297/2008 Z. z.):
 * identity, the document, a politically exposed person, own behalf, the source of the capital and what the company
 * will do with money.
 */
function annexOf(p: Founder, c: PlannedCompany): string {
  return [
    'Príloha: Vyhlásenie zakladateľa',
    `Meno a priezvisko: ${p.name}. ${p.birthNumber ? `Rodné číslo: ${p.birthNumber}. ` : ''}Dátum narodenia: ${skDay(p.born)}.`,
    `Trvalý pobyt: ${p.address}. Štátne občianstvo: ${p.nationality}.`,
    `Doklad totožnosti: ${p.idKind === 'pas' ? 'cestovný pas' : 'občiansky preukaz'} č. ${p.idNumber}, platný do ${skDay(p.idValid)}.`,
    `Politicky exponovaná osoba: ${p.pep ? 'áno' : 'nie'}. Konám vo vlastnom mene a na vlastný účet: áno.`,
    `Pôvod peňazí na základné imanie ${c.capitalCents / 100} €: ${p.funds}.`,
    `Očakávaný ročný obrat spoločnosti: ${TURNOVER_WORDS[p.turnover] ?? p.turnover}. Hotovosť nad 10 000 € naraz: ${p.cash ? 'áno' : 'nie'}. Pravidelní partneri mimo EÚ: ${p.abroad.trim() || 'nie'}.`,
    'Záväzne vyhlasujem, že údaje sú pravdivé a úplné a že zmenu oznámim bez zbytočného odkladu.',
  ].join('\n')
}

/**
 * The contract for the data as they are: its text and a hash of it, so that a signature uploaded later is known to be on
 * exactly this text. Null until the data and the account for payments exist.
 */
export async function contractOf(db: D1Database, f: Founding): Promise<{ text: string; hash: string } | null> {
  if (!f.founder || !f.company) return null
  const target = await paymentTarget(db, f)
  if (!target) return null
  const plan = planById(f.plan)
  const text = formationContractText(
    {
      founder: { name: f.founder.name, born: skDay(f.founder.born), address: f.founder.address },
      company: f.company,
      plan: { name: plan?.name ?? f.plan, priceCents: (plan?.price ?? 0) * 100 },
      payment: { iban: target.iban, vs: target.vs },
    },
    FORMATION.contractVersion,
    annexOf(f.founder, f.company),
  )
  return { text, hash: await sha256Hex(text) }
}

/**
 * The contract given to the founder to sign: kept as given while the application is open (once for the same text), the
 * kept one after. Null without data or an account for payments.
 */
export async function fixContract(db: D1Database, f: Founding): Promise<{ text: string; hash: string } | null> {
  if (!editable(f)) return f.contractText && f.contractHash ? { text: f.contractText, hash: f.contractHash } : null
  const contract = await contractOf(db, f)
  if (!contract) return null
  if (f.contractHash !== contract.hash) {
    const [result] = await db.batch([update(db, f, 'contract_text = ?, contract_hash = ?, contract_version = ?', [contract.text, contract.hash, FORMATION.contractVersion], " AND status = 'open'")])
    if (!changed(result)) return null
  }
  return contract
}

/**
 * The signed contract: a container of a qualified electronic signature (.asice) or a signed PDF, or for paper a scan
 * of the page with the officially certified signature (PDF or a picture). Kept with the hash of the contract given to
 * sign; the designated person checks the signature itself and that it is on that text (the hash printed in the PDF).
 */
export async function saveSigned(env: Env, f: Founding, kind: 'qes' | 'paper', bytes: Uint8Array): Promise<'saved' | 'type' | 'size' | 'state' | 'storage' | 'contract'> {
  if (!editable(f)) return 'state'
  if (!env.FILES) return 'storage'
  if (!f.contractHash) return 'contract'
  if (bytes.length > SIGNED_BYTES) return 'size'
  const type = sniffPaper(bytes)
  const ok = type && (kind === 'qes' ? ['asice', 'asics', 'pdf'].includes(type.ext) : ['pdf', 'jpg', 'png', 'webp'].includes(type.ext))
  if (!type || !ok) return 'type'
  const key = `foundings/${f.id}/signed/${crypto.randomUUID()}.${type.ext}`
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: type.type } })
  const [result] = await env.DB.batch([
    update(env.DB, f, 'signed_key = ?, signed_kind = ?, signed_hash = ?, signed_contract_hash = contract_hash, signed_at = ?', [key, kind, await bytesHash(bytes), now()], ` AND status = 'open' AND contract_hash = ${quoteSql(f.contractHash)}`),
    eventIfChanged(env.DB, f.id, null, 'signed', 'open', kind === 'qes' ? 'elektronicky' : 'na papieri'),
  ])
  if (!changed(result)) {
    await env.FILES.delete(key).catch(() => undefined)
    return 'state'
  }
  if (f.signedKey) await env.FILES.delete(f.signedKey).catch(() => undefined)
  return 'saved'
}

/**
 * The payment of an application, read from europio's own bank (its payments as any company's: a statement, a link):
 * money in, in euros, with the application's symbol, together at least the amount due. Kept once, with who paid it from
 * where; the designated person checks that the account is the founder's.
 */
export async function notePayment(db: D1Database, f: Founding): Promise<Founding> {
  if (f.paidAt || FINAL.includes(f.status)) return f
  const operator = await operatorOf(db)
  if (!operator) return f
  const rows = await db
    .prepare(
      "SELECT id, amount_cents, party, party_iban FROM payments WHERE company_id = ? AND amount_cents > 0 AND currency = 'EUR' AND ltrim(COALESCE(vs, ''), '0') = ltrim(?, '0') ORDER BY booked_on, id LIMIT 10",
    )
    .bind(operator.id, f.vs)
    .all<{ id: string; amount_cents: number; party: string | null; party_iban: string | null }>()
  const list = rows.results ?? []
  const total = list.reduce((s, r) => s + Number(r.amount_cents), 0)
  const first = list[0]
  if (!first || total < FOUNDING_TOTAL) return f
  await db.batch([
    db
      .prepare('UPDATE foundings SET payment_id = ?, paid_cents = ?, paid_at = ?, payer_name = ?, payer_iban = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND paid_at IS NULL')
      .bind(first.id, total, now(), first.party, first.party_iban, now(), f.id),
    eventIfChanged(db, f.id, null, 'paid', f.status, `${(total / 100).toFixed(2)} € z účtu ${first.party_iban ?? 'neznámeho'}`),
  ])
  return (await foundingById(db, f.id)) ?? f
}

/** The founder hands the application over for checking: data, the document, the signature on this contract. */
export async function handOver(db: D1Database, f: Founding, origin: string): Promise<'ok' | 'steps' | 'state'> {
  const steps = stepsOf(f)
  if (!steps.data || !steps.id || !steps.signed) return 'steps'
  if (f.status !== 'open') return 'state'
  // Rung at our own address, as a request from the site is: the designated person reads it there.
  const ok = await move(db, f, null, 'verifying', 'Prihláška odovzdaná na overenie.', [
    ringStatement(db, 'founding-team', `${f.id}:${f.rev}`, BRAND.email, bell.teamFounding(`${origin}/ucto/zalozenia/${f.id}`)),
  ])
  return ok ? 'ok' : 'state'
}

/** The founder takes an open application back before paying: it and its files go at once. */
export async function withdrawOpen(env: Env, f: Founding): Promise<boolean> {
  if (f.status !== 'open' || f.paidAt) return false
  const ok = await move(env.DB, f, null, 'cancelled', 'Zakladateľ prihlášku zrušil.')
  if (ok) await dropFiles(env.FILES, f)
  return ok
}

export interface FoundingCheck {
  kind: CheckKind
  result: 'clear' | 'problem'
  note: string
  at: number
  byName: string | null
}

export async function checksOf(db: D1Database, id: string): Promise<FoundingCheck[]> {
  const rows = await db
    .prepare('SELECT k.kind, k.result, k.note, k.at, u.name AS by_name FROM founding_checks k LEFT JOIN users u ON u.id = k.by WHERE k.founding_id = ? ORDER BY k.at, k.rowid')
    .bind(id)
    .all<{ kind: CheckKind; result: 'clear' | 'problem'; note: string; at: number; by_name: string | null }>()
  return (rows.results ?? []).map((r) => ({ kind: r.kind, result: r.result, note: r.note, at: Number(r.at), byName: r.by_name }))
}

/** The latest check of each kind: what counts now. */
export function latestChecks(list: readonly FoundingCheck[]): Map<CheckKind, FoundingCheck> {
  const out = new Map<CheckKind, FoundingCheck>()
  for (const c of list) out.set(c.kind, c)
  return out
}

/**
 * A check of the designated person, while the application waits for one; the original's arrival is kept on it too. A
 * clear identity names the way it was verified, one the signature allows (identityWaysOf), first in its note.
 */
export async function recordCheck(db: D1Database, f: Founding, by: string, kind: CheckKind, result: 'clear' | 'problem', note: string, way?: IdentityWay): Promise<boolean> {
  if (f.status !== 'verifying' || !checksNeeded(f).includes(kind)) return false
  if (kind === 'identity' && result === 'clear') {
    if (!way || !identityWaysOf(f).includes(way)) return false
    note = `${IDENTITY_NOTE[way]} ${note}`
  }
  const [first] = await db.batch([
    db
      .prepare("INSERT INTO founding_checks (id, founding_id, at, by, kind, result, note) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM foundings WHERE id = ? AND status = 'verifying')")
      .bind(crypto.randomUUID(), f.id, now(), by, kind, result, note.slice(0, 2000), f.id),
    ...(kind === 'original' && result === 'clear'
      ? [db.prepare("UPDATE foundings SET original_at = ?, original_by = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND status = 'verifying' AND original_at IS NULL").bind(now(), by, now(), f.id)]
      : []),
  ])
  return changed(first)
}

export const CHECK_NAMES: Record<CheckKind, string> = {
  identity: 'Totožnosť',
  pep: 'Politicky exponovaná osoba',
  sanctions: 'Sankčné zoznamy',
  debts: 'Dlžníci a úpadcovia',
  signature: 'Podpis zmluvy',
  payment: 'Platba z vlastného účtu',
  original: 'Originál zmluvy',
}

/** What still keeps an application from being verified, in words the designated person reads; empty when nothing. */
export async function verifyBlockers(db: D1Database, f: Founding): Promise<string[]> {
  const out: string[] = []
  const steps = stepsOf(f)
  if (f.status !== 'verifying') out.push('Prihláška nie je odovzdaná na overenie.')
  if (!steps.data || !steps.id || !steps.signed) out.push('Zakladateľ ešte nedokončil údaje, doklad alebo podpis zmluvy.')
  if (!steps.paid) out.push(`Platba ${(FOUNDING_TOTAL / 100).toFixed(0)} € ešte neprišla na účet europio.`)
  const latest = latestChecks(await checksOf(db, f.id))
  for (const kind of checksNeeded(f)) {
    const ok = kind === 'identity' ? identityStands(f, latest.get(kind)) : latest.get(kind)?.result === 'clear'
    if (!ok) out.push(`Kontrola „${CHECK_NAMES[kind]}“ nie je v poriadku.`)
  }
  return out
}

const COUNTED = "status NOT IN ('open','verifying','refused','lapsed','cancelled')"

/**
 * The month an application is planned in: this one while fewer than the offer's limit were verified for it, else the
 * next month that still has room.
 */
export async function monthFor(db: D1Database, today: string): Promise<string> {
  let month = today.slice(0, 7)
  for (let i = 0; i < 24; i++) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM foundings WHERE month = ? AND ${COUNTED}`).bind(month).first<{ n: number }>()
    if (Number(row?.n ?? 0) < FORMATION.perMonth) return month
    const [y, m] = month.split('-').map(Number) as [number, number]
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return month
}

/** Places left this month: what the offer's page says. */
export async function placesLeft(db: D1Database, today: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM foundings WHERE month = ? AND ${COUNTED}`).bind(today.slice(0, 7)).first<{ n: number }>()
  return Math.max(0, FORMATION.perMonth - Number(row?.n ?? 0))
}

/**
 * The designated person's decision: 'verified' (the contract arises, article 10, and the advocate may be ordered),
 * 'refused' (the payment goes back) or 'open' (back to the founder to complete, with new days). The founder is told why.
 */
export async function decide(db: D1Database, f: Founding, by: string, verdict: 'verified' | 'refused' | 'open', note: string, today: string, link: string): Promise<'ok' | 'blocked' | 'state'> {
  if (f.status !== 'verifying') return 'state'
  if (verdict === 'verified' && (await verifyBlockers(db, f)).length > 0) return 'blocked'
  const month = verdict === 'verified' ? await monthFor(db, today) : null
  const words =
    verdict === 'verified'
      ? `Prihláška je overená a zmluva vznikla. Advokáta objednáme do piatich pracovných dní. Založenie je naplánované na mesiac ${month}.${note ? ` ${note}` : ''}`
      : verdict === 'refused'
        ? `Prihlášku sme nemohli prijať. ${note} Platbu, ak prišla, vrátime na účet, z ktorého prišla, do 14 dní.`
        : `Prihlášku sme Vám vrátili na doplnenie: ${note}`
  const [result] = await db.batch([
    update(db, f, 'status = ?, month = COALESCE(?, month), expires_at = ?', [verdict, month, verdict === 'open' ? now() + FORMATION.applyDays * DAY : f.expiresAt], " AND status = 'verifying'"),
    eventIfChanged(db, f.id, by, 'decided', verdict, note),
    eventIfChanged(db, f.id, by, 'note', verdict, words),
  ])
  if (!changed(result)) return 'state'
  await notify(db, f, link)
  return 'ok'
}

/**
 * A doorbell to the founder with a new link to the application, where what we wrote is read. Sent once the change it
 * tells of is written (never for a change that did not happen).
 */
async function notify(db: D1Database, f: Founding, origin: string): Promise<void> {
  const link = await linkStatement(db, f.id)
  await db.batch([link.statement, ringStatement(db, 'founding-news', `${f.id}:${crypto.randomUUID()}`, f.email, bell.foundingNews(`${origin}/zalozenie/${link.token}`))])
}

const MOVE_NOTES: Partial<Record<FoundingStatus, string>> = {
  ordered: 'Advokát pripravuje zakladateľskú listinu a ostatné dokumenty. Ozve sa Vám s nimi na podpis.',
  signing: 'Dokumenty od advokáta sú pripravené na podpis. Podpíšte ich, prosím, a splaťte základné imanie podľa pokynov advokáta.',
  filed: 'Návrh na zápis do obchodného registra je podaný na súd. Keď súd firmu zapíše, dáme Vám vedieť.',
}

/** The formation moves on (ordered, signing, filed), and the founder is told where it stands. */
export async function advance(db: D1Database, f: Founding, by: string, to: 'ordered' | 'signing' | 'filed', note: string, origin: string): Promise<boolean> {
  const ok = await move(db, f, by, to, note, [eventIfChanged(db, f.id, by, 'note', to, note || MOVE_NOTES[to] || '')])
  if (ok) await notify(db, f, origin)
  return ok
}

/**
 * A call to the founder for what the advocate needs (article 4 of the contract): counted, dated, said in the
 * application and rung by email. After the second, and the contract's days after it, the application may be withdrawn.
 */
export async function callFounder(db: D1Database, f: Founding, by: string, text: string, origin: string): Promise<boolean> {
  if (!['verified', 'ordered', 'signing', 'filed'].includes(f.status)) return false
  const [result] = await db.batch([
    update(db, f, 'calls = calls + 1, called_at = ?', [now()]),
    eventIfChanged(db, f.id, by, 'call', f.status, `${f.calls + 1}. výzva: ${text}`),
  ])
  if (!changed(result)) return false
  await notify(db, f, origin)
  return true
}

/** Whether the founder's silence lets us withdraw: two calls made and the contract's days gone since the second. */
export const mayWithdraw = (f: Founding, at = now()) => ['verified', 'ordered', 'signing', 'filed'].includes(f.status) && f.calls >= 2 && f.calledAt !== null && at - f.calledAt >= FORMATION.cooperateDays * DAY

/** We withdraw for the founder's silence (article 5): the payment is kept. */
export async function withdraw(db: D1Database, f: Founding, by: string, note: string, origin: string): Promise<boolean> {
  if (!mayWithdraw(f)) return false
  const words = `Ani po druhej výzve a ${FORMATION.cooperateDays} dňoch sme nedostali potrebnú súčinnosť, preto od zmluvy odstupujeme podľa článku 5. Zaplatená suma sa podľa zmluvy nevracia. ${note}`
  const ok = await move(db, f, by, 'withdrawn', note, [eventIfChanged(db, f.id, by, 'note', 'withdrawn', words)])
  if (ok) await notify(db, f, origin)
  return ok
}

/** We cancel an application (our reason): a payment that came goes back in full, which is recorded when it is sent. */
export async function cancel(db: D1Database, f: Founding, by: string, note: string, origin: string): Promise<boolean> {
  const ok = await move(db, f, by, 'cancelled', note, [eventIfChanged(db, f.id, by, 'note', 'cancelled', `Prihlášku sme zrušili. ${note}`)])
  if (ok) await notify(db, f, origin)
  return ok
}

/** A note to the founder in the application (what the advocate needs, where the formation stands), rung by email. */
export async function noteToFounder(db: D1Database, f: Founding, by: string, text: string, origin: string): Promise<void> {
  await db.batch([eventRow(db, f.id, by, 'note', f.status, text)])
  await notify(db, f, origin)
}

/** The payment sent back (a refusal, our cancellation), recorded once with where it went. */
export async function noteRefund(db: D1Database, f: Founding, by: string, text: string): Promise<boolean> {
  if (!f.paidAt || !['refused', 'cancelled'].includes(f.status)) return false
  const [result] = await db.batch([
    db.prepare("INSERT INTO founding_events (id, founding_id, at, by, action, status, note) SELECT ?, ?, ?, ?, 'refunded', ?, ? WHERE NOT EXISTS (SELECT 1 FROM founding_events WHERE founding_id = ? AND action = 'refunded')").bind(crypto.randomUUID(), f.id, now(), by, f.status, text.slice(0, 2000), f.id),
  ])
  return changed(result)
}

/** Whether an early end of the company's contract owes the exit fee: our decision over the rule (article 7). */
export async function decideExit(db: D1Database, f: Founding, by: string, decision: 'charge' | 'waive' | null, note: string): Promise<boolean> {
  if (f.status !== 'registered') return false
  const [result] = await db.batch([update(db, f, 'exit_decision = ?, exit_decided_by = ?', [decision, by]), eventIfChanged(db, f.id, by, 'exit', f.status, `${decision ?? 'podľa pravidla'}: ${note}`)])
  return changed(result)
}

export interface FoundingEvent {
  at: number
  action: string
  status: FoundingStatus
  note: string
  byName: string | null
}

export async function eventsOf(db: D1Database, id: string): Promise<FoundingEvent[]> {
  const rows = await db
    .prepare('SELECT e.at, e.action, e.status, e.note, u.name AS by_name FROM founding_events e LEFT JOIN users u ON u.id = e.by WHERE e.founding_id = ? ORDER BY e.at, e.rowid')
    .bind(id)
    .all<{ at: number; action: string; status: FoundingStatus; note: string; by_name: string | null }>()
  return (rows.results ?? []).map((r) => ({ at: Number(r.at), action: r.action, status: r.status, note: r.note, byName: r.by_name }))
}

/**
 * The company is in the register: made in the app from the register's own data (never typed), with the founder as its
 * owner, the plan and prices of the contract (paid from the first month: no free first month here), the deposit held
 * for the commitment's last months, and the day it arose as the first day of its books. The welcome link goes only once
 * the company stands. Its own identification (who stands behind it) follows in the app as for any client.
 */
export async function register(db: D1Database, f: Founding, by: string, ico: string, arose: string, origin: string): Promise<'ok' | 'state' | 'register' | 'exists' | 'name' | 'day'> {
  if (f.status !== 'filed' || !f.founder || !f.company) return 'state'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arose) || arose > bratislavaDay(now()) || arose < bratislavaDay(f.createdAt)) return 'day'
  const found = await lookupCompany(ico)
  if (!('found' in found) || !found.found) return 'register'
  const entity = found.found
  if (await db.prepare('SELECT 1 AS x FROM companies WHERE ico = ? AND closed_at IS NULL AND invoicing_only = 0').bind(ico).first()) return 'exists'
  // The register's name is the company's; it has to be the one the founder applied for (or the alternative).
  const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(spolsro|sro)$/, '')
  if (![f.company.name, f.company.altName].filter(Boolean).some((n) => plain(n) === plain(entity.name))) return 'name'
  const ts = now()
  const companyId = crypto.randomUUID()
  const existing = await userByEmail(db, f.email)
  const userId = existing?.id ?? crypto.randomUUID()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const tariff = { ...priceListTariff('paper'), firstMonthFree: false }
  const mine = `EXISTS (SELECT 1 FROM foundings WHERE id = ${quoteSql(f.id)} AND company_id = ${quoteSql(companyId)})`
  const [moved] = await db.batch([
    update(db, f, "status = 'registered', ico = ?, company_id = ?", [ico, companyId], " AND status = 'filed'"),
    db
      .prepare(
        // The accountant with the fewest clients takes it (team/assign.ts); the administrator may change her later.
        `INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, contract_at, terms_version, signed_by, start_on, legal_form, signed_role, register_line, founding_id, prepaid_cents, accountant_id)
         SELECT ?, ?, ?, ?, ?, 0, ?, ?, ?, '${OFFLINE_TERMS}', ?, ?, 'sro', 'konateľ', ?, ?, ?, (${LEAST_LOADED_ACCOUNTANT_SQL}) WHERE ${mine}`,
      )
      .bind(companyId, ts, entity.name, ico, entity.address || null, f.plan, inbox, ts, f.founder.name, arose, entity.registerLine, f.id, FORMATION.prepaidCents),
    ...(existing ? [] : [db.prepare(`INSERT INTO users (id, created_at, email, name) SELECT ?, ?, ?, ? WHERE ${mine}`).bind(userId, ts, f.email, f.founder.name)]),
    db.prepare(`INSERT OR IGNORE INTO members (company_id, user_id, role, created_at, invited_by) SELECT ?, ?, 'owner', ?, ? WHERE ${mine}`).bind(companyId, userId, ts, by),
    db.prepare(`INSERT INTO billing_tariffs (company_id, data, created_at, created_by) SELECT ?, ?, ?, ? WHERE ${mine}`).bind(companyId, JSON.stringify(tariff), ts, by),
    db.prepare(`INSERT INTO founding_events (id, founding_id, at, by, action, status, note) SELECT ?, ?, ?, ?, 'registered', 'registered', ? WHERE ${mine}`).bind(crypto.randomUUID(), f.id, ts, by, `IČO ${ico}, vznik ${arose}`),
    db
      .prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?, ?, ?, 'company.created', NULL, ? WHERE ${mine}`)
      .bind(ts, companyId, by, JSON.stringify({ founding: f.id })),
  ])
  if (!changed(moved)) return 'state'
  const welcome = await newLink(db, userId, TEAM.welcomeDays * 24 * 60)
  await db.batch([welcome.statement, ringStatement(db, 'welcome', companyId, f.email, bell.welcome(`${origin}/app/vstup?t=${welcome.token}`))])
  return 'ok'
}

/** The founder approves the contract for the company (§ 64 ods. 1 of the Commercial Code), once, as its owner. */
export async function approveForCompany(db: D1Database, companyId: string, userId: string): Promise<boolean> {
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE foundings SET approved_at = ?, rev = rev + 1, updated_at = ? WHERE company_id = ? AND approved_at IS NULL AND status = 'registered'
         AND EXISTS (SELECT 1 FROM members m WHERE m.company_id = foundings.company_id AND m.user_id = ? AND m.role = 'owner')`,
      )
      .bind(now(), now(), companyId, userId),
    db
      .prepare("INSERT INTO founding_events (id, founding_id, at, by, action, status, note) SELECT ?, id, ?, ?, 'approved', status, '' FROM foundings WHERE company_id = ? AND changes() = 1")
      .bind(crypto.randomUUID(), now(), userId, companyId),
  ])
  return changed(result)
}

/** The application of a company formed through one, for its owner's page (§ 64 approval). */
export async function foundingOfCompany(db: D1Database, companyId: string): Promise<Founding | null> {
  const row = await db.prepare('SELECT * FROM foundings WHERE company_id = ? AND purge_started_at IS NULL').bind(companyId).first<Record<string, unknown>>()
  return row ? foundingOf(row) : null
}

/** The last day the company may approve the contract: three months from the day it arose (§ 64 ods. 1). */
export function approveBy(startOn: string): string {
  const [y, m, d] = startOn.split('-').map(Number) as [number, number, number]
  const moved = new Date(Date.UTC(y, m - 1 + 3, 1))
  const last = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate()
  moved.setUTCDate(Math.min(d, last))
  return moved.toISOString().slice(0, 10)
}

export async function dropFiles(files: R2Bucket | undefined, f: Founding): Promise<void> {
  if (!files) return
  for (const key of [f.idFrontKey, f.idBackKey, f.signedKey]) if (key) await files.delete(key).catch(() => undefined)
}

/** Applications in the designated person's list: those that wait for us first, then by their last change. */
export async function foundingsList(db: D1Database): Promise<Founding[]> {
  const rows = await db
    .prepare(`SELECT * FROM foundings WHERE purge_started_at IS NULL ORDER BY CASE WHEN status IN (${FINAL.map((s) => `'${s}'`).join(',')}) THEN 1 ELSE 0 END, updated_at DESC LIMIT 300`)
    .all<Record<string, unknown>>()
  return (rows.results ?? []).map(foundingOf)
}

/**
 * How long an application is kept once it is over (his privacy rules and § 19 of Act No. 297/2008 Z. z.): one that
 * nobody checked and nothing was paid on (it lapsed, the founder took it back) a month after its last change; one the
 * designated person worked on (refused, withdrawn, cancelled after checks or a payment) five years after it ended. A
 * registered one goes with its company's records (app/purge.ts, forgetFoundingsOf).
 */
export const FOUNDING_KEEP = { untouchedDays: 30, years: 5 } as const

export async function purgeFoundings(env: Env, limit = 10): Promise<number> {
  const db = env.DB
  const ts = now()
  // An unfinished application nobody opens again lapses here too, its files with it (as when its link is opened).
  const expired = await db.prepare("SELECT * FROM foundings WHERE status = 'open' AND paid_at IS NULL AND expires_at < ? AND purge_started_at IS NULL LIMIT ?").bind(ts, limit).all<Record<string, unknown>>()
  for (const row of expired.results ?? []) {
    const f = foundingOf(row)
    if (await move(db, f, null, 'lapsed', 'Prihláška nebola dokončená včas.')) await dropFiles(env.FILES, f)
  }
  const rows = await db
    .prepare(
      `SELECT * FROM foundings f WHERE f.purge_started_at IS NULL AND f.status IN ('lapsed','cancelled','refused','withdrawn') AND (
         (f.paid_at IS NULL AND NOT EXISTS (SELECT 1 FROM founding_checks k WHERE k.founding_id = f.id) AND f.updated_at < ?)
         OR f.updated_at < ?) ORDER BY f.updated_at LIMIT ?`,
    )
    .bind(ts - FOUNDING_KEEP.untouchedDays * DAY, ts - FOUNDING_KEEP.years * 365 * DAY - DAY, limit)
    .all<Record<string, unknown>>()
  let done = 0
  for (const row of rows.results ?? []) {
    const f = foundingOf(row)
    await dropFiles(env.FILES, f)
    await db.batch(forgetStatements(db, `SELECT ${quoteSql(f.id)}`))
    done++
  }
  return done
}

/** Everything of the applications the subquery names: their links, checks and events, then the applications. */
export function forgetStatements(db: D1Database, ids: string): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE foundings SET purge_started_at = COALESCE(purge_started_at, ?) WHERE id IN (${ids})`).bind(now()),
    db.prepare(`DELETE FROM founding_links WHERE founding_id IN (${ids})`),
    db.prepare(`DELETE FROM founding_checks WHERE founding_id IN (${ids})`),
    db.prepare(`DELETE FROM founding_events WHERE founding_id IN (${ids})`),
    db.prepare(`DELETE FROM foundings WHERE id IN (${ids})`),
  ]
}

/** The application of a company whose records are forgotten (app/purge.ts): its files and rows go with the company's. */
export async function forgetFoundingsOf(env: Env, companyId: string): Promise<D1PreparedStatement[]> {
  const f = await env.DB.prepare('SELECT * FROM foundings WHERE company_id = ?').bind(companyId).first<Record<string, unknown>>()
  if (!f) return []
  await dropFiles(env.FILES, foundingOf(f))
  return forgetStatements(env.DB, `SELECT id FROM foundings WHERE company_id = ${quoteSql(companyId)}`)
}
