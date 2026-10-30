// The two files that arrive as data and are read by our own code, never by a model: the bank's statement
// (ISO 20022 camt.053, which every Slovak bank's internet banking exports) and an e-invoice (UBL 2.1, the form
// Peppol carries, which the digital postman delivers from 1 January 2027).
import { XMLParser } from 'fast-xml-parser'
import type { Category } from './booking'
import type { DocKind } from './match'

const LISTS = new Set(['STMTRS', 'STMTTRN', 'Stmt', 'Ntry', 'TxDtls', 'Bal', 'Ustrd', 'Strd', 'PartyIdentification', 'PartyLegalEntity', 'PaymentMeans', 'TaxTotal', 'TaxSubtotal', 'PartyTaxScheme', 'BillingReference'])

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
export function fingerprint(value: string): string {
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
  /** The balance the statement opens with (OPBD, or PRCD: the one the statement before closed with). */
  opening: { cents: number; on: string } | null
  closing: { cents: number; on: string } | null
  /** The bank's number of the statement (its legal sequence, else its electronic one, else its id). */
  number: string | null
  /** The days it covers, as the bank gives them. */
  from: string | null
  to: string | null
  entries: Entry[]
  /**
   * Tatra banka's export of movements, not a statement: its movements carry references of their own, so they are kept
   * as another source and a statement of the same days finds them by their content (store.ts, importEntries).
   */
  kind?: 'movements'
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

/** "20260930" (the OFX form of a day) as 2026-09-30; null when it is no day. */
function ofxDay(value: string | null): string | null {
  const m = value ? /^(\d{4})(\d{2})(\d{2})/.exec(value) : null
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** A card payment's merchant from Tatra banka's line: "400000******0002 BRATISLAVA JAN NOVAK 20260922 09:58:50 12.18EUR WWW.SHOP.SK". */
function cardMerchant(name: string): string | null {
  const m = /\d{8}\s+\d{2}:\d{2}:\d{2}\s+[\d.,]*[A-Z]{3}\s+(.+)$/.exec(name)
  return m ? (m[1] ?? '').trim().slice(0, 120) || null : null
}

/**
 * Tatra banka's XML of movements, as its internet banking exports it (an OFX-like <OFX><STMTRS>, seen on a real
 * export of 1 October 2026): the account in BANKACCTFROM, the days in BANKTRANLIST (DTSTART, DTEND as YYYYMMDD), each
 * movement a STMTTRN with TRNTYPE CREDIT or DEBIT and its amount without a sign, the other side's IBAN in BANKACCTTO
 * (ACCTID 0 when there is none), its name, MEMO, the variable symbol in TRNVASYM and the end-to-end reference
 * "/VS.../SS/KS". It carries no balances and no reference of the bank's own: a movement is told by its content.
 * A card payment names the card, the place, the time and the merchant in NAME ("POS nakup", "INT NAKUP POS EUR").
 */
function readOfx(tree: Record<string, unknown> | null): Statement[] | null {
  const root = at(tree, 'OFX') as Node
  if (!root) return null
  const statements: Statement[] = []
  for (const stmt of list((root as Record<string, unknown>).STMTRS)) {
    const iban = text(at(stmt, 'BANKACCTFROM', 'IBAN'))
    const tranList = at(stmt, 'BANKTRANLIST')
    const entries: Entry[] = []
    const seen = new Map<string, number>()
    for (const tx of list(tranList && (tranList as Record<string, unknown>).STMTTRN)) {
      const type = (text(at(tx, 'TRNTYPE')) ?? '').toUpperCase()
      const raw = text(at(tx, 'TRNAMT'))
      const cents = toCents(raw)
      const bookedOn = ofxDay(text(at(tx, 'DTPOSTED')) ?? text(at(tx, 'DTAVAIL')))
      if (cents === null || !bookedOn) continue
      // A signed amount says its direction itself; else the type does.
      const amount = raw?.trim().startsWith('-') ? cents : type === 'DEBIT' ? -Math.abs(cents) : Math.abs(cents)
      const name = text(at(tx, 'NAME'))
      const memo = text(at(tx, 'MEMO'))
      // A card payment by the masked card in NAME or "POS" ("POS nakup", "INT NAKUP POS EUR"), never by "nákup" alone:
      // a transfer's message may say "Nákup materiálu".
      const card = /^\d{4,6}\*+\d{4}\b/.test(name ?? '') || /\bPOS\b/i.test(name ?? '') || /\bPOS\b/i.test(memo ?? '')
      const otherIban = text(at(tx, 'BANKACCTTO', 'IBAN'))
      const partyIban = otherIban && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(otherIban.replace(/\s/g, '')) ? otherIban.replace(/\s/g, '').toUpperCase() : null
      const party = card && name ? (cardMerchant(name) ?? name) : name
      const fromSymbols = symbols(text(at(tx, 'REFERENCE_E2E')), memo)
      const vs = (text(at(tx, 'TRNVASYM')) ?? '').replace(/^0+(?=\d)/, '') || fromSymbols.vs
      const note = memo
      const base = `t:${fingerprint([bookedOn, amount, partyIban, vs, memo, name].join('|'))}`
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      entries.push({
        ref: count > 0 ? `${base}#${count + 1}` : base,
        bookedOn,
        amountCents: amount,
        currency: text(at(tx, 'CURRENCY')) ?? 'EUR',
        party,
        partyIban,
        vs,
        ss: fromSymbols.ss,
        ks: fromSymbols.ks,
        note,
        card,
      })
    }
    const days = entries.map((e) => e.bookedOn).sort()
    const from = ofxDay(text(at(tranList, 'DTSTART'))) ?? days[0] ?? null
    const end = ofxDay(text(at(tranList, 'DTEND')))
    // DTEND is the day after the last one the export covers (exclusive): a September export ends 20261001 and covers
    // September whole, also the days after its last movement. Never earlier than the last movement.
    const before = end ? new Date(Date.parse(`${end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : null
    const last = days[days.length - 1] ?? null
    const to = before && last ? (before > last ? before : last) : (before ?? last)
    statements.push({ iban: iban ? iban.replace(/\s/g, '').toUpperCase() : null, currency: entries[0]?.currency ?? 'EUR', opening: null, closing: null, number: null, from, to, entries, kind: 'movements' })
  }
  return statements.length > 0 ? statements : null
}

/** Reads a camt.053 statement, or Tatra banka's XML of movements; null when the file is neither. */
export function readStatement(xml: string): Statement[] | null {
  const tree = parseXml(xml)
  const root = at(tree, 'Document', 'BkToCstmrStmt') as Node
  if (!root) return readOfx(tree)
  const statements: Statement[] = []
  for (const stmt of list((root as Record<string, unknown>).Stmt)) {
    const iban = text(at(stmt, 'Acct', 'Id', 'IBAN'))
    const currency = text(at(stmt, 'Acct', 'Ccy'))
    let closing: Statement['closing'] = null
    let opening: Statement['opening'] = null
    for (const bal of list((stmt as Record<string, unknown>).Bal)) {
      const type = text(at(bal, 'Tp', 'CdOrPrtry', 'Cd'))
      if (type !== 'CLBD' && type !== 'OPBD' && type !== 'PRCD') continue
      const cents = toCents(text(at(bal, 'Amt')))
      const on = day(text(at(bal, 'Dt', 'Dt')) ?? text(at(bal, 'Dt', 'DtTm')))
      if (cents === null || !on) continue
      const balance = { cents: text(at(bal, 'CdtDbtInd')) === 'DBIT' ? -cents : cents, on }
      if (type === 'CLBD') closing = balance
      else if (type === 'OPBD' || !opening) opening = balance
    }
    const number = text(at(stmt, 'LglSeqNb')) ?? text(at(stmt, 'ElctrncSeqNb')) ?? text(at(stmt, 'Id'))
    const from = day(text(at(stmt, 'FrToDt', 'FrDtTm')) ?? text(at(stmt, 'FrToDt', 'FrDt')))
    const to = day(text(at(stmt, 'FrToDt', 'ToDtTm')) ?? text(at(stmt, 'FrToDt', 'ToDt')))
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
    statements.push({ iban: iban ? iban.replace(/\s/g, '').toUpperCase() : null, currency, opening, closing, number: number ? number.slice(0, 60) : null, from, to, entries })
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
  /** What is left to pay when the document says less than its total (a credit, a balance or an overpayment set off:
   *  "Applied balance", "Započítaný preplatok"); never the total itself, null when it is. */
  dueCents?: number | null
  /** What it is for, as the reader judged it; an e-invoice says nothing of it. */
  category?: Category | null
  /** For VAT (src/app/vat.ts), as far as the document says: the other side's VAT number, the day of supply,
   *  that the supplier is abroad, the invoice a corrective one corrects, and the base and VAT of each rate. */
  partyVatId?: string | null
  suppliedOn?: string | null
  foreign?: boolean | null
  corrects?: string | null
  vatLines?: { rate: number; base: number; vat: number }[] | null
  /** An eKasa receipt's identifier and the seller's verification code (src/app/ekasa.ts), as the reader wrote them. */
  ekasaUid?: string | null
  ekasaOkp?: string | null
  /** A prepayment invoice (386): it documents money paid already, so it is never offered to be paid. */
  prepaid?: boolean
  /** The supplier's Peppol address as the e-invoice names it ("0245:2023489446"), set beside the network's sender. */
  supplierEndpoint?: string | null
}

/** The fields of a reading kept as the reader gave them (`documents.reading`) and compared with the booking on the
 *  page "Presnosť softvéru" (team/ai-accuracy.ts), in the order the page lists them. */
export const READ_FIELDS = ['kind', 'party', 'partyIco', 'number', 'vs', 'issuedOn', 'dueOn', 'totalCents', 'vatCents', 'currency', 'category'] as const
export type ReadField = (typeof READ_FIELDS)[number]

/** What is kept of a reading: its fields as the reader gave them. */
export function readingJson(r: Reading): string {
  const out: Record<string, unknown> = {}
  for (const field of READ_FIELDS) out[field] = (r as unknown as Record<string, unknown>)[field] ?? null
  return JSON.stringify(out)
}

function partyOf(node: unknown): { name: string | null; ids: string[]; vatId: string | null; country: string | null } {
  const party = at(node, 'Party')
  const name = text(at(party, 'PartyLegalEntity', 'RegistrationName')) ?? text(at(party, 'PartyName', 'Name'))
  const ids = [
    text(at(party, 'EndpointID')),
    ...list(party && (party as Record<string, unknown>).PartyIdentification).map((pid) => text(at(pid, 'ID'))),
    text(at(party, 'PartyLegalEntity', 'CompanyID')),
    text(at(party, 'PartyTaxScheme', 'CompanyID')),
  ].filter((id): id is string => Boolean(id))
  // The VAT number is the tax scheme's "VAT" entry (BT-31, BT-48): two letters and the number.
  const vatId =
    list(party && (party as Record<string, unknown>).PartyTaxScheme)
      .filter((scheme) => (text(at(scheme, 'TaxScheme', 'ID')) ?? 'VAT') === 'VAT')
      .map((scheme) => text(at(scheme, 'CompanyID'))?.replace(/\s/g, '').toUpperCase() ?? null)
      .find((id): id is string => Boolean(id && /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(id))) ?? null
  const country = text(at(party, 'PostalAddress', 'Country', 'IdentificationCode'))?.toUpperCase() ?? null
  return { name, ids, vatId, country }
}

/** An IČO among a party's identifiers: eight digits, possibly behind a scheme ("0245:57442452"). */
function icoAmong(ids: string[]): string | null {
  for (const id of ids) {
    const m = /(?:^|\D)(\d{8})$/.exec(id.replace(/\s/g, ''))
    if (m) return m[1] ?? null
  }
  return null
}

/** A currency's code as ISO 4217 writes it, else none. */
const currencyOf = (code: string | null | undefined): string | null => {
  const upper = code?.trim().toUpperCase() ?? ''
  return /^[A-Z]{3}$/.test(upper) ? upper : null
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
  // What an invoice is worth is its total with VAT (BT-112), which its VAT breakdown makes; what is left to pay (BT-115)
  // is less when an amount paid before is set off (BT-113). A prepayment invoice (386) documents money paid already.
  const prepayment = text(at(invoice, 'InvoiceTypeCode')) === '386'
  const inclusive = at(invoice, 'LegalMonetaryTotal', 'TaxInclusiveAmount')
  const payableNode = at(invoice, 'LegalMonetaryTotal', 'PayableAmount')
  const payable = text(inclusive) !== null ? inclusive : payableNode
  const totalOf = toCents(text(payable))
  const dueOf = prepayment || credit ? null : toCents(text(payableNode))
  const due = totalOf !== null && dueOf !== null && dueOf >= 0 && dueOf < totalOf ? dueOf : null
  const vat = list((invoice as Record<string, unknown>).TaxTotal).map((total) => toCents(text(at(total, 'TaxAmount')))).find((cents) => cents !== null) ?? null
  const iban = text(at(means, 'PayeeFinancialAccount', 'ID'))
  // The base and VAT of each rate, as the invoice itself sums them (BG-23); a credit note's are the amounts it takes back.
  const sign = credit ? -1 : 1
  const vatLines = list((invoice as Record<string, unknown>).TaxTotal)
    .flatMap((total) => list((total as Record<string, unknown> | undefined)?.TaxSubtotal))
    .map((sub) => ({ rate: Number(text(at(sub, 'TaxCategory', 'Percent')) ?? 'NaN'), base: toCents(text(at(sub, 'TaxableAmount'))), vat: toCents(text(at(sub, 'TaxAmount'))) }))
    .filter((line): line is { rate: number; base: number; vat: number } => Number.isFinite(line.rate) && line.base !== null && line.vat !== null)
    .map((line) => ({ rate: Math.round(line.rate), base: sign * line.base, vat: sign * line.vat }))
  const supplied = day(text(at(invoice, 'TaxPointDate')) ?? text(at(invoice, 'Delivery', 'ActualDeliveryDate')) ?? text(at(invoice, 'InvoicePeriod', 'EndDate')))
  const corrected = text(at(invoice, 'BillingReference', 'InvoiceDocumentReference', 'ID'))
  const endpointNode = at(invoice, 'AccountingSupplierParty', 'Party', 'EndpointID')
  const endpointScheme = endpointNode && typeof endpointNode === 'object' ? String((endpointNode as Record<string, unknown>)['@schemeID'] ?? '') : ''
  const endpointValue = text(endpointNode)
  const supplierEndpoint = /^\d{4}$/.test(endpointScheme) && endpointValue && /^[A-Za-z0-9._-]{1,50}$/.test(endpointValue) ? `${endpointScheme}:${endpointValue}`.toLowerCase() : null
  // An e-invoice comes from anybody in the network: every text it gives is cut to what a field of ours holds, so one
  // outsized value can neither fill a row nor stop what comes with it (the review of 26 October 2026).
  const cap = (value: string | null | undefined, n: number): string | null => (value ? value.slice(0, n) : null)
  const ibanText = iban ? iban.replace(/\s/g, '').toUpperCase() : null
  const vsText = text(at(means, 'PaymentID'))?.replace(/\D/g, '') || null
  return {
    partyVatId: cap(other.vatId, 32),
    suppliedOn: supplied,
    foreign: other.country ? other.country !== 'SK' : null,
    corrects: credit ? cap(corrected, 64) : null,
    vatLines: vatLines.length > 0 ? vatLines.slice(0, 20) : null,
    kind: credit ? 'other' : ours ? 'invoice_out' : 'invoice_in',
    party: cap(other.name, 200),
    partyIco: icoAmong(other.ids),
    partyIban: ours || !ibanText || ibanText.length > 34 ? null : ibanText,
    number: cap(text(at(invoice, 'ID')), 64),
    // A variable symbol has ten digits at most: a longer reference is none.
    vs: vsText && vsText.length <= 10 ? vsText : null,
    issuedOn: day(text(at(invoice, 'IssueDate'))),
    dueOn: day(text(at(invoice, 'DueDate')) ?? text(at(means, 'PaymentDueDate'))),
    totalCents: totalOf,
    ...(due !== null ? { dueCents: due } : {}),
    vatCents: vat,
    currency: currencyOf((payable as Record<string, unknown> | undefined)?.['@currencyID'] as string | undefined ?? text(at(invoice, 'DocumentCurrencyCode'))),
    ...(prepayment ? { prepaid: true } : {}),
    supplierEndpoint,
  }
}
