import { accessOpenSql } from '../aml/retention'
// What Act No. 297/2008 Z. z. asks of us as an obliged person, kept in the app (his word of 13 October 2026: nothing
// by email, everything in our own locked system): the client's declaration (who acts for the company, who its
// beneficial owners are, what it does and where its money comes from), our check of it, the risk we put the client
// in, and the internal reports of unusual operations with the designated person's decision. Every one is a row of
// its own and none is ever changed or removed, so that what was known on a day can be shown for five years (s. 19).
// A client never sees a report (s. 18: nobody may tell the client): the reports live only on the team's pages.
import { now } from '../db'
import { countryCodes, validCountryCodes, highRiskInText, monitoredCountry } from '../aml/countries'
import { eventStatement } from './store'
import { CURRENT_OFFICER_SQL } from '../aml/schema'
import { companyVerifiedSql, quoteSql } from '../aml/model'

export interface Person {
  name: string
  /** Rodné číslo as written, or '' for somebody who has none. */
  birthNumber: string
  /** YYYY-MM-DD, or '' when the birth number says it. */
  birthDate: string
  address: string
  nationality: string
  pep: boolean
  residenceCountry?: string
  citizenships?: string
}

export interface Director extends Person {
  idKind: 'op' | 'pas' | 'iny'
  idNumber: string
}

export interface Owner extends Person {
  /** The share or the votes ("100 %"), or how else the person controls the company. */
  share: string
}

export type Kuv = 'self' | 'with' | 'others'
export type Turnover = 'do-50' | '50-200' | '200-1000' | 'nad-1000'

export interface Declaration {
  version?: 2
  businessAtSeat?: boolean
  businessAddress?: string
  businessCountries?: string
  ownBehalf?: boolean
  principal?: { kind: 'person' | 'company'; name: string; birthNumber: string; birthDate: string; address: string; ico: string }
  partnerCountries?: string
  director: Director
  /** Who the beneficial owners are: the director alone, the director and others, or others only. */
  kuv: Kuv
  owners: Owner[]
  activity: string
  income: string
  turnover: Turnover
  cash: boolean
  abroad: boolean
  abroadWhere: string
}

export const TURNOVERS: readonly Turnover[] = ['do-50', '50-200', '200-1000', 'nad-1000']
export const KUVS: readonly Kuv[] = ['self', 'with', 'others']
export const ID_KINDS: readonly Director['idKind'][] = ['op', 'pas']
export const OWNER_SLOTS = 12

/**
 * Whether a Slovak or Czech birth number can be one: nine digits (born before 1954, no check digit) or ten that the
 * number 11 divides (or whose first nine leave 10 and whose last digit is 0), a month of 1 to 12 with 50 added for
 * a woman and 20 more since 2004, and a day that exists.
 */
export function birthNumberValid(value: string): boolean {
  const digits = value.replace(/[\s/]/g, '')
  if (!/^\d{9,10}$/.test(digits)) return false
  let month = Number(digits.slice(2, 4))
  if (month > 70) month -= 70
  else if (month > 50) month -= 50
  else if (month > 20) month -= 20
  const day = Number(digits.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  // The day has to exist in its month and year: nine digits are 1900 to 1953, ten are 1954 to 2053.
  const yy = Number(digits.slice(0, 2))
  const year = digits.length === 9 || yy >= 54 ? 1900 + yy : 2000 + yy
  if (new Date(Date.UTC(year, month - 1, day)).getUTCMonth() !== month - 1) return false
  if (digits.length === 9) return yy < 54
  const whole = BigInt(digits)
  if (whole % 11n === 0n) return true
  return BigInt(digits.slice(0, 9)) % 11n === 10n && digits.endsWith('0')
}

/** A day of birth typed the Slovak way ("7. 3. 1994"), as YYYY-MM-DD; '' when empty, null when it is no such day. */
export function birthDateOf(text: string, today: string, minAge = 15): string | null {
  const plain = text.replace(/\s/g, '')
  if (plain === '') return ''
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(plain)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const check = new Date(`${day}T12:00:00Z`)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) return null
  // Somebody born at least fifteen years ago and less than a hundred and twenty.
  if (day > `${Number(today.slice(0, 4)) - minAge}${today.slice(4)}` || y < Number(today.slice(0, 4)) - 120) return null
  return day
}

