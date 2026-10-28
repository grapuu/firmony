// The EU's and the UN's consolidated sanctions lists, read from their own files, and a screening of the people and the
// company of a client against them (his word of 28 October 2026: the firm runs without his attention, so the designated
// person confirms a prepared check instead of searching by hand). The screening only proposes: the designated person
// reads the proposal and records the check under his name, as the AML programme asks (a check with its source).
//
// The files, as their publishers give them (read 28 October 2026):
// - EU: the Financial Sanctions Files, consolidated list, XML 1.1,
//   https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw
//   <export generationDate="…"> with one <sanctionEntity euReferenceNumber="…" logicalId="…"> a subject, its
//   <subjectType code="person|enterprise">, every <nameAlias wholeName="…"> and <birthdate birthdate="YYYY-MM-DD" year="…">.
// - UN: the Security Council Consolidated List, https://scsanctions.un.org/resources/xml/en/consolidated.xml (it answers
//   with a redirect to a signed copy), <CONSOLIDATED_LIST dateGenerated="…"> with <INDIVIDUAL> and <ENTITY>, each with
//   FIRST_NAME to FOURTH_NAME, REFERENCE_NUMBER, *_ALIAS/ALIAS_NAME and INDIVIDUAL_DATE_OF_BIRTH (DATE, YEAR, FROM_YEAR, TO_YEAR).
// Names are compared without accents, case or punctuation, word by word: no names leave Firmony, the lists come to us.

export type SanctionList = 'eu' | 'un'

/** One listed subject: its reference, a person or an entity, the name to show, its names compared, its birth years. */
export type SanctionEntry = [ref: string, kind: 'p' | 'e', name: string, names: string[], years: number[]]

export interface ParsedList {
  generated: string | null
  entries: SanctionEntry[]
}

export const SANCTION_SOURCES: Record<SanctionList, { url: string; title: string; min: number }> = {
  eu: {
    url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
    title: 'konsolidovaný zoznam finančných sankcií EÚ (Financial Sanctions Files)',
    // A file with fewer subjects is no whole list (thousands are listed): kept apart, never screened against.
    min: 1000,
  },
  un: {
    url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    title: 'konsolidovaný sankčný zoznam Bezpečnostnej rady OSN',
    min: 300,
  },
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? xmlText(m[1] ?? '') : null
}
const texts = (block: string, tag: string): string[] =>
  [...block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => xmlText((m[1] ?? '').trim())).filter(Boolean)

/** A name as words: no accents, no case, no punctuation, no academic titles, no single letters. */
const TITLES = new Set(['ing', 'mgr', 'bc', 'phd', 'mudr', 'judr', 'rndr', 'paeddr', 'phdr', 'mvdr', 'doc', 'prof', 'mba', 'msc', 'dr', 'csc', 'drsc', 'art', 'dipl', 'mr', 'mrs', 'ms'])
export function nameWords(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !TITLES.has(w))
}

/** A company's name as words, its legal form left out ("ACME s. r. o." and "ACME Ltd" are the same words). */
const FORMS = new Set(['s', 'r', 'o', 'sro', 'spol', 'as', 'a', 'v', 'k', 'ks', 'jsa', 'ltd', 'llc', 'inc', 'plc', 'gmbh', 'ag', 'kg', 'sa', 'srl', 'bv', 'nv', 'co', 'company', 'limited', 'corp', 'corporation', 'ooo', 'zao', 'oao', 'pao', 'jsc', 'llp', 'lp', 'sp', 'zoo', 'kft', 'zrt', 'the', 'and'])
export function companyWords(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !FORMS.has(w))
}

/** Every year inside a block of birth dates: 4-digit years, and the years between a FROM_YEAR and a TO_YEAR. */
function yearsIn(block: string): number[] {
  const years = new Set<number>()
  for (const m of block.matchAll(/\b(1[89]\d\d|20\d\d)\b/g)) years.add(Number(m[1]))
  const from = Number(/<FROM_YEAR>(\d{4})<\/FROM_YEAR>/.exec(block)?.[1] ?? NaN)
  const to = Number(/<TO_YEAR>(\d{4})<\/TO_YEAR>/.exec(block)?.[1] ?? NaN)
  if (Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from <= 20) for (let y = from; y <= to; y++) years.add(y)
  return [...years].sort()
}

/** One <sanctionEntity> of the EU's file. */
export function euEntry(block: string): SanctionEntry | null {
  const open = /<(?:\w+:)?sanctionEntity\b[^>]*>/.exec(block)?.[0] ?? ''
  const ref = attr(open, 'euReferenceNumber') || attr(open, 'logicalId') || ''
  const type = attr(/<(?:\w+:)?subjectType\b[^>]*>/.exec(block)?.[0] ?? '', 'code') ?? ''
  const names = [...block.matchAll(/<(?:\w+:)?nameAlias\b[^>]*>/g)].map((m) => attr(m[0], 'wholeName') ?? '').filter((n) => n.trim() !== '')
  if (!ref || names.length === 0) return null
  const births = [...block.matchAll(/<(?:\w+:)?birthdate\b[^>]*>/g)].map((m) => `${attr(m[0], 'birthdate') ?? ''} ${attr(m[0], 'year') ?? ''}`).join(' ')
  return [ref, type === 'person' ? 'p' : 'e', names[0]!.trim(), [...new Set(names.map((n) => nameWords(n).join(' ')).filter(Boolean))], yearsIn(births)]
}

