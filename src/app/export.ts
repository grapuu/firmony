// Everything of a company, a year at a time, as one ZIP: the documents' originals as they arrived, the lists of
// documents, payments and issued invoices as CSV for Slovak Excel, the issued invoices as e-invoices, the messages,
// and the contract with its terms. The client downloads it whenever it wants, and must before its data are deleted
// ninety days after the contract ends (point 10.4 of the terms). Files are read one at a time, as the stream goes.
import { BRAND, OFFLINE_TERMS } from '../config'
import { signerRole } from '../rpo'
import { csvCell, csvMoney } from '../team/store'
import { zipName, zipStream, uniqueName, type ZipEntry } from '../zip'
import { resolveContract, type ResolvedContract } from '../contracts'
import { CATEGORIES } from './booking'
import { listCenters } from './centers-store'
import { readableName } from './copy'
import { issuedInYear, invoiceLines, ublOf } from './invoices'
import type { Exempt } from './match'
import { bratislava } from './remind'
import { generalLedgerCsv, journalCsv, saldoCsv, trialBalance, trialCsv } from './ledger'
import { booksOf } from './ledger-store'
import { DOC_COLUMNS, DOC_FROM, PAID_EUR_SQL, REMAINING_SQL, booksFromSql, docOf, type Company, type Doc } from './store'
import { handoverData } from './handover-data'
import { fileHash } from './read'

type Row = Record<string, unknown>