export type Field = string
export type DeclarationErrors = Partial<Record<Field, string>>

/** What the form sent, as the form shows it again: every field as text. */
export type DeclarationValues = Record<string, string>

const text = (body: Record<string, unknown>, name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function valuesFrom(body: Record<string, unknown>): DeclarationValues {
  const v: DeclarationValues = {}
  const fields: [string, number][] = [
    ['businessAtSeat', 1], ['businessAddress', 300], ['businessCountries', 400],
    ['ownBehalf', 1], ['principalKind', 7], ['principalName', 200], ['principalRc', 14], ['principalDob', 14], ['principalAddress', 300], ['principalIco', 20],
    ['residenceCountry', 2], ['citizenships', 100], ['partnerCountries', 400],
    ['name', 120],
    ['rc', 14],
    ['dob', 14],
    ['address', 200],
    ['nationality', 60],
    ['idKind', 4],
    ['idNumber', 20],
    ['pep', 1],
    ['kuv', 6],
    ['activity', 300],
    ['income', 300],
    ['turnover', 10],
    ['cash', 1],
    ['abroad', 1],
    ['abroadWhere', 200],
    ['truthful', 1], ['ownersOverflow', 1],
  ]
  for (const [name, max] of fields) v[name] = text(body, name, max)
  for (let i = 1; i <= OWNER_SLOTS; i++) {
    for (const [name, max] of [
      ['Name', 120],
      ['Rc', 14],
      ['Dob', 14],
      ['Address', 200],
      ['Nationality', 60],
      ['Share', 60],
      ['Pep', 1], ['ResidenceCountry', 2], ['Citizenships', 100],
    ] as [string, number][]) {
      v[`o${i}${name}`] = text(body, `o${i}${name}`, max)
    }
  }
  return v
}

export interface Checked {
  declaration: Declaration | null
  errors: DeclarationErrors
}

/** Turns the form into a declaration, or says what is missing. The words of the errors are the caller's. */
export function checkDeclaration(
  v: DeclarationValues,
  today: string,
  words: {
    name: string
    rc: string
    dob: string
    address: string
    nationality: string
    idNumber: string
    choose: string
    owner: string
    owners: string
    activity: string
    income: string
    abroadWhere: string
    truthful: string
  },
): Checked {
  const errors: DeclarationErrors = {}
  if (v.ownersOverflow === '1') errors.owners = 'Úplnú vlastnícku štruktúru musí najprv individuálne spracovať určená osoba. Neúplné vyhlásenie nemôžeme prijať.'
  const countries = (key: string, required = true) => {
    const raw = (v[key] ?? '').trim()
    if ((required || raw !== '') && !validCountryCodes(raw)) errors[key] = 'Uveďte kódy krajín, napríklad SK alebo SK, CZ.'
    return countryCodes(raw).join(', ')
  }
  if (v.businessAtSeat !== '0' && v.businessAtSeat !== '1') errors.businessAtSeat = words.choose
  if (v.businessAtSeat === '0' && (v.businessAddress ?? '').length < 8) errors.businessAddress = words.address
  const businessCountries = countries('businessCountries')
  if (v.ownBehalf !== '0' && v.ownBehalf !== '1') errors.ownBehalf = words.choose
  let principal: Declaration['principal']
  if (v.ownBehalf === '0') {
    if (v.principalKind !== 'person' && v.principalKind !== 'company') errors.principalKind = words.choose
    if ((v.principalName ?? '').length < 3) errors.principalName = words.name
    if (v.principalKind === 'company' && !/^\d{8}$/.test(v.principalIco ?? '')) errors.principalIco = 'Uveďte IČO osoby, v ktorej mene Vaša firma koná.'
    if (v.principalKind === 'company' && (v.principalAddress ?? '').length < 8) errors.principalAddress = words.address
    const birthDate = birthDateOf(v.principalDob ?? '', today)
    if (v.principalKind === 'person' && (!(v.principalRc ?? '') && !birthDate || (v.principalRc ?? '') !== '' && !birthNumberValid(v.principalRc ?? ''))) errors.principalDob = words.dob
    principal = { kind: v.principalKind === 'person' ? 'person' : 'company', name: v.principalName ?? '', birthNumber: v.principalRc ?? '', birthDate: birthDate ?? '', address: v.principalAddress ?? '', ico: v.principalIco ?? '' }
  }
  const residenceCountry = countries('residenceCountry')
  const citizenships = countries('citizenships')
  const partnerCountries = countries('partnerCountries', v.abroad === '1')
  const person = (prefix: string, name: string, rc: string, dob: string, address: string, nationality: string, required: boolean) => {
    if (name.length < 5 || !name.includes(' ')) errors[`${prefix}name`] = words.name
    if (rc !== '' && !birthNumberValid(rc)) errors[`${prefix}rc`] = words.rc
    const birthDate = birthDateOf(dob, today, prefix ? 0 : 15)
    if (birthDate === null || (rc === '' && birthDate === '' && required)) errors[`${prefix}dob`] = words.dob
    if (address.length < 8) errors[`${prefix}address`] = words.address
    if (nationality.length < 3) errors[`${prefix}nationality`] = words.nationality
    return { name, birthNumber: rc.replace(/\s/g, ''), birthDate: birthDate ?? '', address, nationality }
  }
  const director = person('', v.name ?? '', v.rc ?? '', v.dob ?? '', v.address ?? '', v.nationality ?? '', true)
  const idKind = (ID_KINDS as readonly string[]).includes(v.idKind ?? '') ? (v.idKind as Director['idKind']) : null
  if (!idKind || (v.idNumber ?? '').replace(/\s/g, '').length < 5) errors.idNumber = words.idNumber
  if (v.pep !== '0' && v.pep !== '1') errors.pep = words.choose
  const kuv = (KUVS as readonly string[]).includes(v.kuv ?? '') ? (v.kuv as Kuv) : null
  if (!kuv) errors.kuv = words.choose
  const owners: Owner[] = []
  for (let i = 1; i <= OWNER_SLOTS; i++) {
    const name = v[`o${i}Name`] ?? ''
    const any = ['Name', 'Rc', 'Dob', 'Address', 'Nationality', 'Share'].some((f) => (v[`o${i}${f}`] ?? '') !== '')
    if (!any || kuv === 'self') continue
    const p = person(`o${i}`, name, v[`o${i}Rc`] ?? '', v[`o${i}Dob`] ?? '', v[`o${i}Address`] ?? '', v[`o${i}Nationality`] ?? '', true)
    if ((v[`o${i}Share`] ?? '').length < 1) errors[`o${i}share`] = words.owner
    owners.push({ ...p, share: v[`o${i}Share`] ?? '', pep: v[`o${i}Pep`] === '1', residenceCountry: countries(`o${i}ResidenceCountry`), citizenships: countries(`o${i}Citizenships`) })
  }
  if (kuv && kuv !== 'self' && owners.length === 0) errors.owners = words.owners
  if ((v.activity ?? '').length < 3) errors.activity = words.activity
  if ((v.income ?? '').length < 3) errors.income = words.income
  const turnover = (TURNOVERS as readonly string[]).includes(v.turnover ?? '') ? (v.turnover as Turnover) : null
  if (!turnover) errors.turnover = words.choose
  if (v.cash !== '0' && v.cash !== '1') errors.cash = words.choose
  if (v.abroad !== '0' && v.abroad !== '1') errors.abroad = words.choose
  if (v.abroad === '1' && (v.abroadWhere ?? '').length < 2) errors.abroadWhere = words.abroadWhere
  if (v.truthful !== '1') errors.truthful = words.truthful
  if (Object.keys(errors).length > 0 || !idKind || !kuv || !turnover) return { declaration: null, errors }
  return {
    declaration: {
      version: 2, businessAtSeat: v.businessAtSeat === '1', businessAddress: v.businessAtSeat === '0' ? v.businessAddress : '', businessCountries, ownBehalf: v.ownBehalf === '1', principal, partnerCountries,
      director: { ...director, residenceCountry, citizenships, pep: v.pep === '1', idKind, idNumber: (v.idNumber ?? '').replace(/\s/g, '').toUpperCase() },
      kuv,
      owners: kuv === 'self' ? [] : owners,
      activity: v.activity ?? '',
      income: v.income ?? '',
      turnover,
      cash: v.cash === '1',
      abroad: v.abroad === '1',
      abroadWhere: v.abroad === '1' ? (v.abroadWhere ?? '') : '',
    },
    errors,
  }
}

/** The form filled with a declaration given before, so that changing it starts from what is there. */
export function valuesOfDeclaration(d: Declaration): DeclarationValues {
  const sk = (day: string) => (day ? `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}` : '')
  const v: DeclarationValues = {
    businessAtSeat: d.businessAtSeat === undefined ? '' : d.businessAtSeat ? '1' : '0', businessAddress: d.businessAddress ?? '', businessCountries: d.businessCountries ?? '',
    ownBehalf: d.ownBehalf === undefined ? '' : d.ownBehalf ? '1' : '0', principalKind: d.principal?.kind ?? '', principalName: d.principal?.name ?? '', principalRc: d.principal?.birthNumber ?? '', principalDob: sk(d.principal?.birthDate ?? ''), principalAddress: d.principal?.address ?? '', principalIco: d.principal?.ico ?? '',
    residenceCountry: d.director.residenceCountry ?? '', citizenships: d.director.citizenships ?? '', partnerCountries: d.partnerCountries ?? '',
    name: d.director.name,
    rc: d.director.birthNumber,
    dob: sk(d.director.birthDate),
    address: d.director.address,
    nationality: d.director.nationality,
    idKind: d.director.idKind,
    idNumber: d.director.idNumber,
    pep: d.director.pep ? '1' : '0',
    kuv: d.kuv,
    activity: d.activity,
    income: d.income,
    turnover: d.turnover,
    cash: d.cash ? '1' : '0',
    abroad: d.abroad ? '1' : '0',
    abroadWhere: d.abroadWhere,
    truthful: '',
  }
  d.owners.slice(0, OWNER_SLOTS).forEach((o, i) => {
    v[`o${i + 1}Name`] = o.name
    v[`o${i + 1}Rc`] = o.birthNumber
    v[`o${i + 1}Dob`] = sk(o.birthDate)
    v[`o${i + 1}Address`] = o.address
    v[`o${i + 1}Nationality`] = o.nationality
    v[`o${i + 1}Share`] = o.share
    v[`o${i + 1}Pep`] = o.pep ? '1' : ''
    v[`o${i + 1}ResidenceCountry`] = o.residenceCountry ?? ''
    v[`o${i + 1}Citizenships`] = o.citizenships ?? ''
  })
  return v
}

// A birth number as the client's own pages show it once it was given: six stars, a slash and the last four digits.
export function maskBirthNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length < 4 ? '' : `******/${digits.slice(-4)}`
}