/** One <INDIVIDUAL> or <ENTITY> of the UN's file. */
export function unEntry(block: string, kind: 'p' | 'e'): SanctionEntry | null {
  const ref = texts(block, 'REFERENCE_NUMBER')[0] ?? texts(block, 'DATAID')[0] ?? ''
  const main = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((t) => texts(block, t)[0] ?? '').filter(Boolean).join(' ')
  const aliases = texts(block, 'ALIAS_NAME')
  const names = [main, ...aliases].filter((n) => n.trim() !== '')
  if (!ref || names.length === 0) return null
  const births = [...block.matchAll(/<INDIVIDUAL_DATE_OF_BIRTH>([\s\S]*?)<\/INDIVIDUAL_DATE_OF_BIRTH>/g)].map((m) => m[1] ?? '').join(' ')
  return [ref, kind, names[0]!.trim(), [...new Set(names.map((n) => nameWords(n).join(' ')).filter(Boolean))], kind === 'p' ? yearsIn(births) : []]
}

const OPEN: Record<SanctionList, RegExp> = { eu: /<(?:\w+:)?sanctionEntity[\s>]/g, un: /<(INDIVIDUAL|ENTITY)[\s>]/g }

/**
 * Reads a whole file as it streams in, one subject at a time, so the EU's tens of megabytes are never held whole:
 * a block is cut out from its opening tag to its closing one and the text before it is let go.
 */
export async function parseList(list: SanctionList, body: ReadableStream<Uint8Array>): Promise<ParsedList> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  const entries: SanctionEntry[] = []
  let generated: string | null = null
  let buffer = ''
  // The opening of the file, kept apart for its root element's day while the blocks are cut out of the buffer.
  let head = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    if (head.length < 8192 && value) {
      head += value
      const root = list === 'eu' ? /<(?:\w+:)?export\b[^>]*\sgenerationDate="([^"]+)"/.exec(head) : /<CONSOLIDATED_LIST\b[^>]*\sdateGenerated="([^"]+)"/.exec(head)
      if (root?.[1]) {
        generated = /^\d{4}-\d{2}-\d{2}/.test(root[1]) ? root[1].slice(0, 10) : null
        head = ' '.repeat(8192)
      }
    }
    // Blocks are read from a position in the buffer and the buffer is cut once a piece: cutting it after every block
    // would copy the rest of it each time.
    const open = new RegExp(OPEN[list].source, 'g')
    let pos = 0
    for (;;) {
      open.lastIndex = pos
      const found = open.exec(buffer)
      if (!found) {
        buffer = buffer.slice(Math.max(pos, buffer.length - 64))
        break
      }
      const tag = list === 'eu' ? (/<((?:\w+:)?sanctionEntity)/.exec(found[0])?.[1] ?? 'sanctionEntity') : (found[1] ?? 'INDIVIDUAL')
      const close = `</${tag}>`
      const end = buffer.indexOf(close, found.index)
      if (end < 0) {
        buffer = buffer.slice(found.index)
        break
      }
      const block = buffer.slice(found.index, end + close.length)
      pos = end + close.length
      const entry = list === 'eu' ? euEntry(block) : unEntry(block, tag === 'ENTITY' ? 'e' : 'p')
      if (entry) entries.push(entry)
    }
    if (done) break
  }
  return { generated, entries }
}

/** Two words the same, or one letter apart in words of five letters or more (a typo, a transliteration's letter). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
const within = (part: string[], whole: string[]) => part.every((w) => whole.some((x) => sameWord(w, x)))

/** Whether a person's words are a listed name's or the other way round, at least two words of them. */
export function personMatches(person: string[], listed: string[]): boolean {
  if (person.length < 2 || listed.length < 2) return false
  return within(listed, person) || within(person, listed)
}

/** Whether a company's words are a listed entity's, all of them (one word only when the name is that one word). */
export function companyMatches(company: string[], listed: string[]): boolean {
  if (company.length === 0 || listed.length === 0) return false
  if (company.length === 1 || listed.length === 1) return company.length === listed.length && sameWord(company[0]!, listed[0]!)
  return within(listed, company) || within(company, listed)
}

export interface Subject {
  /** Who it is in the proposal: "konateľ", "konečný užívateľ výhod", "firma". */
  role: string
  name: string
  kind: 'p' | 'e'
  /** The year of birth, when known. */
  year?: number | null
}

export interface Hit {
  subject: Subject
  ref: string
  name: string
  years: number[]
  /** The listed person was born in other years than the subject: very likely somebody else. */
  otherYear: boolean
}

/** Every listed subject whose names match one of the subjects, with whether a different year of birth sets it apart. */
export function screen(subjects: Subject[], entries: readonly SanctionEntry[]): Hit[] {
  const hits: Hit[] = []
  for (const subject of subjects) {
    const words = subject.kind === 'p' ? nameWords(subject.name) : companyWords(subject.name)
    if (words.length === 0) continue
    for (const [ref, kind, name, names, years] of entries) {
      if (kind !== subject.kind) continue
      const hit = names.some((n) => (kind === 'p' ? personMatches(words, n.split(' ')) : companyMatches(words, companyWords(n))))
      if (!hit) continue
      hits.push({ subject, ref, name, years, otherYear: kind === 'p' && Boolean(subject.year) && years.length > 0 && !years.includes(subject.year!) })
    }
  }
  return hits
}

/** The year of birth from a date (YYYY-MM-DD) or a Slovak birth number (nine digits before 1954). */
export function birthYear(birthDate: string | undefined, birthNumber: string | undefined): number | null {
  const date = /^(\d{4})-\d{2}-\d{2}$/.exec(birthDate ?? '')
  if (date) return Number(date[1])
  const digits = (birthNumber ?? '').replace(/\D/g, '')
  if (digits.length !== 9 && digits.length !== 10) return null
  const yy = Number(digits.slice(0, 2))
  return digits.length === 9 ? 1900 + yy : yy >= 54 ? 1900 + yy : 2000 + yy
}
