// The two files that arrive as data and are read by our own code, never by a model: the bank's statement
// (ISO 20022 camt.053, which every Slovak bank's internet banking exports) and an e-invoice (UBL 2.1, the form
// Peppol carries, which the digital postman delivers from 1 January 2027).
import { XMLParser } from 'fast-xml-parser'
import type { Category } from './booking'
import type { DocKind } from './match'

const LISTS = new Set(['Stmt', 'Ntry', 'TxDtls', 'Bal', 'Ustrd', 'Strd', 'PartyIdentification', 'PartyLegalEntity', 'PaymentMeans', 'TaxTotal', 'PartyTaxScheme'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => LISTS.has(name),
})

/** Parses XML that declares no entities of its own (a file that does is refused: nothing in a bank's file needs them). */
export function parseXml(text: string): Record<string, unknown> | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null
  try {
    const tree = parser.parse(text) as unknown
    return tree && typeof tree === 'object' ? (tree as Record<string, unknown>) : null
  } catch {
    return null
  }
}

type Node = Record<string, unknown> | undefined

/** A child of a node, by a path of names. */
function at(node: unknown, ...path: string[]): unknown {
  let here: unknown = node
  for (const name of path) {
    if (Array.isArray(here)) here = here[0]
    if (!here || typeof here !== 'object') return undefined
    here = (here as Record<string, unknown>)[name]
  }
  return Array.isArray(here) ? here[0] : here
}

/** The text of a node, whether it carries attributes or not. */
function text(node: unknown): string | null {
  if (node === undefined || node === null) return null
  if (typeof node === 'string') return node.trim() || null
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object' && '#text' in (node as object)) return text((node as Record<string, unknown>)['#text'])
  return null
}

function list(node: unknown): unknown[] {
  if (node === undefined || node === null) return []
  return Array.isArray(node) ? node : [node]
}

/** "12.40" or "12,40" in cents, exactly: no floating point on the way. Null when it is not an amount. */
export function toCents(value: string | null | undefined): number | null {
  if (!value) return null
  const plain = value.replace(/\s| /g, '').replace(',', '.')
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  return m[1] === '-' ? -cents : cents
}

/** A date of the file (YYYY-MM-DD, or a time stamp that begins with it). */
function day(value: string | null): string | null {
  const m = value ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null
  return m ? (m[1] ?? null) : null
}

/** A short, steady fingerprint of a text (FNV-1a), for a reference the bank did not give. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

// ---------------------------------------------------------------------------------------------------------------
// The bank's statement
// ---------------------------------------------------------------------------------------------------------------

export interface Entry {
  /** The bank's own reference: the same payment in two statements is one payment. */
  ref: string
  bookedOn: string
  amountCents: number
  currency: string
  party: string | null
  partyIban: string | null
  vs: string | null
  ss: string | null
  ks: string | null
  note: string | null
  card: boolean
}

export interface Statement {
  iban: string | null
  currency: string | null
  closing: { cents: number; on: string } | null
  entries: Entry[]
}

/** The Slovak payment symbols, wherever a bank puts them: "/VS2026005/SS/KS0308" or "VS: 2026005". */
export function symbols(...texts: (string | null)[]): { vs: string | null; ss: string | null; ks: string | null } {
  const all = texts.filter(Boolean).join(' ')
  const find = (name: string) => {
    const m = new RegExp(`(?:^|[^A-Z])${name}\\s*[:.]?\\s*(\\d{1,10})`, 'i').exec(all)
    return m ? (m[1] ?? null) : null
  }
  return { vs: find('VS'), ss: find('SS'), ks: find('KS') }
}

function partyName(node: unknown): string | null {
  return text(at(node, 'Nm')) ?? text(at(node, 'Pty', 'Nm'))
}

function partyIban(node: unknown): string | null {
  const iban = text(at(node, 'Id', 'IBAN'))
  return iban ? iban.replace(/\s/g, '').toUpperCase() : null
}