export type Level = 'low' | 'standard' | 'high'
export const LEVELS: readonly Level[] = ['low', 'standard', 'high']

/**
 * The risk the declaration points to, as the program sets it (section 2): a politically exposed person makes it high;
 * otherwise each of large cash and partners outside the EU is a factor, none is low, one standard, two high.
 */
export function suggestedLevel(d: Declaration): Level {
  const persons = [d.director, ...d.owners]
  const places = [d.businessCountries, d.partnerCountries, d.abroadWhere, ...persons.flatMap((p) => [p.citizenships, p.nationality, p.residenceCountry, p.address])].filter((v): v is string => typeof v === 'string')
  if (persons.some((p) => p.pep) || places.some(highRiskInText)) return 'high'
  const monitoring = places.some((p) => countryCodes(p).some(monitoredCountry))
  const eu = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '))
  const outsideEu = persons.some((p) => p.residenceCountry && !eu.has(p.residenceCountry))
  const factors = [d.cash, d.abroad, outsideEu].filter(Boolean).length
  return factors >= 2 ? 'high' : factors === 1 || monitoring ? 'standard' : 'low'
}

export interface StoredDeclaration {
  id: string
  createdAt: number
  createdByName: string | null
  data: Declaration
  checkedAt: number | null
  checkedByName: string | null
  verified?: boolean
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function parsed(value: unknown): Declaration | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as Declaration
  } catch {
    return null
  }
}

