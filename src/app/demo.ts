// The sample companies of the playground and of the preview, and the sample team that keeps their books.
//
// Ukážková firma s. r. o. (Martin Novák, a VAT payer on Rast, kept by Lucia): three card payments that still need a
// receipt, invoices that were paired by themselves and booked, a receipt and an invoice that wait to be booked, a
// scan nobody could read, the same invoice sent twice, and money put in by the owner that Lucia has to look at.
// Ateliér Nova s. r. o. (Eva Kollárová with Martin as her partner, Štart, kept by Jana): a question that waits for
// an answer and an invoice to book. Two requests from the site wait for the administrator (Christian).
//
// Everything is dated from today, so it always looks current. Every document has its original: a small PDF made
// here from its own figures, so that "Otvoriť originál" opens something that says what the form says. Martin's bank
// sends a statement to the company's address every day with a movement: each payment came with one, kept with its
// file as the bank would have sent it.
// It exists only where the Worker is told so (DEMO=1 on a developer's own machine: src/app/routes.tsx).
import { TERMS_VERSION } from '../config'
import { now } from '../db'
import { COMPANY_COLUMNS, DOC_COLUMNS, DOC_FROM, companyOf, docOf, eventStatement, insertPaymentStatement, messageStatement, vatCompanyOf, vatDocOf } from './store'
import { proposeVat } from './vat'
import { fileHash } from './read'

export const DEMO = {
  company: 'demo-company',
  user: 'demo-user',
  email: 'ukazka@firmony.test',
  account: 'demo-account',
  second: 'demo-company-2',
  secondUser: 'demo-user-2',
  secondAccount: 'demo-account-2',
  admin: 'demo-admin',
  accountant: 'demo-accountant',
  accountant2: 'demo-accountant-2',
} as const

function shift(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const at = (today: string, days: number, hour: number, minute: number) =>
  Math.floor(Date.parse(`${shift(today, days)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+02:00`) / 1000)

const ascii = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, ' ')
const euro = (cents: number) =>
  `${Math.floor(cents / 100)
    .toLocaleString('sk-SK')
    .replace(/\s/g, ' ')},${String(cents % 100).padStart(2, '0')} EUR`
const sk = (day: string) => `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}`

