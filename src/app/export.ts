// Everything of a company, a year at a time, as one ZIP: the documents' originals as they arrived, the lists of
// documents, payments and issued invoices as CSV for Slovak Excel, the issued invoices as e-invoices, the messages,
// and the contract with its terms. The client downloads it whenever it wants, and must before its data are deleted
// ninety days after the contract ends (point 10.4 of the terms). Files are read one at a time, as the stream goes.
import { BRAND } from '../config'
import { csvCell, csvMoney } from '../team/store'
import { zipName, zipStream, uniqueName, type ZipEntry } from '../zip'
import { termsText } from '../content/terms'
import { CATEGORIES } from './booking'
import { dayName, readableName } from './copy'
import { issuedInYear, invoiceLines, ublOf } from './invoices'
import type { Exempt } from './match'
import { bratislava } from './remind'
import { DOC_COLUMNS, DOC_FROM, docOf, type Company, type Doc } from './store'

type Row = Record<string, unknown>

/** The years a company has anything of, the newest first. */
export async function exportYears(db: D1Database, company: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT y FROM (
         SELECT substr(COALESCE(issued_on, date(created_at, 'unixepoch')), 1, 4) AS y FROM documents WHERE company_id = ?1 AND deleted_at IS NULL
         UNION SELECT substr(booked_on, 1, 4) FROM payments WHERE company_id = ?1
         UNION SELECT substr(issued_on, 1, 4) FROM invoices WHERE company_id = ?1 AND status = 'issued'
         UNION SELECT strftime('%Y', created_at, 'unixepoch') FROM messages WHERE company_id = ?1
       ) WHERE y GLOB '[12][0-9][0-9][0-9]' ORDER BY y DESC`,
    )
    .bind(company)
    .all<{ y: string }>()
  return rows.results.map((r) => r.y)
}

const KINDS: Record<string, string> = { receipt: 'Bloček', invoice_in: 'Prijatá faktúra', invoice_out: 'Vydaná faktúra', other: 'Iný doklad' }
const EXEMPTS: Record<Exempt, string> = {
  bank: 'bankový poplatok alebo úrok',
  own: 'prevod medzi vlastnými účtami',
  payroll: 'mzda, odvody alebo daň zo mzdy',
  state: 'daň alebo platba štátu',
  capital: 'vklad alebo pôžička',
  other: 'iné',
}
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
}

const piece = (text: string) =>
  text
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

/** "13. 10. 2026 21:04" in Bratislava. */
function moment(seconds: number): string {
  const b = bratislava(seconds * 1000)
  return `${Number(b.day.slice(8, 10))}. ${Number(b.day.slice(5, 7))}. ${b.day.slice(0, 4)} ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`
}

const csv = (rows: (string | number | null)[][]) => `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell)).join(';')).join('\r\n')}\r\n`

export interface ContractFacts {
  plan: string
  priceCents: number | null
  acceptedAt: number | null
  signedBy: string | null
  startOn: string | null
}

function contractText(company: Company, order: ContractFacts | null): string {
  const lines = ['Zmluva o vedení účtovníctva', '', `Firma: ${company.name}${company.ico ? `, IČO ${company.ico}` : ''}`]
  if (company.contractAt && company.signedBy) lines.push(`Uzavretá online: ${moment(company.contractAt)}, ${company.signedBy}, konateľ`)
  if (order) lines.push(`Balík: ${order.plan}${order.priceCents !== null ? `, ${csvMoney(order.priceCents)} € mesačne bez DPH` : ''}`)
  if (company.startOn) lines.push(`Začiatok: ${dayName(company.startOn).replace(/ /g, ' ')}`)
  if (company.endsOn) lines.push(`Koniec: ${dayName(company.endsOn).replace(/ /g, ' ')}`)
  if (company.termsVersion) lines.push(`Obchodné podmienky: znenie ${company.termsVersion}`)
  lines.push('', termsText().replace(/ /g, ' '))
  return `${lines.join('\r\n')}\r\n`
}

function readme(company: Company, year: string, has: { invoices: boolean; messages: boolean }, today: string): string {
  const lines = [
    `Firmony: doklady a údaje firmy ${company.name} za rok ${year}`,
    '',
    'doklady/        originály dokladov, ako ste nám ich poslali (fotky, PDF, e-faktúry)',
    'doklady.csv     zoznam dokladov: čo sme z nich prečítali, ako sú zaúčtované a ktorá platba k nim patrí',
    'platby.csv      platby z výpisov a z banky a či k nim máme doklad',
  ]
  if (has.invoices) lines.push('faktury/        faktúry, ktoré ste vystavili, ako e-faktúry (UBL 2.1, EN 16931)', 'faktury.csv     zoznam vystavených faktúr')
  if (has.messages) lines.push('spravy.txt      správy medzi Vami a nami')
  lines.push(
    'zmluva.txt      zmluva a obchodné podmienky',
    '',
    'Súbory CSV otvoríte v Exceli: sú v kódovaní UTF-8 a stĺpce oddeľuje bodkočiarka.',
    'Účtovné doklady a účtovníctvo uchovávajte desať rokov (§ 35 zákona č. 431/2002 Z. z. o účtovníctve).',
    `Účtovníctvo z účtovného programu Vám odovzdávame zvlášť, v aplikácii vo Firma a nastavenia.`,
    '',
    `Stiahnuté ${today} z ${BRAND.origin}.`,
  )
  return `${lines.join('\r\n')}\r\n`
}

/** The archive of one year as a stream, with the name it is downloaded under. */
export async function exportYear(
  env: { DB: D1Database; FILES?: R2Bucket },
  company: Company,
  year: string,
  order: ContractFacts | null,
  today: string,
): Promise<{ name: string; body: ReadableStream<Uint8Array> }> {
  const db = env.DB
  const [docRows, payRows, linkRows, invoices, messageRows] = await Promise.all([
    db
      .prepare(
        `SELECT ${DOC_COLUMNS}, p.booked_on AS paid_on, p.amount_cents AS paid_cents FROM ${DOC_FROM} LEFT JOIN payments p ON p.id = l.payment_id
         WHERE d.company_id = ? AND d.deleted_at IS NULL AND substr(COALESCE(d.issued_on, date(d.created_at, 'unixepoch')), 1, 4) = ?
         ORDER BY COALESCE(d.issued_on, date(d.created_at, 'unixepoch')), d.created_at LIMIT 50000`,
      )
      .bind(company.id, year)
      .all<Row>(),
    db
      .prepare(
        `SELECT p.id, p.booked_on, p.amount_cents, p.currency, p.party, p.party_iban, p.vs, p.ss, p.ks, p.note, p.exempt, p.exempt_note, a.iban AS account_iban
         FROM payments p JOIN accounts a ON a.id = p.account_id WHERE p.company_id = ? AND substr(p.booked_on, 1, 4) = ? ORDER BY p.booked_on, p.rowid LIMIT 50000`,
      )
      .bind(company.id, year)
      .all<Row>(),
    db
      .prepare('SELECT l.payment_id, d.kind, d.number, d.party FROM links l JOIN documents d ON d.id = l.document_id WHERE l.company_id = ? AND d.deleted_at IS NULL')
      .bind(company.id)
      .all<{ payment_id: string; kind: string | null; number: string | null; party: string | null }>(),
    issuedInYear(db, company.id, year),
    db
      .prepare(
        `SELECT m.created_at, m.side, u.name AS author_name, m.body FROM messages m LEFT JOIN users u ON u.id = m.author
         WHERE m.company_id = ? AND strftime('%Y', m.created_at, 'unixepoch') = ? ORDER BY m.created_at, m.rowid LIMIT 50000`,
      )
      .bind(company.id, year)
      .all<{ created_at: number; side: string; author_name: string | null; body: string }>(),
  ])

  // Names first, so that the lists name each file as it stands in the archive.
  const taken = new Set<string>()
  for (const fixed of ['citajte.txt', 'doklady.csv', 'platby.csv', 'faktury.csv', 'spravy.txt', 'zmluva.txt']) taken.add(fixed)
  const docs = docRows.results.map((row) => {
    const d: Doc = docOf(row)
    const day = d.issuedOn ?? bratislava(d.createdAt * 1000).day
    const ext = (d.fileType && TYPES[d.fileType]) ?? d.fileName?.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? 'bin'
    const file = d.fileKey ? uniqueName(zipName(`doklady/${day} ${piece(d.party ? readableName(d.party) : 'doklad')}${d.number ? ` ${piece(d.number)}` : ''}.${ext}`), taken) : null
    return { d, day, file, paidOn: typeof row.paid_on === 'string' ? row.paid_on : null, paidCents: typeof row.paid_cents === 'number' ? row.paid_cents : null }
  })
  const invoiceFiles = invoices.map((invoice) => ({ invoice, file: uniqueName(zipName(`faktury/${piece(invoice.number ?? invoice.id)}.xml`), taken) }))

  const docsCsv = csv([
    [
      'Dátum vystavenia',
      'Splatnosť',
      'Druh',
      'Partner',
      'IČO partnera',
      'Číslo dokladu',
      'Variabilný symbol',
      'Suma',
      'DPH',
      'Mena',
      'Na čo',
      'Účet',
      'Zaúčtované',
      'Zaplatené súkromne',
      'Dátum platby',
      'Suma platby',
      'Súbor v archíve',
      'Pridané',
    ],
    ...docs.map(({ d, day, file, paidOn, paidCents }) => [
      d.issuedOn ?? '',
      d.dueOn ?? '',
      d.kind ? (KINDS[d.kind] ?? '') : '',
      d.party ?? '',
      d.partyIco ?? '',
      d.number ?? '',
      d.vs ?? '',
      csvMoney(d.totalCents),
      csvMoney(d.vatCents),
      d.currency ?? 'EUR',
      d.category ? (CATEGORIES[d.category]?.name ?? '') : '',
      d.account ?? '',
      d.bookedAt ? bratislava(d.bookedAt * 1000).day : '',
      d.paidPrivately ? 'áno' : 'nie',
      paidOn ?? '',
      csvMoney(paidCents),
      file ?? '',
      file ? day : bratislava(d.createdAt * 1000).day,
    ]),
  ])

  const byPayment = new Map<string, string[]>()
  for (const link of linkRows.results) {
    const label = [link.kind ? (KINDS[link.kind] ?? '') : '', link.number ?? '', link.party ? readableName(link.party) : ''].filter(Boolean).join(' ')
    byPayment.set(link.payment_id, [...(byPayment.get(link.payment_id) ?? []), label])
  }
  const paymentsCsv = csv([
    ['Dátum', 'Účet firmy', 'Suma', 'Mena', 'Protistrana', 'IBAN protistrany', 'VS', 'SS', 'KS', 'Poznámka', 'Doklad', 'Doklady'],
    ...payRows.results.map((p) => {
      const docsOf = byPayment.get(String(p.id)) ?? []
      const exempt = typeof p.exempt === 'string' ? (p.exempt as Exempt) : null
      const state = docsOf.length > 0 ? 'máme' : exempt ? `netreba: ${EXEMPTS[exempt] ?? exempt}${typeof p.exempt_note === 'string' && p.exempt_note ? `, ${p.exempt_note}` : ''}` : 'chýba'
      return [
        String(p.booked_on),
        String(p.account_iban ?? ''),
        csvMoney(Number(p.amount_cents)),
        String(p.currency ?? 'EUR'),
        typeof p.party === 'string' ? p.party : '',
        typeof p.party_iban === 'string' ? p.party_iban : '',
        typeof p.vs === 'string' ? p.vs : '',
        typeof p.ss === 'string' ? p.ss : '',
        typeof p.ks === 'string' ? p.ks : '',
        typeof p.note === 'string' ? p.note : '',
        state,
        docsOf.join(', '),
      ]
    }),
  ])

  const invoicesCsv = csv([
    ['Číslo', 'Odberateľ', 'IČO', 'Vystavená', 'Dodanie', 'Splatnosť', 'Základ', 'DPH', 'Spolu', 'Zaplatená', 'Súbor v archíve'],
    ...invoiceFiles.map(({ invoice, file }) => [
      invoice.number ?? '',
      invoice.customerName,
      invoice.customerIco ?? '',
      invoice.issuedOn,
      invoice.deliveredOn,
      invoice.dueOn,
      csvMoney(invoice.baseCents),
      csvMoney(invoice.vatCents),
      csvMoney(invoice.totalCents),
      invoice.paidOn ?? '',
      file,
    ]),
  ])

  const messagesText = messageRows.results
    .map((m) => `${moment(m.created_at)}, ${m.side === 'firmony' ? `${m.author_name ?? BRAND.name} (${BRAND.name})` : (m.author_name ?? 'Vy')}:\r\n${m.body.replace(/\r?\n/g, '\r\n')}\r\n`)
    .join('\r\n')

  const encoder = new TextEncoder()
  const text = (value: string) => async () => encoder.encode(value)
  const at = Math.floor(Date.now() / 1000)
  const files = env.FILES
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: 'citajte.txt', when: at, data: text(readme(company, year, { invoices: invoices.length > 0, messages: messageRows.results.length > 0 }, today)) }
    yield { name: 'doklady.csv', when: at, data: text(docsCsv) }
    yield { name: 'platby.csv', when: at, data: text(paymentsCsv) }
    if (invoices.length > 0) yield { name: 'faktury.csv', when: at, data: text(invoicesCsv) }
    if (messageRows.results.length > 0) yield { name: 'spravy.txt', when: at, data: text(messagesText) }
    yield { name: 'zmluva.txt', when: at, data: text(contractText(company, order)) }
    for (const { invoice, file } of invoiceFiles) {
      yield { name: file, when: invoice.createdAt, data: async () => encoder.encode(ublOf(invoice, await invoiceLines(db, invoice.id), company)) }
    }
    for (const { d, file } of docs) {
      if (!file || !d.fileKey || !files) continue
      const key = d.fileKey
      yield {
        name: file,
        when: d.createdAt,
        data: async () => {
          const object = await files.get(key)
          return object ? new Uint8Array(await object.arrayBuffer()) : null
        },
      }
    }
  }
  const slug =
    (company.ico ?? company.name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'firma'
  return {
    name: `firmony-${slug}-${year}.zip`,
    body: zipStream(entries(), (names) => `Tieto súbory sa do archívu nezmestili. Napíšte nám do správ a pošleme Vám ich zvlášť:\r\n\r\n${names.join('\r\n')}\r\n`),
  }
}