/** A company's newest declaration, or null; the ones before it stay in the table. */
export async function latestDeclaration(db: D1Database, company: string): Promise<StoredDeclaration | null> {
  const row = await db
    .prepare(
      `SELECT d.*, cb.name AS created_by_name, kb.name AS checked_by_name, ${companyVerifiedSql('c')} AS verified FROM declarations d JOIN companies c ON c.id = d.company_id
       LEFT JOIN users cb ON cb.id = d.created_by LEFT JOIN users kb ON kb.id = d.checked_by
       WHERE d.company_id = ? ORDER BY d.created_at DESC, d.rowid DESC LIMIT 1`,
    )
    .bind(company)
    .first<Row>()
  const data = row ? parsed(row.data) : null
  if (!row || !data) return null
  return { id: String(row.id), createdAt: num(row.created_at) ?? 0, createdByName: str(row.created_by_name), data, checkedAt: num(row.checked_at), checkedByName: str(row.checked_by_name), verified: row.verified === 1 }
}

export function declarationStatements(db: D1Database, company: string, user: string, d: Declaration, extra: D1PreparedStatement[] = []): { id: string; statements: D1PreparedStatement[] } {
  const id = crypto.randomUUID()
  return {
    id,
    statements: [
      db.prepare('INSERT INTO declarations (id, company_id, created_at, created_by, data) VALUES (?, ?, ?, ?, ?)').bind(id, company, now(), user, JSON.stringify(d)),
      eventStatement(db, { company, user, action: 'declaration.submitted', subject: id }),
      ...extra,
    ],
  }
}