/** Reads a camt.053 statement; null when the file is not one. */
export function readStatement(xml: string): Statement[] | null {
  const tree = parseXml(xml)
  const root = at(tree, 'Document', 'BkToCstmrStmt') as Node
  if (!root) return null
  const statements: Statement[] = []
  for (const stmt of list((root as Record<string, unknown>).Stmt)) {
    const iban = text(at(stmt, 'Acct', 'Id', 'IBAN'))
    const currency = text(at(stmt, 'Acct', 'Ccy'))
    let closing: Statement['closing'] = null
    for (const bal of list((stmt as Record<string, unknown>).Bal)) {
      const type = text(at(bal, 'Tp', 'CdOrPrtry', 'Cd'))
      if (type !== 'CLBD') continue
      const cents = toCents(text(at(bal, 'Amt')))
      const on = day(text(at(bal, 'Dt', 'Dt')) ?? text(at(bal, 'Dt', 'DtTm')))
      if (cents !== null && on) closing = { cents: text(at(bal, 'CdtDbtInd')) === 'DBIT' ? -cents : cents, on }
    }
    const entries: Entry[] = []
    const seen = new Map<string, number>()
    for (const ntry of list((stmt as Record<string, unknown>).Ntry)) {
      const status = text(at(ntry, 'Sts')) ?? text(at(ntry, 'Sts', 'Cd'))
      if (status && status !== 'BOOK') continue
      const sign = text(at(ntry, 'CdtDbtInd')) === 'DBIT' ? -1 : 1
      const bookedOn = day(text(at(ntry, 'BookgDt', 'Dt')) ?? text(at(ntry, 'BookgDt', 'DtTm')) ?? text(at(ntry, 'ValDt', 'Dt')))
      const entryAmount = toCents(text(at(ntry, 'Amt')))
      const entryCurrency = (at(ntry, 'Amt') as Record<string, unknown> | undefined)?.['@Ccy']
      if (!bookedOn || entryAmount === null) continue
      const family = text(at(ntry, 'BkTxCd', 'Domn', 'Fmly', 'Cd'))
      const entryInfo = text(at(ntry, 'AddtlNtryInf'))
      const card = family === 'CCRD' || /kart|card/i.test(entryInfo ?? '')
      const details = list(at(ntry, 'NtryDtls') && (at(ntry, 'NtryDtls') as Record<string, unknown>).TxDtls)
      const parts = details.length > 1 ? details : [details[0]]
      parts.forEach((tx, index) => {
        const own = parts.length > 1 ? toCents(text(at(tx, 'AmtDtls', 'TxAmt', 'Amt')) ?? text(at(tx, 'Amt'))) : null
        const amount = sign * (own ?? entryAmount)
        const otherSide = sign < 0 ? 'Cdtr' : 'Dbtr'
        const party = partyName(at(tx, 'RltdPties', otherSide)) ?? (card && entryInfo ? entryInfo.replace(/^(platba kartou|nákup|nakup|pos)\s*/i, '').slice(0, 120) : null)
        const iban = partyIban(at(tx, 'RltdPties', `${otherSide}Acct`))
        const ustrd = list(at(tx, 'RmtInf') && (at(tx, 'RmtInf') as Record<string, unknown>).Ustrd).map(text).filter(Boolean).join(' ') || null
        const creditorRef = text(at(tx, 'RmtInf', 'Strd', 'CdtrRefInf', 'Ref'))
        const endToEnd = text(at(tx, 'Refs', 'EndToEndId'))
        const txInfo = text(at(tx, 'AddtlTxInf'))
        const { vs, ss, ks } = symbols(endToEnd, creditorRef, ustrd, txInfo, entryInfo)
        const note = ustrd ?? txInfo ?? entryInfo
        const bankRef = text(at(ntry, 'AcctSvcrRef')) ?? text(at(tx, 'Refs', 'AcctSvcrRef')) ?? text(at(ntry, 'NtryRef'))
        let ref = bankRef ? (parts.length > 1 ? `${bankRef}/${index + 1}` : bankRef) : `h:${fingerprint([bookedOn, amount, iban, vs, note, party].join('|'))}`
        const count = seen.get(ref) ?? 0
        seen.set(ref, count + 1)
        if (count > 0) ref = `${ref}#${count + 1}`
        entries.push({
          ref,
          bookedOn,
          amountCents: amount,
          currency: typeof entryCurrency === 'string' ? entryCurrency : (currency ?? 'EUR'),
          party,
          partyIban: iban,
          vs,
          ss,
          ks,
          note,
          card,
        })
      })
    }
    statements.push({ iban: iban ? iban.replace(/\s/g, '').toUpperCase() : null, currency, closing, entries })
  }
  return statements
}