/** A one-page PDF of plain lines (Helvetica, letters without accents): the original of a sample document. */
export function demoPdf(width: number, height: number, lines: { text: string; size?: number; bold?: boolean; gap?: number }[]): Uint8Array {
  let y = height - 44
  const body = lines
    .map((line) => {
      const size = line.size ?? 10
      y -= (line.gap ?? 0) + size * 1.45
      const text = ascii(line.text).replace(/[\\()]/g, (ch) => `\\${ch}`)
      return `BT /${line.bold ? 'F2' : 'F1'} ${size} Tf 28 ${y.toFixed(1)} Td (${text}) Tj ET`
    })
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

interface SampleDoc {
  id: string
  company: string
  /** Days before today it arrived. */
  arrived: number
  source: 'upload' | 'email' | 'einvoice'
  addedBy?: string
  kind: 'receipt' | 'invoice_in' | 'invoice_out'
  party: string
  ico?: string
  iban?: string
  number?: string
  vs?: string
  issued: number
  due?: number
  total: number
  vat?: number
  category?: string
  proposal?: 'ai' | 'rule'
  deduct?: boolean
  booked?: { by: string; daysAgo: number }
  privately?: boolean
  /** The other side's VAT number as the document gives it, and the reader's word that it is based abroad. */
  vatId?: string
  foreign?: boolean
  duplicateOf?: string
  /** The reader could not read it: only the file is known. */
  manual?: boolean
  /** What the original says, when it is not the document's own figures (a scan nobody could read). */
  original?: { party: string; number: string; total: number; vat: number; item: string }
  fileName?: string
}

/** A sample receipt's eKasa codes (src/app/ekasa.ts), made up from its id and the same on every run. */
export function sampleCodes(id: string): { uid: string; okp: string } {
  let x = 2166136261
  for (const ch of id) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0
  let hex = ''
  while (hex.length < 72) {
    x = (x + 0x9e3779b9) >>> 0
    let z = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    hex += ((z ^ (z >>> 16)) >>> 0).toString(16).toUpperCase().padStart(8, '0')
  }
  return { uid: `O-${hex.slice(0, 32)}`, okp: (hex.slice(32, 72).match(/.{8}/g) ?? []).join('-') }
}

/** The lines of a sample original: an invoice on A5, a receipt on a till's narrow paper. */
function originalOf(d: SampleDoc, today: string, buyer: string): { pdf: Uint8Array; name: string } {
  const o = d.original ?? { party: d.party, number: d.number ?? '', total: d.total, vat: d.vat ?? 0, item: d.kind === 'invoice_out' ? 'Navrh a sadzba katalogu' : 'Sluzby podla objednavky' }
  if (d.kind === 'receipt') {
    const base = o.total - o.vat
    const codes = sampleCodes(d.id)
    return {
      name: d.fileName ?? `blocek-${d.id.slice(-1)}.pdf`,
      pdf: demoPdf(226, 360, [
        { text: o.party, size: 12, bold: true },
        { text: 'Hlavna 12, Kosice' },
        { text: `${sk(shift(today, d.issued))}  14:32`, gap: 6 },
        { text: 'Pero gelove modre 3 ks      4,50', gap: 10 },
        { text: 'Zosit A4 linajkovy 2 ks      4,40' },
        { text: `SPOLU                   ${euro(o.total)}`, bold: true, gap: 10 },
        { text: `Zaklad 23 %             ${euro(base)}` },
        { text: `DPH 23 %                ${euro(o.vat)}` },
        { text: 'Platba karta', gap: 10 },
        { text: 'Kod pokladnice 88812345678900001', size: 7, gap: 10 },
        { text: `UID: ${codes.uid}`, size: 7 },
        { text: `OKP: ${codes.okp.slice(0, 27)}`, size: 7 },
        { text: `     ${codes.okp.slice(27)}`, size: 7 },
      ]),
    }
  }
  const issuedOn = shift(today, d.issued)
  const base = o.total - o.vat
  return {
    name: d.fileName ?? `faktura-${(o.number || d.id).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`,
    pdf: demoPdf(420, 595, [
      { text: o.party, size: 15, bold: true },
      { text: d.ico ? `ICO ${d.ico}` : 'Kosice' },
      { text: `Faktura c. ${o.number}`, size: 13, bold: true, gap: 16 },
      { text: `Datum vystavenia: ${sk(issuedOn)}` },
      { text: `Datum splatnosti: ${sk(shift(today, d.due ?? d.issued + 14))}` },
      { text: `Odberatel: ${d.kind === 'invoice_out' ? o.party : buyer}`, gap: 10 },
      { text: `${o.item}`, gap: 16 },
      { text: `Zaklad dane: ${euro(base)}`, gap: 8 },
      {
        text:
          o.vat > 0
            ? `DPH 23 %: ${euro(o.vat)}`
            : d.foreign
              ? 'Reverse charge: VAT to be accounted for by the recipient'
              : d.kind === 'invoice_out'
                ? 'Oslobodene od dane, dan plati odberatel'
                : 'Nie sme platitelia DPH',
      },
      ...(d.vatId ? [{ text: `${d.kind === 'invoice_out' ? 'IC DPH odberatela' : 'IC DPH'}: ${d.vatId}` }] : []),
      { text: `Spolu na uhradu: ${euro(o.total)}`, size: 12, bold: true, gap: 4 },
      ...(d.iban ? [{ text: `IBAN: ${d.iban}`, gap: 12 }] : []),
      ...(d.vs ? [{ text: `Variabilny symbol: ${d.vs}` }] : []),
    ]),
  }
}

const xmlText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xmlMoney = (cents: number) => (Math.abs(cents) / 100).toFixed(2)

interface CamtEntry {
  ref: string
  day: string
  cents: number
  party: string | null
  iban: string | null
  vs: string | null
  note: string | null
  card: boolean
}

/** One day's statement of an account (camt.053.001.02), as a bank sends it. */
function demoCamt(s: { iban: string; day: string; number: number; opening: number; closing: number; entries: CamtEntry[] }): string {
  const bal = (code: string, cents: number) =>
    `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${xmlMoney(cents)}</Amt><CdtDbtInd>${cents < 0 ? 'DBIT' : 'CRDT'}</CdtDbtInd><Dt><Dt>${s.day}</Dt></Dt></Bal>`
  const ntry = (e: CamtEntry) => {
    const side = e.cents < 0 ? 'Cdtr' : 'Dbtr'
    const details = [
      e.vs ? `<Refs><EndToEndId>/VS${e.vs}/SS/KS</EndToEndId></Refs>` : '',
      e.party || e.iban
        ? `<RltdPties>${e.party ? `<${side}><Nm>${xmlText(e.party)}</Nm></${side}>` : ''}${e.iban ? `<${side}Acct><Id><IBAN>${e.iban}</IBAN></Id></${side}Acct>` : ''}</RltdPties>`
        : '',
      e.note && !e.card ? `<RmtInf><Ustrd>${xmlText(e.note)}</Ustrd></RmtInf>` : '',
    ].join('')
    return [
      `<Ntry><Amt Ccy="EUR">${xmlMoney(e.cents)}</Amt><CdtDbtInd>${e.cents < 0 ? 'DBIT' : 'CRDT'}</CdtDbtInd><Sts>BOOK</Sts>`,
      `<BookgDt><Dt>${e.day}</Dt></BookgDt><ValDt><Dt>${e.day}</Dt></ValDt><AcctSvcrRef>${xmlText(e.ref)}</AcctSvcrRef>`,
      e.card ? '<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>CCRD</Cd><SubFmlyCd>POSD</SubFmlyCd></Fmly></Domn></BkTxCd>' : '',
      details ? `<NtryDtls><TxDtls>${details}</TxDtls></NtryDtls>` : '',
      e.card && e.party ? `<AddtlNtryInf>Platba kartou ${xmlText(e.party)}</AddtlNtryInf>` : !details && e.note ? `<AddtlNtryInf>${xmlText(e.note)}</AddtlNtryInf>` : '',
      '</Ntry>',
    ].join('')
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">',
    `<BkToCstmrStmt><GrpHdr><MsgId>${s.day}-${s.number}</MsgId><CreDtTm>${s.day}T22:00:00</CreDtTm></GrpHdr>`,
    `<Stmt><Id>${s.day}-${s.number}</Id><ElctrncSeqNb>${s.number}</ElctrncSeqNb><CreDtTm>${s.day}T22:00:00</CreDtTm>`,
    `<FrToDt><FrDtTm>${s.day}T00:00:00</FrDtTm><ToDtTm>${s.day}T23:59:59</ToDtTm></FrToDt>`,
    `<Acct><Id><IBAN>${s.iban}</IBAN></Id><Ccy>EUR</Ccy></Acct>`,
    bal('OPBD', s.opening),
    bal('CLBD', s.closing),
    ...s.entries.map(ntry),
    '</Stmt></BkToCstmrStmt></Document>',
    '',
  ].join('\n')
}

/**
 * The statements that brought an account's payments, one for each day with a movement, as the bank sent them the
 * next morning: taken, with their files. Their closing balances run from nothing to the account's balance.
 */
async function seedStatements(db: D1Database, files: R2Bucket | undefined, company: string, account: string, iban: string, ts: number): Promise<void> {
  const rows = await db
    .prepare('SELECT ref, booked_on, amount_cents, party, party_iban, vs, note, card FROM payments WHERE account_id = ? ORDER BY booked_on, rowid')
    .bind(account)
    .all<{ ref: string; booked_on: string; amount_cents: number; party: string | null; party_iban: string | null; vs: string | null; note: string | null; card: number }>()
  const days = new Map<string, CamtEntry[]>()
  for (const r of rows.results)
    days.set(r.booked_on, [...(days.get(r.booked_on) ?? []), { ref: r.ref, day: r.booked_on, cents: r.amount_cents, party: r.party, iban: r.party_iban, vs: r.vs, note: r.note, card: r.card === 1 }])
  const out: D1PreparedStatement[] = []
  let balance = 0
  let number = 0
  for (const [day, entries] of days) {
    number++
    const opening = balance
    const closing = opening + entries.reduce((sum, e) => sum + e.cents, 0)
    const bytes = new TextEncoder().encode(demoCamt({ iban, day, number, opening, closing, entries }))
    const id = `demo-st-${company}-${number}`
    const key = files ? `companies/${company}/statements/${id}.xml` : null
    if (files && key) await files.put(key, bytes, { httpMetadata: { contentType: 'application/xml' } })
    const arrived = Math.min(ts - 600, Math.floor(Date.parse(`${day}T12:00:00Z`) / 1000) + 86400 - 6 * 3600 + 10 * 60)
    out.push(
      db
        .prepare(
          `INSERT INTO statements (id, company_id, account_id, iban, created_at, source, file_key, file_hash, file_name, part, number, from_on, to_on,
             opening_cents, opening_on, closing_cents, closing_on, entries, added, known, status)
           VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'taken')`,
        )
        .bind(id, company, account, iban, arrived, key, await fileHash(bytes), `vypis-${day}.xml`, String(number), day, day, opening, day, closing, day, entries.length, entries.length),
    )
    balance = closing
  }
  if (out.length > 0) await db.batch(out)
}

export async function seedDemo(db: D1Database, today: string, files?: R2Bucket): Promise<void> {
  const exists = await db.prepare('SELECT 1 AS ok FROM companies WHERE id = ?').bind(DEMO.company).first()
  if (exists) return
  const ts = now()
  const c1 = DEMO.company
  const c2 = DEMO.second
  const day = (n: number) => shift(today, n)
  const pay = (
    company: string,
    account: string,
    ref: string,
    n: number,
    cents: number,
    party: string | null,
    extra: { iban?: string; vs?: string; note?: string; card?: boolean; exempt?: string } = {},
  ) =>
    insertPaymentStatement(
      db,
      company,
      account,
      {
        ref,
        bookedOn: day(n),
        amountCents: cents,
        currency: 'EUR',
        party,
        partyIban: extra.iban ?? null,
        vs: extra.vs ?? null,
        ss: null,
        ks: null,
        note: extra.note ?? null,
        card: extra.card ?? false,
      },
      extra.exempt ?? null,
    )
  const link = (company: string, account: string, docId: string, paymentRef: string, how: string, by: string | null) =>
    db
      .prepare(`INSERT INTO links (document_id, payment_id, company_id, how, by, created_at) SELECT ?, id, company_id, ?, ?, ? FROM payments WHERE account_id = ? AND ref = ? AND company_id = ?`)
      .bind(docId, how, by, ts, account, paymentRef, company)
  const user = (id: string, email: string, name: string, team: string | null) =>
    db.prepare('INSERT INTO users (id, created_at, email, name, team) VALUES (?, ?, ?, ?, ?)').bind(id, ts - 60 * 86400, email, name, team)

  // Days from today to a day of the month before: what the VAT return being filed now holds.
  const lastMonth = shift(`${today.slice(0, 7)}-01`, -1).slice(0, 7)
  const inLastMonth = (dayOfMonth: number) => Math.round((Date.parse(`${lastMonth}-${String(dayOfMonth).padStart(2, '0')}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  const docs: SampleDoc[] = [
    // Ukážková firma: paired by themselves and booked.
    {
      id: 'demo-doc-1',
      company: c1,
      arrived: 3,
      source: 'email',
      kind: 'invoice_in',
      party: 'Hostingový dom s. r. o.',
      ico: '36123456',
      vatId: 'SK2020123456',
      iban: 'SK8975000000000012345671',
      number: '2026118',
      vs: '2026118',
      issued: -12,
      due: -2,
      total: 5990,
      vat: 1120,
      category: 'services',
      proposal: 'rule',
      deduct: true,
      booked: { by: DEMO.accountant, daysAgo: 2 },
    },
    {
      id: 'demo-doc-2',
      company: c1,
      arrived: 20,
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'invoice_out',
      party: 'Digitálne štúdio Vlna s. r. o.',
      ico: '54123987',
      number: '20260005',
      vs: '20260005',
      issued: -21,
      due: -7,
      total: 123000,
      vat: 23000,
      category: 'sales',
      proposal: 'ai',
      booked: { by: DEMO.accountant, daysAgo: 19 },
    },
    {
      id: 'demo-doc-3',
      company: c1,
      arrived: 9,
      source: 'email',
      kind: 'invoice_in',
      party: 'Coworking Nádvorie s. r. o.',
      ico: '51234567',
      vatId: 'SK2121234567',
      iban: 'SK0809000000000123123123',
      number: 'FA1026',
      vs: '1026',
      issued: -9,
      due: -2,
      total: 15000,
      vat: 2805,
      category: 'services',
      proposal: 'rule',
      deduct: true,
      booked: { by: DEMO.accountant, daysAgo: 7 },
    },
    {
      id: 'demo-doc-4',
      company: c1,
      arrived: 11,
      source: 'einvoice',
      kind: 'invoice_in',
      party: 'Mobilný operátor a. s.',
      ico: '35000001',
      vatId: 'SK2020000001',
      iban: 'SK2111000000002612345678',
      number: '7781202610',
      vs: '7781202610',
      issued: -12,
      due: -2,
      total: 1999,
      vat: 374,
      category: 'services',
      proposal: 'ai',
      deduct: true,
      booked: { by: DEMO.accountant, daysAgo: 9 },
    },
    {
      id: 'demo-doc-5',
      company: c1,
      arrived: 16,
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'invoice_in',
      party: 'Grafické štúdio Linka',
      ico: '53456789',
      number: '1112026',
      vs: '1112026',
      issued: -18,
      due: -4,
      total: 32000,
      category: 'services',
      proposal: 'ai',
      deduct: false,
      booked: { by: DEMO.accountant, daysAgo: 14 },
    },
    // Ukážková firma: waiting for Lucia.
    {
      id: 'demo-doc-6',
      company: c1,
      arrived: 5,
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'receipt',
      party: 'Papiernictvo Pero',
      issued: -5,
      total: 890,
      vat: 166,
      category: 'material',
      proposal: 'ai',
      deduct: true,
      privately: true,
    },
    {
      id: 'demo-doc-7',
      company: c1,
      arrived: 2,
      source: 'email',
      kind: 'invoice_in',
      party: 'Tlačiareň Farba s. r. o.',
      ico: '47654321',
      vatId: 'SK2023456789',
      iban: 'SK4402000000003456789012',
      number: '2026-0412',
      vs: '20260412',
      issued: -2,
      due: 12,
      total: 8640,
      vat: 1616,
      category: 'services',
      proposal: 'ai',
      deduct: true,
    },
    {
      id: 'demo-doc-8',
      company: c1,
      arrived: 1,
      source: 'email',
      kind: 'invoice_in',
      party: '',
      issued: -3,
      total: 0,
      manual: true,
      fileName: 'sken-faktury.pdf',
      original: { party: 'Kvetinárstvo Lúka', number: '2026117', total: 4500, vat: 841, item: 'Kvety na otvorenie kancelarie' },
    },
    {
      id: 'demo-doc-9',
      company: c1,
      arrived: 0,
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'invoice_in',
      party: 'Hostingový dom s. r. o.',
      ico: '36123456',
      vatId: 'SK2020123456',
      iban: 'SK8975000000000012345671',
      number: '2026118',
      vs: '2026118',
      issued: -12,
      due: -2,
      total: 5990,
      vat: 1120,
      category: 'services',
      proposal: 'rule',
      deduct: true,
      duplicateOf: 'demo-doc-1',
      fileName: 'faktura-hosting.pdf',
    },
    // Ukážková firma, the month before: what its VAT return holds, all of it booked. Advertising from Google in
    // Ireland, on which the company pays the VAT itself and deducts it (B.1); a sale to a person who is not a business
    // (D.2); a receipt for office supplies (B.3.1); a service to a Czech company, which the customer pays the VAT on.
    {
      id: 'demo-doc-10',
      company: c1,
      arrived: -inLastMonth(5) - 1,
      source: 'email',
      kind: 'invoice_in',
      party: 'Google Ireland Limited',
      vatId: 'IE6388047V',
      foreign: true,
      number: '5432109876',
      issued: inLastMonth(4),
      due: inLastMonth(4),
      total: 4900,
      vat: 0,
      category: 'services',
      proposal: 'ai',
      deduct: true,
      booked: { by: DEMO.accountant, daysAgo: -inLastMonth(7) },
    },
    {
      id: 'demo-doc-11',
      company: c1,
      arrived: -inLastMonth(18),
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'invoice_out',
      party: 'Ján Kováč',
      number: '20260004',
      vs: '20260004',
      issued: inLastMonth(18),
      due: inLastMonth(28),
      total: 24600,
      vat: 4600,
      category: 'sales',
      proposal: 'ai',
      booked: { by: DEMO.accountant, daysAgo: -inLastMonth(20) },
    },
    {
      id: 'demo-doc-12',
      company: c1,
      arrived: -inLastMonth(9),
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'receipt',
      party: 'Kancelária Expres',
      issued: inLastMonth(8),
      total: 2460,
      vat: 460,
      category: 'material',
      proposal: 'ai',
      deduct: true,
      privately: true,
      booked: { by: DEMO.accountant, daysAgo: -inLastMonth(11) },
    },
    {
      id: 'demo-doc-13',
      company: c1,
      arrived: -inLastMonth(25),
      source: 'upload',
      addedBy: DEMO.user,
      kind: 'invoice_out',
      party: 'Digitální studio Brno s.r.o.',
      ico: '27654321',
      vatId: 'CZ27654321',
      number: '20260003',
      vs: '20260003',
      issued: inLastMonth(24),
      due: inLastMonth(28) + 14,
      total: 80000,
      vat: 0,
      category: 'sales',
      proposal: 'ai',
      booked: { by: DEMO.accountant, daysAgo: -inLastMonth(26) },
    },
    // Ateliér Nova.
    {
      id: 'demo-doc-21',
      company: c2,
      arrived: 4,
      source: 'upload',
      addedBy: DEMO.secondUser,
      kind: 'invoice_in',
      party: 'Websupport s. r. o.',
      ico: '36421928',
      vatId: 'SK2020222244',
      number: 'VF2026104418',
      vs: '2026104418',
      issued: -5,
      due: 9,
      total: 1290,
      vat: 241,
      category: 'services',
      proposal: 'ai',
    },
    {
      id: 'demo-doc-22',
      company: c2,
      arrived: 13,
      source: 'upload',
      addedBy: DEMO.secondUser,
      kind: 'invoice_out',
      party: 'Kaviareň Zrnko s. r. o.',
      ico: '52987654',
      number: '2026003',
      vs: '2026003',
      issued: -14,
      due: 0,
      total: 85000,
      category: 'sales',
      proposal: 'ai',
      booked: { by: DEMO.accountant2, daysAgo: 11 },
    },
    // Ateliér Nova is not registered for VAT and paid for advertising on Instagram: a registration under § 7a is due.
    {
      id: 'demo-doc-23',
      company: c2,
      arrived: 6,
      source: 'email',
      kind: 'invoice_in',
      party: 'Meta Platforms Ireland Limited',
      vatId: 'IE9692928F',
      foreign: true,
      number: 'FBADS-104-2026',
      issued: -7,
      due: -7,
      total: 3000,
      vat: 0,
      category: 'services',
      proposal: 'ai',
    },
  ]

  /** An invoice of Ukážková firma with its lines, and the document it is (booked, when it was issued). */
  const sampleInvoice = (inv: {
    id: string
    seq: number | null
    customer: string
    ico: string
    address: string
    email: string | null
    issued: number
    due: number
    lines: [string, number, string, number][]
    sent: boolean
  }) => {
    const lines = inv.lines.map(([description, milli, unit, cents], i) => ({ position: i + 1, description, milli, unit, cents, base: Math.round((milli * cents) / 1000) }))
    const base = lines.reduce((sum, l) => sum + l.base, 0)
    const vat = Math.round((base * 23) / 100)
    const number = inv.seq === null ? null : `2026${String(inv.seq).padStart(4, '0')}`
    const docId = `demo-doc-${inv.id.slice(5)}`
    const token = `demo${inv.id.replace(/-/g, '')}`.padEnd(43, 'x').slice(0, 43)
    return [
      db
        .prepare(
          `INSERT INTO invoices (id, company_id, created_at, created_by, status, year, seq, number, customer_name, customer_ico, customer_address, customer_email,
             issued_on, delivered_on, due_on, base_cents, vat_cents, total_cents, iban, token, document_id, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          inv.id,
          c1,
          ts + inv.issued * 86400,
          DEMO.user,
          number ? 'issued' : 'draft',
          number ? 2026 : null,
          inv.seq,
          number,
          inv.customer,
          inv.ico,
          inv.address,
          inv.email,
          day(inv.issued),
          day(inv.issued),
          day(inv.due),
          base,
          vat,
          base + vat,
          'SK3112000000198742637541',
          token,
          number ? docId : null,
          inv.sent ? ts + inv.issued * 86400 + 600 : null,
        ),
      ...lines.map((l) =>
        db
          .prepare('INSERT INTO invoice_lines (invoice_id, position, description, quantity_milli, unit, unit_cents, vat_rate, base_cents) VALUES (?, ?, ?, ?, ?, ?, 23, ?)')
          .bind(inv.id, l.position, l.description, l.milli, l.unit, l.cents, l.base),
      ),
      ...(number
        ? [
            db
              .prepare(
                `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_ico, number, vs, issued_on, due_on, total_cents, vat_cents, currency, category, booked_at, booked_by, invoice_id)
                 VALUES (?, ?, ?, 'issued', ?, 'read', 'issued', 'invoice_out', ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', 'sales', ?, ?, ?)`,
              )
              .bind(
                docId,
                c1,
                ts + inv.issued * 86400,
                DEMO.user,
                inv.customer,
                inv.ico,
                number,
                number,
                day(inv.issued),
                day(inv.due),
                base + vat,
                vat,
                ts + (inv.issued + 1) * 86400,
                DEMO.accountant,
                inv.id,
              ),
          ]
        : []),
    ]
  }

  const docStatements: D1PreparedStatement[] = []
  for (const d of docs) {
    let file: { key: string; name: string; bytes: number } | null = null
    if (files) {
      const { pdf, name } = originalOf(d, today, d.company === c1 ? 'Ukazkova firma s. r. o.' : 'Atelier Nova s. r. o.')
      const key = `companies/${d.company}/documents/${d.id}.pdf`
      await files.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } })
      file = { key, name, bytes: pdf.byteLength }
    }
    const read = !d.manual
    docStatements.push(
      db
        .prepare(
          `INSERT INTO documents (id, company_id, created_at, source, added_by, file_key, file_type, file_name, file_bytes, status, read_by,
             kind, party, party_ico, party_iban, number, vs, issued_on, due_on, total_cents, vat_cents, currency,
             category, proposal, vat_deduct, booked_at, booked_by, duplicate_of, paid_privately, party_vat_id, foreign_party, ekasa_uid, ekasa_okp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          d.id,
          d.company,
          ts - d.arrived * 86400 - 3600,
          d.source,
          d.addedBy ?? null,
          file?.key ?? null,
          file ? 'application/pdf' : null,
          file?.name ?? null,
          file?.bytes ?? null,
          read ? 'read' : 'manual',
          read ? (d.source === 'einvoice' ? 'xml' : 'demo') : 'person: the reader could not read it',
          read ? d.kind : null,
          read ? d.party : null,
          read ? (d.ico ?? null) : null,
          read ? (d.iban ?? null) : null,
          read ? (d.number ?? null) : null,
          read ? (d.vs ?? null) : null,
          read ? day(d.issued) : null,
          read && d.due !== undefined ? day(d.due) : null,
          read ? d.total : null,
          read ? (d.vat ?? null) : null,
          d.category ?? null,
          d.proposal ?? null,
          d.deduct === undefined ? null : d.deduct ? 1 : 0,
          d.booked ? ts - d.booked.daysAgo * 86400 : null,
          d.booked?.by ?? null,
          d.duplicateOf ?? null,
          d.privately ? 1 : 0,
          read ? (d.vatId ?? null) : null,
          read && d.foreign !== undefined ? (d.foreign ? 1 : 0) : null,
          read && d.kind === 'receipt' ? sampleCodes(d.id).uid : null,
          read && d.kind === 'receipt' ? sampleCodes(d.id).okp : null,
        ),
    )
  }

  // Martin signed the power of attorney with his eID when Ukážková firma started, and Lucia checked and filed it.
  // Eva has not signed hers yet: Ateliér Nova shows it among its first steps.
  const poaKey = `companies/${c1}/papers/demo-poa-1.pdf`
  const poaPdf = demoPdf(420, 595, [
    { text: 'Plnomocenstvo', size: 15, bold: true },
    { text: 'Splnomocniteľ: Ukážková firma s. r. o., Hlavná 1, 040 01 Košice', gap: 14 },
    { text: 'v mene ktorej koná Martin Novák, konateľ' },
    { text: 'udeľuje plnomocenstvo', gap: 10 },
    { text: 'Splnomocnenec: europio s. r. o., K lesu 2218/39A, 040 18 Košice', gap: 10 },
    { text: 'na zastupovanie pri správe daní, pred Sociálnou poisťovňou,', gap: 10 },
    { text: 'zdravotnými poisťovňami a v registri účtovných závierok.' },
    { text: 'Podpísané kvalifikovaným elektronickým podpisom: Martin Novák', gap: 18 },
  ])
  if (files) await files.put(poaKey, poaPdf, { httpMetadata: { contentType: 'application/pdf' } })
  const startOf = (days: number) => `${shift(today, days).slice(0, 7)}-01`

  await db.batch([
    // The team: Christian runs it, Lucia and Jana keep the books.
    user(DEMO.admin, 'spravca@firmony.test', 'Christian Juhás', 'admin'),
    user(DEMO.accountant, 'lucia@firmony.test', 'Lucia Horváthová', 'accountant'),
    user(DEMO.accountant2, 'jana@firmony.test', 'Jana Kováčová', 'accountant'),
    // The clients.
    user(DEMO.user, DEMO.email, 'Martin Novák', null),
    user(DEMO.secondUser, 'eva@firmony.test', 'Eva Kollárová', null),
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, address, vat_payer, plan, inbox, accountant_id, demo, note, contract_at, terms_version, signed_by, start_on, dic, icdph, tax_office, tax_account)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 1, ?, ?, ?, ?, ?, '2120000007', 'SK2120000007', 'Košice', '7000123456')`,
      )
      .bind(
        c1,
        ts - 40 * 86400,
        'Ukážková firma s. r. o.',
        'Hlavná 1, 040 01 Košice',
        'rast',
        'k7m2qx4d',
        DEMO.accountant,
        'Martin chce mať prehľad o DPH do 20. v mesiaci.',
        ts - 41 * 86400,
        TERMS_VERSION,
        'Martin Novák',
        startOf(-40),
      ),
    db
      .prepare(
        'INSERT INTO companies (id, created_at, name, address, vat_payer, plan, inbox, accountant_id, demo, contract_at, terms_version, signed_by, start_on) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?, ?, ?)',
      )
      .bind(c2, ts - 30 * 86400, 'Ateliér Nova s. r. o.', 'Mlynská 8, 040 01 Košice', 'start', 'n8w3pa5t', DEMO.accountant2, ts - 31 * 86400, TERMS_VERSION, 'Eva Kollárová', startOf(-30)),
    db
      .prepare(
        "INSERT INTO company_files (id, company_id, kind, created_at, created_by, file_name, file_type, file_size, r2_key, checked_at, checked_by) VALUES ('demo-poa-1', ?, 'poa', ?, ?, 'plnomocenstvo-podpisane.pdf', 'application/pdf', ?, ?, ?, ?)",
      )
      .bind(c1, ts - 39 * 86400, DEMO.user, poaPdf.byteLength, poaKey, ts - 38 * 86400, DEMO.accountant),
    // Martin told us who stands behind Ukážková firma when it started (no birth number in the sample: a date of birth
    // instead), Lucia checked it and put the company in the low risk. Eva has not filled hers in; Jana has reported
    // something about Ateliér Nova that Christian, the designated person, has not decided yet.
    db.prepare('INSERT INTO declarations (id, company_id, created_at, created_by, data, checked_at, checked_by) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      'demo-declaration-1',
      c1,
      ts - 40 * 86400 + 3600,
      DEMO.user,
      JSON.stringify({
        director: { name: 'Martin Novák', birthNumber: '', birthDate: '1991-04-17', address: 'Moyzesova 12, 040 01 Košice', nationality: 'slovenská', pep: false, idKind: 'op', idNumber: 'HK123456' },
        kuv: 'self',
        owners: [],
        activity: 'Vývoj webových aplikácií pre malé firmy',
        income: 'Platby od zákazníkov za služby',
        turnover: '50-200',
        cash: false,
        abroad: false,
        abroadWhere: '',
      }),
      ts - 38 * 86400,
      DEMO.accountant,
    ),
    db
      .prepare("INSERT INTO risks (id, company_id, created_at, created_by, level, note) VALUES ('demo-risk-1', ?, ?, ?, 'low', ?)")
      .bind(c1, ts - 38 * 86400 + 60, DEMO.accountant, 'Konateľ je jediný spoločník, firma nepracuje s hotovosťou ani s partnermi mimo EÚ.'),
    db
      .prepare("INSERT INTO reports (id, company_id, created_at, created_by, body) VALUES ('demo-report-1', ?, ?, ?, ?)")
      .bind(c2, ts - 2 * 86400, DEMO.accountant2, 'Na účet firmy prišli tri vklady hotovosti po 9 800 € za jeden týždeň. Klientka sa k nim v správach nevyjadrila.'),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(c1, DEMO.user, ts - 40 * 86400),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(c2, DEMO.secondUser, ts - 30 * 86400),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at, invited_by) VALUES (?, ?, 'member', ?, ?)").bind(c2, DEMO.user, ts - 29 * 86400, DEMO.secondUser),
    db
      .prepare("INSERT INTO accounts (id, company_id, iban, bank, balance_cents, balance_on, ledger) VALUES (?, ?, ?, ?, ?, ?, '221.001')")
      .bind(DEMO.account, c1, 'SK3112000000198742637541', 'Banka', 671893, day(-1)),
    db
      .prepare("INSERT INTO accounts (id, company_id, iban, bank, balance_cents, balance_on, ledger) VALUES (?, ?, ?, ?, ?, ?, '221.001')")
      .bind(DEMO.secondAccount, c2, 'SK1609000000005123456789', 'Banka', 264111, day(-1)),

    // Ukážková firma: three card payments without a receipt, what the client is asked for.
    pay(c1, DEMO.account, 'demo-1', -1, -1240, 'KAVIAREN NA ROHU KOSICE', { card: true }),
    pay(c1, DEMO.account, 'demo-2', -2, -6418, 'CERPACIA STANICA D1', { card: true }),
    pay(c1, DEMO.account, 'demo-3', -4, -2790, 'KANCELARSKE POTREBY', { card: true }),
    // Paired by themselves, or by the client.
    pay(c1, DEMO.account, 'demo-4', -3, -5990, 'Hostingový dom s. r. o.', { iban: 'SK8975000000000012345671', vs: '2026118', note: 'Faktúra 2026118' }),
    pay(c1, DEMO.account, 'demo-5', -6, 123000, 'Digitálne štúdio Vlna s. r. o.', { iban: 'SK6807200002891987426353', vs: '20260005', note: 'Úhrada faktúry 20260005' }),
    pay(c1, DEMO.account, 'demo-6', -8, -15000, 'Coworking Nádvorie s. r. o.', { iban: 'SK0809000000000123123123', vs: '1026', note: 'Nájom október' }),
    pay(c1, DEMO.account, 'demo-7', -9, -1999, 'Mobilný operátor a. s.', { iban: 'SK2111000000002612345678', vs: '7781202610' }),
    pay(c1, DEMO.account, 'demo-11', -15, -32000, 'Grafické štúdio Linka', { iban: 'SK5202000000004712345670', vs: '1112026', note: 'Logo a vizitky' }),
    // Recognised as needing no document, and money the owner put in, which Lucia has to look at.
    pay(c1, DEMO.account, 'demo-8', -10, -450, null, { note: 'Poplatok za vedenie účtu', exempt: 'bank' }),
    pay(c1, DEMO.account, 'demo-10', -20, -3300, 'Finančná správa SR', { iban: 'SK3681800000007000123456', vs: '1700000000', note: 'Správny poplatok', exempt: 'state' }),
    pay(c1, DEMO.account, 'demo-9', -27, 500000, 'Martin Novák', { iban: 'SK7311000000002934567890', note: 'Splatenie základného imania' }),
    db.prepare("UPDATE payments SET exempt = 'capital', exempt_by = ?, exempt_note = 'základné imanie' WHERE account_id = ? AND ref = 'demo-9'").bind(DEMO.user, DEMO.account),
    // Lucia's books: the capital the company was founded with and not yet paid in when its books started, and the
    // account of the administrative fee, which its reason does not give.
    db
      .prepare(
        "INSERT INTO ledger_entries (id, company_id, kind, year, number, on_date, text, lines, created_at, created_by) VALUES ('demo-ps-1', ?, 'opening', ?, 'PS', ?, 'Počiatočné stavy', ?, ?, ?)",
      )
      .bind(
        c1,
        Number(startOf(-40).slice(0, 4)),
        startOf(-40),
        JSON.stringify([
          { md: '353', d: '701', cents: 500000 },
          { md: '701', d: '411', cents: 500000 },
        ]),
        ts - 39 * 86400,
        DEMO.accountant,
      ),
    db.prepare("UPDATE payments SET contra = '538' WHERE account_id = ? AND ref = 'demo-10'").bind(DEMO.account),

    // Ateliér Nova: a chair without a receipt, an invoice paired by itself, a customer who paid.
    pay(c2, DEMO.secondAccount, 'demo-21', -2, -18900, 'IKEA BRATISLAVA', { card: true }),
    pay(c2, DEMO.secondAccount, 'demo-22', -4, -1290, 'WEBSUPPORT S.R.O.', { card: true }),
    pay(c2, DEMO.secondAccount, 'demo-23', -12, 85000, 'Kaviareň Zrnko s. r. o.', { iban: 'SK4111000000002987654321', vs: '2026003', note: 'Faktúra 2026003' }),
    pay(c2, DEMO.secondAccount, 'demo-24', -25, 200000, 'Eva Kollárová', { iban: 'SK5302000000001234567891', note: 'Vklad do základného imania' }),
    db
      .prepare("UPDATE payments SET exempt = 'capital', exempt_by = ?, exempt_note = 'základné imanie', checked_at = ?, checked_by = ? WHERE account_id = ? AND ref = 'demo-24'")
      .bind(DEMO.secondUser, ts - 20 * 86400, DEMO.accountant2, DEMO.secondAccount),

    ...docStatements,
    // Invoices Martin issued in Firmony: one paid, one past its due date, one draft.
    ...sampleInvoice({
      id: 'demo-inv-1',
      seq: 6,
      customer: 'Agentúra Smer s. r. o.',
      ico: '50123456',
      address: 'Štúrova 20, 811 02 Bratislava',
      email: 'faktury@smer.test',
      issued: -5,
      due: 9,
      lines: [['Návrh webu, október', 1000, 'ks', 96000]],
      sent: true,
    }),
    ...sampleInvoice({
      id: 'demo-inv-2',
      seq: 7,
      customer: 'Kníhkupectvo Na korze s. r. o.',
      ico: '47123456',
      address: 'Hlavná 48, 040 01 Košice',
      email: 'obchod@nakorze.test',
      issued: -30,
      due: -16,
      lines: [
        ['Grafický návrh plagátu', 2000, 'ks', 20000],
        ['Úprava pre sociálne siete', 3000, 'hod', 3500],
      ],
      sent: true,
    }),
    ...sampleInvoice({
      id: 'demo-inv-3',
      seq: null,
      customer: 'Mestská knižnica Košice',
      ico: '00163252',
      address: 'Hlavná 48, 040 01 Košice',
      email: null,
      issued: 0,
      due: 14,
      lines: [['Workshop o online marketingu', 4000, 'hod', 4500]],
      sent: false,
    }),
    pay(c1, DEMO.account, 'demo-12', -1, 118080, 'Agentúra Smer s. r. o.', { iban: 'SK1702000000003012345678', vs: '20260006', note: 'Faktúra 20260006' }),
    link(c1, DEMO.account, 'demo-doc-inv-1', 'demo-12', 'auto', null),
    link(c1, DEMO.account, 'demo-doc-1', 'demo-4', 'auto', null),
    link(c1, DEMO.account, 'demo-doc-2', 'demo-5', 'auto', null),
    link(c1, DEMO.account, 'demo-doc-3', 'demo-6', 'auto', null),
    link(c1, DEMO.account, 'demo-doc-4', 'demo-7', 'auto', null),
    link(c1, DEMO.account, 'demo-doc-5', 'demo-11', 'client', DEMO.user),
    link(c2, DEMO.secondAccount, 'demo-doc-21', 'demo-22', 'auto', null),
    link(c2, DEMO.secondAccount, 'demo-doc-22', 'demo-23', 'auto', null),

    // What Lucia decided once for a supplier, proposed for its next documents.
    db
      .prepare('INSERT INTO supplier_rules (company_id, key, name, category, vat_deduct, uses, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c1, 'ico:36123456', 'Hostingový dom s. r. o.', 'services', 1, 3, ts - 2 * 86400, DEMO.accountant),
    db
      .prepare('INSERT INTO supplier_rules (company_id, key, name, category, vat_deduct, uses, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c1, 'ico:51234567', 'Coworking Nádvorie s. r. o.', 'services', 1, 2, ts - 7 * 86400, DEMO.accountant),

    messageStatement(db, {
      id: 'demo-msg-1',
      company: c1,
      author: DEMO.accountant,
      side: 'firmony',
      at: at(today, -12, 10, 15),
      payment: null,
      body: 'Dobrý deň, som Lucia a budem Vám viesť účtovníctvo. Doklady stačí pridávať priebežne, za každý mesiac najneskôr do 10. dňa nasledujúceho mesiaca. Ak si s niečím nebudete vedieť rady, napíšte mi sem.',
    }),
    messageStatement(db, {
      id: 'demo-msg-2',
      company: c1,
      author: DEMO.user,
      side: 'client',
      at: at(today, -8, 18, 40),
      payment: null,
      body: 'Dobrý deň, faktúru za coworking mi posielajú každý mesiac e-mailom. Stačí ju preposlať?',
    }),
    messageStatement(db, {
      id: 'demo-msg-3',
      company: c1,
      author: DEMO.accountant,
      side: 'firmony',
      at: at(today, -7, 9, 5),
      payment: null,
      body: 'Áno, stačí ju preposlať na Vašu adresu pre doklady. K platbe ju priradíme sami. Túto už máme.',
    }),
    db.prepare("UPDATE messages SET seen_at = ? WHERE company_id = ? AND id IN ('demo-msg-1', 'demo-msg-2')").bind(ts, c1),
    messageStatement(db, {
      id: 'demo-msg-21',
      company: c2,
      author: DEMO.accountant2,
      side: 'firmony',
      at: at(today, -20, 11, 0),
      payment: null,
      body: 'Dobrý deň, som Jana, Vaša účtovníčka. Keď Vám bude niečo nejasné, napíšte mi sem, odpoviem do jedného pracovného dňa.',
    }),
    messageStatement(db, {
      id: 'demo-msg-22',
      company: c2,
      author: DEMO.secondUser,
      side: 'client',
      at: at(today, -1, 21, 12),
      payment: null,
      body: 'Dobrý deň, v IKEA som kúpila stoličku do ateliéru za 189 €, ale bloček som niekde stratila. Stačí Vám výpis z účtu?',
    }),
    db.prepare('UPDATE messages SET seen_at = ? WHERE id = ?').bind(ts, 'demo-msg-21'),

    // Two requests from the site.
    db
      .prepare(
        `INSERT INTO requests (id, created_at, ico, company, address, company_source, plan, situation, name, email, phone, note, source, privacy_version)
         VALUES (?, ?, NULL, NULL, NULL, NULL, 'start', 'fresh', 'Tomáš Bielik', 'tomas.bielik@example.com', NULL, ?, 'utm_source=instagram', 'demo')`,
      )
      .bind('demo-req-1', ts - 2 * 3600, 'Zakladáme s kamarátom s. r. o., e-shop s oblečením. Od kedy viete začať?'),
    db
      .prepare(
        `INSERT INTO requests (id, created_at, ico, company, address, company_source, plan, situation, name, email, phone, note, source, privacy_version)
         VALUES (?, ?, ?, ?, ?, 'register', 'rast', 'switch', 'Katarína Vargová', 'katarina@example.com', '+421 900 123 456', ?, NULL, 'demo')`,
      )
      .bind('demo-req-2', ts - 26 * 3600, '12345679', 'Pekáreň Klások s. r. o.', 'Pekárska 3, 080 01 Prešov', 'Teraz máme účtovníčku, ktorá končí. Platitelia DPH, asi 60 dokladov mesačne.'),

    eventStatement(db, { company: c1, user: null, action: 'demo.seeded' }),
  ])

  // Martin set his bank to send a statement to the company's address every day with a movement: each payment of
  // Ukážková firma came with one. Ateliér Nova adds its statements on the page.
  await seedStatements(db, files, c1, DEMO.account, 'SK3112000000198742637541', ts)
  await db
    .prepare('UPDATE companies SET bank_setup = ? WHERE id = ?')
    .bind(JSON.stringify({ bank: 'slsp', at: ts - 39 * 86400 }), c1)
    .run()

  // What Lucia confirmed when she booked Ukážková firma's documents: their VAT as it was proposed.
  const row = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ?`).bind(c1).first<Record<string, unknown>>()
  if (row) {
    const company = vatCompanyOf(companyOf(row))
    const booked = await db.prepare(`SELECT ${DOC_COLUMNS} FROM ${DOC_FROM} WHERE d.company_id = ? AND d.booked_at IS NOT NULL`).bind(c1).all<Record<string, unknown>>()
    const confirmed = booked.results
      .map(docOf)
      .map((d) => ({ id: d.id, vat: proposeVat(vatDocOf(d), company) }))
      .filter((d) => d.vat !== null)
    if (confirmed.length > 0)
      await db.batch(confirmed.map((d) => db.prepare('UPDATE documents SET vat_mode = ?, vat_lines = ? WHERE id = ?').bind(d.vat?.mode ?? 'none', JSON.stringify(d.vat?.lines ?? []), d.id)))
  }
}
