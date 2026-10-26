// A year of a workspace's invoices in one ZIP (26 October 2026, free invoicing): every issued invoice as its PDF and as
// its e-invoice, and a list for Excel. A workspace has no books, payments or contract, so the client's yearly archive
// (export.ts) does not fit it; this is what the person takes along to an accountant or when leaving.
import { csvCell, csvMoney } from '../team/store'
import { uniqueName, zipName, zipStream, type ZipEntry } from '../zip'
import type { Company } from './store'
import { issuedInYear, issuedLinesInYear, stateOf, ublOf } from './invoices'
import { invoicePdf, invoicePdfName, type PdfImage } from './invoice-pdf'
import { logoForPdf } from './logo-cache'
import { kindName, sheetOf } from './invoice-sheet'

/** The most invoices whose PDFs go into one archive; the list names them all. */
export const ZIP_PDFS = 3000

/** A received e-invoice's year: the day it was issued, else the day it came. */
const RECEIVED_YEAR = "substr(COALESCE(issued_on, date(received_at, 'unixepoch')), 1, 4)"

/** The years a workspace issued an invoice or received an e-invoice in, the newest first. */
export async function invoiceYears(db: D1Database, company: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT y FROM (
         SELECT substr(issued_on, 1, 4) AS y FROM invoices WHERE company_id = ?1 AND status = 'issued' AND issued_on IS NOT NULL
         UNION SELECT ${RECEIVED_YEAR} AS y FROM einvoice_received WHERE company_id = ?1 AND file_key IS NOT NULL
       ) ORDER BY y DESC`,
    )
    .bind(company)
    .all<{ y: string }>()
  return rows.results.map((r) => r.y).filter((y) => /^\d{4}$/.test(y))
}

interface ReceivedRow {
  id: string
  file_key: string
  party: string | null
  number: string | null
  issued_on: string | null
  due_on: string | null
  total_cents: number | null
  currency: string | null
  kind: string | null
  prepaid: number
  paid_on: string | null
  sender: string | null
}

const csv = (rows: (string | number | null)[][]) => `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell)).join(';')).join('\r\n')}\r\n`
const piece = (text: string) => text.replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim()

/** The archive of a year, streamed: an invoice's PDF is made only when its turn comes. */
export async function invoicingArchive(db: D1Database, files: R2Bucket | undefined, company: Company, year: string, today: string): Promise<{ name: string; body: ReadableStream<Uint8Array> }> {
  const invoices = await issuedInYear(db, company.id, year)
  // Two queries for the whole year: D1 takes a thousand queries a request at most.
  const linesOf = await issuedLinesInYear(db, company.id, year)
  const logo: PdfImage | null = await logoForPdf(files, company.logoKey)
  // The e-invoices the workspace received that year, as they came (prijate/), with a list of their own.
  const received = (
    await db
      .prepare(`SELECT id, file_key, party, number, issued_on, due_on, total_cents, currency, kind, prepaid, paid_on, sender FROM einvoice_received WHERE company_id = ? AND file_key IS NOT NULL AND ${RECEIVED_YEAR} = ? ORDER BY COALESCE(issued_on, ''), received_at`)
      .bind(company.id, year)
      .all<ReceivedRow>()
  ).results
  const taken = new Set<string>(['citajte.txt', 'faktury.csv', 'prijate.csv'])
  const list = invoices.map((invoice, i) => {
    const kind = kindName(invoice, company.vatPayer)
    const base = piece(invoicePdfName(kind, invoice.number ?? invoice.id).replace(/\.pdf$/, ''))
    return {
      invoice,
      kind,
      pdf: i < ZIP_PDFS ? uniqueName(zipName(`pdf/${base}.pdf`), taken) : null,
      xml: invoice.kind === 'proforma' ? null : uniqueName(zipName(`e-faktury/${base}.xml`), taken),
    }
  })
  const receivedFiles = received.map((r) => ({ row: r, name: uniqueName(zipName(`prijate/${piece(`${r.issued_on ?? ''} ${r.party ?? 'dodavatel'} ${r.number ?? r.id}`)}.xml`), taken) }))
  const encoder = new TextEncoder()
  const text = (value: string) => async () => encoder.encode(value)
  const at = Math.floor(Date.now() / 1000)
  const listCsv = csv([
    ['Doklad', 'Číslo', 'Odberateľ', 'IČO', 'Vystavená', 'Dodanie', 'Splatnosť', 'Základ', 'DPH', 'Spolu', 'Mena', 'Kurz za 1 €', 'Zaplatená', 'PDF', 'E-faktúra'],
    ...list.map(({ invoice, kind, pdf, xml }) => [
      kind,
      invoice.number ?? '',
      invoice.customerName,
      invoice.customerIco ?? '',
      invoice.issuedOn,
      invoice.deliveredOn,
      invoice.dueOn,
      csvMoney(invoice.baseCents),
      csvMoney(invoice.vatCents),
      csvMoney(invoice.totalCents),
      invoice.currency,
      invoice.fxRate ?? '',
      invoice.paidOn ?? '',
      pdf ?? '',
      xml ?? '',
    ]),
  ])
  const receivedCsv = csv([
    ['Dodávateľ', 'Číslo', 'Vystavená', 'Splatnosť', 'Spolu', 'Mena', 'Druh', 'Zaplatená', 'Odosielateľ v sieti Peppol', 'Súbor'],
    ...receivedFiles.map(({ row, name }) => [
      row.party ?? '',
      row.number ?? '',
      row.issued_on ?? '',
      row.due_on ?? '',
      row.total_cents === null ? '' : csvMoney(row.total_cents),
      row.currency ?? '',
      row.kind === 'other' ? 'dobropis' : row.prepaid === 1 ? 'faktúra k zálohe' : 'faktúra',
      row.paid_on ?? '',
      row.sender ?? '',
      name,
    ]),
  ])
  const readme = [
    `Faktúry firmy ${company.name} za rok ${year}`,
    `Stiahnuté ${today} z bezplatnej fakturácie Firmony.`,
    '',
    'faktury.csv     zoznam všetkých vystavených faktúr pre Excel',
    'pdf/            každá faktúra ako PDF, ako ju vidí odberateľ',
    'e-faktury/      faktúry ako e-faktúry (UBL 2.1, Peppol BIS 3.0) na import do účtovného programu',
    ...(received.length > 0 ? ['prijate.csv     zoznam e-faktúr, ktoré ste prijali cez sieť Peppol', 'prijate/        prijaté e-faktúry tak, ako prišli'] : []),
    ...(invoices.length > ZIP_PDFS ? ['', `PDF je tu pri prvých ${ZIP_PDFS} faktúrach. Ostatné si stiahnete jednotlivo v aplikácii; zoznam aj e-faktúry sú tu všetky.`] : []),
  ].join('\r\n')

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: 'citajte.txt', when: at, data: text(`${readme}\r\n`) }
    yield { name: 'faktury.csv', when: at, data: text(listCsv) }
    if (receivedFiles.length > 0) yield { name: 'prijate.csv', when: at, data: text(receivedCsv) }
    for (const { invoice, pdf, xml } of list) {
      const lines = linesOf.get(invoice.id) ?? []
      if (pdf) yield { name: pdf, when: invoice.createdAt, data: async () => invoicePdf({ sheet: sheetOf(invoice, lines, company, stateOf(invoice, today) !== 'paid'), number: invoice.number ?? '', logo }) }
      if (xml) yield { name: xml, when: invoice.createdAt, data: async () => encoder.encode(ublOf(invoice, lines, company)) }
    }
    for (const { row, name } of receivedFiles) {
      const object = files ? await files.get(row.file_key) : null
      if (object) yield { name, when: at, data: async () => new Uint8Array(await object.arrayBuffer()) }
    }
  }
  const safe = company.name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'firma'
  return { name: `Faktury-${safe}-${year}.zip`, body: zipStream(entries()) }
}