// ---------------------------------------------------------------------------------------------------------------
// An e-invoice
// ---------------------------------------------------------------------------------------------------------------

export interface Reading {
  kind: DocKind
  party: string | null
  partyIco: string | null
  partyIban: string | null
  number: string | null
  vs: string | null
  issuedOn: string | null
  dueOn: string | null
  totalCents: number | null
  vatCents: number | null
  currency: string | null
  /** What it is for, as the reader judged it; an e-invoice says nothing of it. */
  category?: Category | null
}

function partyOf(node: unknown): { name: string | null; ids: string[] } {
  const party = at(node, 'Party')
  const name = text(at(party, 'PartyLegalEntity', 'RegistrationName')) ?? text(at(party, 'PartyName', 'Name'))
  const ids = [
    text(at(party, 'EndpointID')),
    ...list(party && (party as Record<string, unknown>).PartyIdentification).map((pid) => text(at(pid, 'ID'))),
    text(at(party, 'PartyLegalEntity', 'CompanyID')),
    text(at(party, 'PartyTaxScheme', 'CompanyID')),
  ].filter((id): id is string => Boolean(id))
  return { name, ids }
}

/** An IČO among a party's identifiers: eight digits, possibly behind a scheme ("0245:57442452"). */
function icoAmong(ids: string[]): string | null {
  for (const id of ids) {
    const m = /(?:^|\D)(\d{8})$/.exec(id.replace(/\s/g, ''))
    if (m) return m[1] ?? null
  }
  return null
}

/** Reads a UBL invoice; null when the file is not one. Whether we issued it is told by our own IČO. */
export function readInvoice(xml: string, ourIco: string | null): Reading | null {
  const tree = parseXml(xml)
  const invoice = (at(tree, 'Invoice') ?? at(tree, 'CreditNote')) as Node
  if (!invoice) return null
  const credit = Boolean(at(tree, 'CreditNote'))
  const supplier = partyOf(at(invoice, 'AccountingSupplierParty'))
  const customer = partyOf(at(invoice, 'AccountingCustomerParty'))
  const ours = ourIco !== null && icoAmong(supplier.ids) === ourIco
  const other = ours ? customer : supplier
  const means = list((invoice as Record<string, unknown>).PaymentMeans)[0]
  const payable = at(invoice, 'LegalMonetaryTotal', 'PayableAmount')
  const vat = list((invoice as Record<string, unknown>).TaxTotal).map((total) => toCents(text(at(total, 'TaxAmount')))).find((cents) => cents !== null) ?? null
  const iban = text(at(means, 'PayeeFinancialAccount', 'ID'))
  return {
    kind: credit ? 'other' : ours ? 'invoice_out' : 'invoice_in',
    party: other.name,
    partyIco: icoAmong(other.ids),
    partyIban: ours ? null : iban ? iban.replace(/\s/g, '').toUpperCase() : null,
    number: text(at(invoice, 'ID')),
    vs: text(at(means, 'PaymentID'))?.replace(/\D/g, '') || null,
    issuedOn: day(text(at(invoice, 'IssueDate'))),
    dueOn: day(text(at(invoice, 'DueDate')) ?? text(at(means, 'PaymentDueDate'))),
    totalCents: toCents(text(payable)),
    vatCents: vat,
    currency: (payable as Record<string, unknown> | undefined)?.['@currencyID'] as string | undefined ?? text(at(invoice, 'DocumentCurrencyCode')),
  }
}