/** The years a company has anything of, the newest first. */
export async function exportYears(db: D1Database, company: string): Promise<string[]> {
  const selects = [
    "SELECT substr(COALESCE(issued_on, date(created_at, 'unixepoch')), 1, 4) AS y FROM documents WHERE company_id = ?1 AND deleted_at IS NULL",
    "SELECT substr(booked_on, 1, 4) AS y FROM payments WHERE company_id = ?1",
    "SELECT substr(issued_on, 1, 4) AS y FROM invoices WHERE company_id = ?1 AND status = 'issued'",
    "SELECT strftime('%Y', created_at, 'unixepoch') AS y FROM messages WHERE company_id = ?1",
    "SELECT substr(COALESCE(to_on, from_on, date(created_at, 'unixepoch')), 1, 4) AS y FROM statements WHERE company_id = ?1 AND status IN ('taken', 'known', 'held')",
    "SELECT substr(period, 1, 4) AS y FROM payroll_runs WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM payroll_history WHERE company_id = ?1",
    "SELECT CAST(year AS TEXT) AS y FROM closings WHERE company_id = ?1",
    "SELECT CAST(year AS TEXT) AS y FROM closing_history WHERE company_id = ?1",
    "SELECT CAST(year AS TEXT) AS y FROM ledger_entries WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM filings WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM filing_history WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM filing_packages WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM payroll_closures WHERE company_id = ?1",
    "SELECT substr(paid_on, 1, 4) AS y FROM payroll_payouts WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM payroll_targets WHERE company_id = ?1",
    "SELECT substr(COALESCE(through_on, before_on), 1, 4) AS y FROM period_lock_history WHERE company_id = ?1",
    "SELECT substr(period, 1, 4) AS y FROM vat_returns WHERE company_id = ?1",
    "SELECT substr(started_on, 1, 4) AS y FROM employees WHERE company_id = ?1",
    "SELECT substr(COALESCE(start_on, date(created_at, 'unixepoch')), 1, 4) AS y FROM companies WHERE id = ?1",
  ]
  // D1 limits compound SELECT terms; keep each query small even as more accounting tables are added.
  const batches = []
  for (let i = 0; i < selects.length; i += 5) batches.push(db.prepare(`SELECT DISTINCT y FROM (${selects.slice(i, i + 5).join(' UNION ')}) WHERE y GLOB '[12][0-9][0-9][0-9]'`).bind(company).all<{ y: string }>())
  const rows = await Promise.all(batches)
  return [...new Set(rows.flatMap((r) => r.results.map((v) => v.y)))].sort().reverse()
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

function contractText(company: Company, order: ContractFacts | null, contract: ResolvedContract): string {
  const s = contract.snapshot
  const lines = ['Zmluva o vedení účtovníctva', '', contract.notice, '',
    `Firma: ${s?.client.name ?? company.name}, IČO ${s?.client.ico ?? company.ico ?? 'neuvedené'}`]
  const at = s?.acceptedAt ?? order?.acceptedAt ?? company.contractAt
  const by = s?.signedBy ?? order?.signedBy ?? company.signedBy
  if (at && by) lines.push(company.termsVersion === OFFLINE_TERMS ? `Uzavretá písomne mimo aplikácie, podpísal(a) ${by}` : `Uzavretá online: ${moment(at)}, ${by}, ${signerRole(company.legalForm, company.signedRole)}`)
  if (s) lines.push(`Balík: ${s.plan.name}, ${csvMoney(s.plan.monthlyCents)} € mesačne bez DPH, do ${s.plan.docs} dokladov`,
    `Mzdy: ${csvMoney(s.catalogue.payrollCents)} € za človeka mesačne bez DPH`,
    `Závierka: ${csvMoney(s.catalogue.closingCents)} € bez DPH`, `Začiatok: ${s.startOn}`, `SHA-256 zmluva.json: ${contract.sha256}`)
  else if (order) lines.push(`Balík: ${order.plan}${order.priceCents !== null ? `, ${csvMoney(order.priceCents)} € mesačne bez DPH` : ''}; úplný historický cenník nebol uložený.`)
  if (!s && company.startOn) lines.push(`Začiatok: ${company.startOn}`)
  if (company.endsOn) lines.push(`Koniec: ${company.endsOn}`)
  if (contract.terms) lines.push('', contract.terms.text.replace(/\u00a0/g, ' '))
  return `${lines.join('\r\n')}\r\n`
}

function readme(company: Company, year: string, has: { invoices: boolean; messages: boolean; books: boolean; statements: boolean; trips?: boolean }, today: string): string {
  const lines = [
    `Firmony: doklady a údaje firmy ${company.name} za rok ${year}`,
    '',
    'doklady/        originály dokladov, ako ste nám ich poslali (fotky, PDF, e-faktúry)',
    'doklady.csv     zoznam dokladov: čo sme z nich prečítali, ako sú zaúčtované a ktorá platba k nim patrí',
    'platby.csv      platby z výpisov a z banky a či k nim máme doklad',
  ]
  if (has.statements) lines.push('vypisy/         výpisy z banky, ako prišli (XML, camt.053)', 'vypisy.csv      zoznam výpisov: obdobie, účet, zostatky a čo sa s nimi stalo')
  if (has.invoices) lines.push('faktury/        faktúry, ktoré ste vystavili, ako e-faktúry (UBL 2.1, EN 16931)', 'faktury.csv     zoznam vystavených faktúr')
  if (has.trips) lines.push('cesty.csv       pracovné cesty: kto, kam, kedy, stravné, náhrada za auto a čo patrilo spolu')
  if (has.messages) lines.push('spravy.txt      správy medzi Vami a nami')
  if (has.books) {
    lines.push(
      'uctovnictvo/dennik.csv        účtovný denník roka: každý zápis, ako idú dni',
      'uctovnictvo/hlavna-kniha.csv  hlavná kniha: každý účet so začiatočným stavom, pohybmi a konečným stavom',
      'uctovnictvo/predvaha.csv      obratová predvaha za celý rok a výsledok hospodárenia',
      'uctovnictvo/saldokonto.csv    neuhradené faktúry odberateľov a dodávateľov ku dňu stiahnutia',
    )
  }
  lines.push(
    'odobrane-prilohy/  prílohy vyradené z bežného prehľadu, uchované do riadeného výmazu; čas a osoba v data/prilohy.json',
    'data/           úplné údaje miezd, zamestnancov, podaní a účtovných zápisov vo formáte JSON vrátane histórie; sumy sú v centoch',
    'mzdy/           uložené uzavreté výplatné pásky ako JSON a prehľad pre Excel; bez nového prepočtu',
    'mzdy/podania/   pôvodné mzdové výkazy; zdroje, overené výplaty a úplná história sú v data/',
    'podania/potvrdenky/  pôvodné skontrolované potvrdenky daňových aj mzdových podaní',
    'podania/        pôvodné uložené XML podaných závierok a ich predchádzajúcich verzií, ak sa pri podaní uložili',
    'odovzdane/      súbory a plné moci, ktoré Vám účtovníčka sprístupnila',
    'zmluva.txt      prijaté znenie alebo výslovné upozornenie na chýbajúci pôvodný záznam',
    'zmluva.json     presný záznam novšej zmluvy a jej cenníka, ak bol pri uzavretí uložený; zmluva.sha256 obsahuje jeho kontrolný súčet',
    'manifest.json   zoznam všetkých súborov, ich veľkostí a kontrolných súčtov SHA-256',
    'Pri staršom podaní bez uloženého XML zostávajú pôvodné uložené údaje v data/; originál XML si vyžiadajte z finančnej správy.',
    '',
    'Súbory CSV otvoríte v Exceli: sú v kódovaní UTF-8 a stĺpce oddeľuje bodkočiarka.',
    'Účtovné doklady a účtovníctvo uchovávajte desať rokov (§ 35 zákona č. 431/2002 Z. z. o účtovníctve).',
    'Ak Vám účtovníčka odovzdala aj iné súbory, nájdete ich v aplikácii vo Firma a nastavenia.',
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
  completion?: { id: string; revision: number; onComplete: () => Promise<void> },
): Promise<{ name: string; body: ReadableStream<Uint8Array> }> {
  const db = env.DB
  const contract = await resolveContract(db, company.id, company.termsVersion)
  if (contract.status === 'corrupt') throw new Error(contract.notice)
  const at = Math.floor(Date.now() / 1000)
  const [snapshots, papers, receipts, payrollFiles] = await Promise.all([
    handoverData(db, company.id, year, at),
    db.prepare('SELECT id, kind, file_name, created_at, r2_key, deleted_at FROM company_files WHERE company_id = ? ORDER BY id').bind(company.id).all<{ id: string; kind: string; file_name: string; created_at: number; r2_key: string; deleted_at: number | null }>(),
    db.prepare(`SELECT e.id, e.at, e.file_key, e.file_bytes, e.file_sha256 FROM filing_events e JOIN filing_packages p ON p.id = e.package_id WHERE e.company_id = ?1 AND substr(p.period, 1, 4) = ?2 AND e.file_key IS NOT NULL
      UNION ALL SELECT 'payroll-' || e.id, e.at, e.file_key, e.file_bytes, e.file_sha256 FROM payroll_events e JOIN payroll_packages p ON p.id = e.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE e.company_id = ?1 AND substr(t.period, 1, 4) = ?2 AND e.file_key IS NOT NULL
      UNION ALL SELECT 'review-' || r.id, r.at, r.file_key, r.file_bytes, r.file_sha256 FROM payroll_target_reviews r JOIN payroll_targets t ON t.id = r.target_id WHERE r.company_id = ?1 AND substr(t.period, 1, 4) = ?2 AND r.file_key IS NOT NULL ORDER BY 1`)
      .bind(company.id, year).all<{ id: string; at: number; file_key: string; file_bytes: number; file_sha256: string }>(),
    db.prepare(`SELECT p.id, p.name, p.file_key, p.file_bytes, p.sha256, p.created_at, t.kind, t.period FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.company_id = ? AND substr(t.period, 1, 4) = ? ORDER BY p.id`)
      .bind(company.id, year).all<{ id: string; name:string; file_key: string; file_bytes: number; sha256: string; created_at: number; kind: string; period: string }>(),
  ])
  const [docRows, payRows, linkRows, invoices, messageRows, books, statementRows, tripRows] = await Promise.all([
    db
      .prepare(
        // Paid by the bank, or in cash by a cash document of the cash box (its day and its amount), or a day's takings of
        // a till, paid at the till on its day.
        `SELECT ${DOC_COLUMNS},
           CASE WHEN ${REMAINING_SQL} <= 0 THEN COALESCE((SELECT MAX(p.booked_on) FROM links kl JOIN payments p ON p.id = kl.payment_id WHERE kl.document_id = d.id),
             (SELECT ce.on_date FROM ledger_entries ce WHERE ce.document_id = d.id AND ce.kind = 'cash' AND ce.deleted_at IS NULL LIMIT 1),
             CASE WHEN d.source = 'takings' THEN d.issued_on END) END AS export_paid_on,
           COALESCE(NULLIF(${PAID_EUR_SQL}, 0), (SELECT json_extract(ce.lines, '$[0].cents') * (CASE WHEN d.kind = 'invoice_out' THEN 1 ELSE -1 END)
             FROM ledger_entries ce WHERE ce.document_id = d.id AND ce.kind = 'cash' AND ce.deleted_at IS NULL LIMIT 1),
             CASE WHEN d.source = 'takings' THEN d.total_cents END) AS paid_cents
         FROM ${DOC_FROM}
         WHERE d.company_id = ? AND d.deleted_at IS NULL AND substr(COALESCE(d.issued_on, date(d.created_at, 'unixepoch')), 1, 4) = ?
         ORDER BY COALESCE(d.issued_on, date(d.created_at, 'unixepoch')), d.created_at`,
      )
      .bind(company.id, year)
      .all<Row>(),
    db
      .prepare(
        `SELECT p.id, p.booked_on, p.amount_cents, p.currency, p.party, p.party_iban, p.vs, p.ss, p.ks, p.note, p.exempt, p.exempt_note, a.iban AS account_iban, p.booked_on < ${booksFromSql('p.company_id')} AS before_start
         FROM payments p JOIN accounts a ON a.id = p.account_id WHERE p.company_id = ? AND substr(p.booked_on, 1, 4) = ? ORDER BY p.booked_on, p.rowid`,
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
         WHERE m.company_id = ? AND strftime('%Y', m.created_at, 'unixepoch') = ? ORDER BY m.created_at, m.rowid`,
      )
      .bind(company.id, year)
      .all<{ created_at: number; side: string; author_name: string | null; body: string }>(),
    booksOf(db, company),
    // The statements of the company's accounts as they came (not one the owner said is no account of the company's).
    db
      .prepare(
        `SELECT iban, created_at, source, number, from_on, to_on, opening_cents, closing_cents, entries, status, file_key FROM statements
         WHERE company_id = ? AND status IN ('taken', 'known', 'held') AND substr(COALESCE(to_on, from_on, date(created_at, 'unixepoch')), 1, 4) = ?
         ORDER BY COALESCE(to_on, from_on, ''), created_at, part`,
      )
      .bind(company.id, year)
      .all<{
        iban: string
        created_at: number
        source: string
        number: string | null
        from_on: string | null
        to_on: string | null
        opening_cents: number | null
        closing_cents: number | null
        entries: number
        status: string
        file_key: string | null
      }>(),
    db
      .prepare('SELECT number, traveller, purpose, place_from, place_to, start_at, end_at, transport, plate, car, result, total_cents, removed_at FROM trips WHERE company_id = ? AND year = ? ORDER BY seq')
      .bind(company.id, Number(year))
      .all<Row>(),
  ])
  // The cost centres by id, for each document's code (centers.ts).
  const centerCodes = new Map((await listCenters(db, company.id)).map((c) => [c.id, `${c.code} ${c.name}`]))
  // The books of the year, when they hold anything in it.
  const bookYear = Number(year)
  const hasBooks = books.entries.some((e) => e.on.startsWith(`${year}-`))

  // Names first, so that the lists name each file as it stands in the archive.
  const taken = new Set<string>()
  for (const fixed of [
    'citajte.txt',
    'doklady.csv',
    'platby.csv',
    'faktury.csv',
    'cesty.csv',
    'spravy.txt',
    'zmluva.txt',
    'vypisy.csv',
    'uctovnictvo/dennik.csv',
    'uctovnictvo/hlavna-kniha.csv',
    'uctovnictvo/predvaha.csv',
    'uctovnictvo/saldokonto.csv',
  ])
    taken.add(fixed)
  const docs = docRows.results.map((row) => {
    const d: Doc = docOf(row)
    const day = d.issuedOn ?? bratislava(d.createdAt * 1000).day
    const ext = (d.fileType && TYPES[d.fileType]) ?? d.fileName?.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? 'bin'
    const file = d.fileKey ? uniqueName(zipName(`doklady/${day} ${piece(d.party ? readableName(d.party) : 'doklad')}${d.number ? ` ${piece(d.number)}` : ''}.${ext}`), taken) : null
    return { d, day, file, paidOn: typeof row.export_paid_on === 'string' ? row.export_paid_on : null, paidCents: typeof row.paid_cents === 'number' ? row.paid_cents : null }
  })
  const invoiceFiles = invoices.map((invoice) => ({ invoice, file: uniqueName(zipName(`faktury/${piece(invoice.number ?? invoice.id)}.xml`), taken) }))
  // A file with statements of several accounts is one file in the archive.
  const statementFiles = new Map<string, { name: string; when: number }>()
  const statementList = statementRows.results.map((st) => {
    if (st.file_key && !statementFiles.has(st.file_key)) {
      const day = st.to_on ?? st.from_on ?? bratislava(st.created_at * 1000).day
      statementFiles.set(st.file_key, { name: uniqueName(zipName(`vypisy/${day} ${st.iban.slice(-4)}.xml`), taken), when: st.created_at })
    }
    return { st, file: st.file_key ? (statementFiles.get(st.file_key)?.name ?? '') : '' }
  })
  const statementsCsv = csv([
    ['Od', 'Do', 'Účet', 'Číslo výpisu', 'Počiatočný zostatok', 'Konečný zostatok', 'Pohybov', 'Prišiel', 'Stav', 'Súbor v archíve'],
    ...statementList.map(({ st, file }) => [
      st.from_on ?? '',
      st.to_on ?? '',
      st.iban,
      st.number ?? '',
      csvMoney(st.opening_cents),
      csvMoney(st.closing_cents),
      st.entries,
      `${st.source === 'email' ? 'e-mailom' : 'nahraný'} ${bratislava(st.created_at * 1000).day}`,
      st.status === 'held' ? 'čaká na kontrolu' : 'zaúčtovaný',
      file,
    ]),
  ])

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
      'Stredisko',
      'Tržba eKasa: v hotovosti',
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
      d.centerId ? (centerCodes.get(d.centerId) ?? '') : '',
      d.source === 'takings' ? csvMoney(d.takingsCash ?? 0) : '',
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
      const state = docsOf.length > 0 ? 'máme' : exempt ? `netreba: ${EXEMPTS[exempt] ?? exempt}${typeof p.exempt_note === 'string' && p.exempt_note ? `, ${p.exempt_note}` : ''}` : p.before_start === 1 ? 'netreba: pred začiatkom našej zmluvy' : 'chýba'
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
    ['Číslo', 'Odberateľ', 'IČO', 'Vystavená', 'Dodanie', 'Splatnosť', 'Základ', 'DPH', 'Spolu', 'Mena', 'Kurz za 1 €', 'Zaplatená', 'Súbor v archíve'],
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
      invoice.currency,
      invoice.fxRate ?? '',
      invoice.paidOn ?? '',
      file,
    ]),
  ])

  // The business trips of the year as they were worked out (trips.ts), a trip taken back said so.
  const json = (v: unknown) => {
    try {
      return typeof v === 'string' ? (JSON.parse(v) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  const tripsCsv = csv([
    ['Číslo', 'Kto', 'Účel', 'Odkiaľ', 'Kam', 'Odchod', 'Návrat', 'Doprava', 'EČV', 'Km', 'Stravné', 'Auto: základná náhrada', 'Auto: palivo', 'Spolu', 'Zrušená'],
    ...tripRows.results.map((r) => {
      const result = json(r.result)
      const car = json(r.car)
      return [
        String(r.number),
        String(r.traveller),
        String(r.purpose),
        String(r.place_from),
        String(r.place_to),
        String(r.start_at).replace('T', ' '),
        String(r.end_at).replace('T', ' '),
        String(r.transport),
        typeof r.plate === 'string' ? r.plate : '',
        car && typeof car.km === 'number' ? car.km : '',
        csvMoney(typeof result?.meals === 'number' ? result.meals : null),
        csvMoney(typeof result?.carBasic === 'number' ? result.carBasic : null),
        csvMoney(typeof result?.carFuel === 'number' ? result.carFuel : null),
        csvMoney(Number(r.total_cents)),
        typeof r.removed_at === 'number' ? bratislava(r.removed_at * 1000).day : '',
      ]
    }),
  ])

  const messagesText = messageRows.results
    .map((m) => `${moment(m.created_at)}, ${m.side === 'firmony' ? `${m.author_name ?? BRAND.name} (${BRAND.name})` : (m.author_name ?? 'Vy')}:\r\n${m.body.replace(/\r?\n/g, '\r\n')}\r\n`)
    .join('\r\n')

  const encoder = new TextEncoder()
  const text = (value: string) => async () => encoder.encode(value)
  const files = env.FILES
  if (!files && (docs.some(({ file }) => file) || statementFiles.size > 0 || papers.results.length > 0 || receipts.results.length > 0 || payrollFiles.results.length > 0)) throw new Error('Archive file storage is unavailable')
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield {
      name: 'citajte.txt',
      when: at,
      data: text(readme(company, year, { invoices: invoices.length > 0, messages: messageRows.results.length > 0, books: hasBooks, statements: statementList.length > 0, trips: tripRows.results.length > 0 }, today)),
    }
    yield { name: 'doklady.csv', when: at, data: text(docsCsv) }
    yield { name: 'platby.csv', when: at, data: text(paymentsCsv) }
    if (statementList.length > 0) yield { name: 'vypisy.csv', when: at, data: text(statementsCsv) }
    if (invoices.length > 0) yield { name: 'faktury.csv', when: at, data: text(invoicesCsv) }
    if (tripRows.results.length > 0) yield { name: 'cesty.csv', when: at, data: text(tripsCsv) }
    if (messageRows.results.length > 0) yield { name: 'spravy.txt', when: at, data: text(messagesText) }
    if (hasBooks) {
      yield { name: 'uctovnictvo/dennik.csv', when: at, data: text(journalCsv(books, bookYear)) }
      yield { name: 'uctovnictvo/hlavna-kniha.csv', when: at, data: text(generalLedgerCsv(books, bookYear)) }
      yield { name: 'uctovnictvo/predvaha.csv', when: at, data: text(trialCsv(trialBalance(books, bookYear, 12))) }
      yield { name: 'uctovnictvo/saldokonto.csv', when: at, data: text(saldoCsv(books, bratislava(Date.now()).day)) }
    }
    yield { name: 'zmluva.txt', when: at, data: text(contractText(company, order, contract)) }
    if (contract.data && contract.sha256) {
      yield { name: 'zmluva.json', when: at, data: text(contract.data) }
      yield { name: 'zmluva.sha256', when: at, data: text(`${contract.sha256}  zmluva.json\n`) }
    }
    yield* snapshots
    for (const report of payrollFiles.results) yield {
      name: zipName(/^[NO]514\d{4}\.\d{3}$/.test(report.name) ? `mzdy/podania/${report.kind}-${report.period}-${report.id}/${report.name}` : `mzdy/podania/${report.kind}-${report.period}-${report.id}.${report.file_key.split('.').pop()}`), when: report.created_at,
      data: async () => {
        const object = await files?.get(report.file_key)
        if (!object) throw new Error('Payroll report missing from archive')
        const bytes = new Uint8Array(await object.arrayBuffer())
        if (bytes.length !== report.file_bytes || await fileHash(bytes) !== report.sha256) throw new Error('Payroll report checksum mismatch')
        return bytes
      },
    }
    for (const receipt of receipts.results) yield {
      name: zipName(`podania/potvrdenky/${receipt.id}.${receipt.file_key.split('.').pop()}`), when: receipt.at,
      data: async () => {
        const object = await files?.get(receipt.file_key)
        if (!object) throw new Error('Filing receipt missing from archive')
        const bytes = new Uint8Array(await object.arrayBuffer())
        if (bytes.length !== receipt.file_bytes || await fileHash(bytes) !== receipt.file_sha256) throw new Error('Filing receipt checksum mismatch')
        return bytes
      },
    }
    for (const paper of papers.results) yield { name: uniqueName(zipName(`${paper.deleted_at === null ? 'odovzdane' : 'odobrane-prilohy'}/${paper.kind}-${paper.id}-${paper.file_name}`), taken), when: paper.created_at, data: async () => { const object = await files?.get(paper.r2_key); return object ? new Uint8Array(await object.arrayBuffer()) : null } }
    for (const { invoice, file } of invoiceFiles) {
      yield { name: file, when: invoice.createdAt, data: async () => encoder.encode(ublOf(invoice, await invoiceLines(db, invoice.id), company)) }
    }
    for (const [key, { name, when }] of statementFiles) {
      if (!files) break
      yield {
        name,
        when,
        data: async () => {
          const object = await files.get(key)
          return object ? new Uint8Array(await object.arrayBuffer()) : null
        },
      }
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
  async function* verifiedEntries(): AsyncGenerator<ZipEntry> {
    const manifest: { name: string; bytes: number; sha256: string }[] = []
    for await (const entry of entries()) yield { ...entry, data: async () => {
      const bytes = await entry.data()
      if (!bytes) throw new Error(`Archive source missing: ${entry.name}`)
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
      manifest.push({ name: zipName(entry.name), bytes: bytes.length, sha256 })
      return bytes
    } }
    yield { name: 'manifest.json', when: at, data: text(JSON.stringify({ format: 'firmony-accounting-handover', version: 1, company: company.id, year, createdAt: at, receipt: completion?.id ?? null, revision: completion?.revision ?? null, files: manifest }, null, 2)) }
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
    body: zipStream(verifiedEntries(), undefined, { strict: true, onComplete: completion?.onComplete }),
  }
}