/** Marks the newest declaration as checked, once; an older one is never checked in its place. */
export function checkDeclarationStatement(db: D1Database, company: string, id: string, user: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE declarations SET checked_at = ?, checked_by = ? WHERE id = ? AND company_id = ? AND checked_at IS NULL
         AND id = (SELECT id FROM declarations WHERE company_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1)`,
    )
    .bind(now(), user, id, company, company)
}

/** Where the identification stands: nothing given, given and waiting for our check, or checked. */
export type DeclarationState = 'missing' | 'waiting' | 'checked'

export function declarationStateOf(d: StoredDeclaration | null): DeclarationState {
  return !d ? 'missing' : d.checkedAt === null || d.verified !== true ? 'waiting' : 'checked'
}

/** The same as SQL over a company aliased c, for lists. */
export const DECLARATION_STATE_SQL = `(SELECT CASE WHEN d.checked_at IS NOT NULL AND ${companyVerifiedSql('c')} THEN 'checked' ELSE 'waiting' END FROM declarations d WHERE d.company_id = c.id ORDER BY d.created_at DESC, d.rowid DESC LIMIT 1)`

export interface Risk {
  level: Level
  note: string | null
  createdAt: number
  createdByName: string | null
}

export async function risksOf(db: D1Database, company: string): Promise<Risk[]> {
  const rows = await db
    .prepare(
      'SELECT r.level, r.note, r.created_at, u.name AS created_by_name FROM risks r LEFT JOIN users u ON u.id = r.created_by WHERE r.company_id = ? ORDER BY r.created_at DESC, r.rowid DESC LIMIT 20',
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({
    level: (LEVELS as readonly string[]).includes(String(r.level)) ? (r.level as Level) : 'standard',
    note: str(r.note),
    createdAt: num(r.created_at) ?? 0,
    createdByName: str(r.created_by_name),
  }))
}

export function riskStatements(db: D1Database, company: string, user: string, level: Level, note: string | null): D1PreparedStatement[] {
  const id = crypto.randomUUID()
  return [
    db.prepare('INSERT INTO risks (id, company_id, created_at, created_by, level, note) VALUES (?, ?, ?, ?, ?, ?)').bind(id, company, now(), user, level, note),
    eventStatement(db, { company, user, action: 'risk.set', subject: id, detail: { level } }),
  ]
}

export type Decision = 'reported' | 'not'

export interface Report {
  id: string
  createdAt: number
  createdBy: string
  createdByName: string | null
  body: string
  decidedAt: number | null
  decidedByName: string | null
  decision: Decision | null
  decisionNote: string | null
}

/** The internal reports of a company: every one for the designated person, her own for anybody else of the team. */
export async function reportsOf(db: D1Database, company: string, viewer: { id: string; admin: boolean }): Promise<Report[]> {
  const rows = await db
    .prepare(
      `SELECT r.*, cb.name AS created_by_name, db.name AS decided_by_name FROM reports r
       LEFT JOIN users cb ON cb.id = r.created_by LEFT JOIN users db ON db.id = r.decided_by
       WHERE r.company_id = ? AND EXISTS (SELECT 1 FROM companies c WHERE c.id = r.company_id AND
         (? = ${CURRENT_OFFICER_SQL} OR (${quoteSql(viewer.id)} = r.created_by AND ${accessOpenSql('c')}))) ORDER BY r.created_at DESC, r.rowid DESC LIMIT 50`,
    )
    .bind(company, viewer.id)
    .all<Row>()
  return rows.results.map((r) => ({
    id: String(r.id),
    createdAt: num(r.created_at) ?? 0,
    createdBy: String(r.created_by),
    createdByName: str(r.created_by_name),
    body: String(r.body),
    decidedAt: num(r.decided_at),
    decidedByName: str(r.decided_by_name),
    decision: r.decision === 'reported' || r.decision === 'not' ? r.decision : null,
    decisionNote: str(r.decision_note),
  }))
}

export function reportStatements(db: D1Database, company: string, user: string, body: string): { id: string; statements: D1PreparedStatement[] } {
  const id = crypto.randomUUID()
  return {
    id,
    statements: [
      db.prepare('INSERT INTO reports (id, company_id, created_at, created_by, body) VALUES (?, ?, ?, ?, ?)').bind(id, company, now(), user, body),
      eventStatement(db, { company, user, action: 'report.created', subject: id }),
    ],
  }
}

/** The designated person's decision on a report, once. */
export function decideStatement(db: D1Database, company: string, id: string, user: string, decision: Decision, note: string): D1PreparedStatement {
  return db
    .prepare(`UPDATE reports SET decided_at = ?, decided_by = ?, decision = ?, decision_note = ? WHERE id = ? AND company_id = ? AND decided_at IS NULL AND ? = ${CURRENT_OFFICER_SQL}`)
    .bind(now(), user, decision, note, id, company, user)
}

/** Open reports of a company aliased c, as SQL: what the designated person still has to decide. */
export const openReportsSql = (user: string) => `(SELECT COUNT(*) FROM reports r WHERE r.company_id = c.id AND r.decided_at IS NULL AND (r.created_by = ${quoteSql(user)} OR ${quoteSql(user)} = ${CURRENT_OFFICER_SQL}))`

/**
 * The last day of a contract given notice on a day: the notice period is one month and starts on the first day of
 * the month after the notice arrived (terms, point 10.2), so it ends on the last day of that month.
 */
export function noticeEndsOn(day: string): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  const last = new Date(Date.UTC(y, m + 1, 0))
  return last.toISOString().slice(0, 10)
}
