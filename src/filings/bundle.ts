// Filing in one go (his word of 17 October 2026: "nech to je pre ňu komfortné, že už to bude celé v balíku a len
// lúsknutím prsta to urobí"). Every current document of the accountant's companies that waits to be sent, in one ZIP
// sorted by where it is filed, and one form that records what she did on the portals: the number each submission got
// and, when she has it, its receipt. Each row still goes through recordDelivery, so a row is checked exactly as on the
// document's own page (its revision, the allowed change, the receipt, the company's authority); nothing is recorded
// for a row she left empty, and the portals themselves are never reached from here.
import { fileHash } from '../app/read'
import type { User } from '../app/store'
import { now, sha256Hex } from '../db'
import { payrollStatusSql, targetActiveSql } from '../payroll-reporting/sql'
import { zipName, zipStream, uniqueName, type ZipEntry } from '../zip'
import { activePackageSql, FILING_KINDS, safeJson, type DeliveryState, type FilingType } from './model'
import { recordDelivery, type DeliveryChange } from './store'

/** Where a document is filed, in the order the folders of the ZIP and the form's groups follow. */
export const DESTINATIONS = {
  fs: { name: 'Finančná správa', folder: 'Financna sprava', channel: 'Osobná internetová zóna finančnej správy' },
  sp: { name: 'Sociálna poisťovňa', folder: 'Socialna poistovna', channel: 'Elektronická pobočka Sociálnej poisťovne' },
  health25: { name: 'Všeobecná zdravotná poisťovňa', folder: 'VsZP', channel: 'Elektronická pobočka VšZP' },
  health24: { name: 'Dôvera', folder: 'Dovera', channel: 'Elektronická pobočka Dôvery' },
  health27: { name: 'Union', folder: 'Union', channel: 'Elektronická pobočka Union' },
} as const
export type Destination = keyof typeof DESTINATIONS

const PAYROLL_LABELS: Record<string, string> = {
  tax: 'Mesačný prehľad o zrazených preddavkoch',
  sp: 'Mesačný výkaz poistného',
  health24: 'Mesačný výkaz preddavkov',
  health25: 'Mesačný výkaz preddavkov',
  health27: 'Mesačný výkaz preddavkov',
}

export interface BundleItem {
  source: 'filing' | 'payroll'
  id: string
  companyId: string
  company: string
  ico: string | null
  period: string
  /** The document as the accountant knows it: "Priznanie k DPH", "Mesačný výkaz poistného". */
  label: string
  destination: Destination
  status: DeliveryState
  revision: number
  /** The number recorded with the last submission, offered again when only the receipt is missing. */
  lastReference: string | null
  name: string
  /** The document's place among a company's documents of one period: the VAT return before its statements. */
  rank: number
  sha256: string
  xml: string | null
  fileKey: string | null
  fileBytes: number | null
  /** The financial statements' notes saved with their podklady (a PDF kept as text), attached beside them in eDane. */
  notes: { text: string; sha256: string } | null
}

/** At most this many rows of each list: one page of work, and a form the Worker reads at once. */
export const BUNDLE_ROWS = 40

const visible = `c.closed_at IS NULL AND c.demo = 0 AND c.purge_started_at IS NULL AND (?1 = 'admin' OR c.accountant_id = ?2)`

/** What waits to be sent (prepared, or refused and to be sent again) and what was sent and waits for its receipt. */
export async function bundleItems(db: D1Database, user: User): Promise<{ toSend: BundleItem[]; toConfirm: BundleItem[] }> {
  const filings = (await db.prepare(`SELECT 'filing' AS source, p.id, p.company_id, c.name AS company, c.ico, p.period, p.kind, p.status, p.revision,
        (SELECT e.reference FROM filing_events e WHERE e.id = p.last_event) AS last_reference, p.name, p.sha256, p.xml, NULL AS file_key, NULL AS file_bytes,
        CASE WHEN p.kind = 'uz' THEN (SELECT ${safeJson('k.filed', '$.files.notes.text')} FROM closings k WHERE k.company_id = p.company_id AND CAST(k.year AS TEXT) = p.period) END AS notes_text,
        CASE WHEN p.kind = 'uz' THEN (SELECT ${safeJson('k.filed', '$.files.notes.sha256')} FROM closings k WHERE k.company_id = p.company_id AND CAST(k.year AS TEXT) = p.period) END AS notes_sha
      FROM filing_packages p JOIN companies c ON c.id = p.company_id
      WHERE ${visible} AND p.status IN ('prepared', 'rejected', 'submitted') AND (${activePackageSql('p')})
      ORDER BY p.period, c.name, p.created_at, p.id LIMIT 201`).bind(user.team, user.id).all<Row>()).results
  const payroll = (await db.prepare(`SELECT 'payroll' AS source, p.id, t.company_id, c.name AS company, c.ico, t.period, t.kind, p.status, p.revision,
        (SELECT e.reference FROM payroll_events e WHERE e.id = p.last_event) AS last_reference, p.name, p.sha256, NULL AS xml, p.file_key, p.file_bytes, NULL AS notes_text, NULL AS notes_sha
      FROM payroll_targets t JOIN companies c ON c.id = t.company_id JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id
      WHERE ${visible} AND (${targetActiveSql('t', true)}) AND ${payrollStatusSql('t', 'p', true, true, true)} IN ('prepared', 'rejected', 'submitted')
      ORDER BY t.period, c.name, t.kind, p.id LIMIT 201`).bind(user.team, user.id).all<Row>()).results
  const order = Object.keys(DESTINATIONS)
  const items = [...filings, ...payroll].map(item).sort((a, b) => order.indexOf(a.destination) - order.indexOf(b.destination) || a.period.localeCompare(b.period) || a.company.localeCompare(b.company, 'sk') || a.rank - b.rank)
  return {
    toSend: items.filter((i) => i.status !== 'submitted').slice(0, BUNDLE_ROWS),
    toConfirm: items.filter((i) => i.status === 'submitted').slice(0, BUNDLE_ROWS),
  }
}

interface Row {
  source: 'filing' | 'payroll'; id: string; company_id: string; company: string; ico: string | null; period: string; kind: string
  status: DeliveryState; revision: number; last_reference: string | null; name: string; sha256: string; xml: string | null
  file_key: string | null; file_bytes: number | null; notes_text: string | null; notes_sha: string | null
}

function item(r: Row): BundleItem {
  const filing = r.source === 'filing'
  const destination: Destination = filing || r.kind === 'tax' ? 'fs' : (r.kind as Destination)
  return {
    source: r.source, id: r.id, companyId: r.company_id, company: r.company, ico: r.ico, period: r.period,
    label: filing ? FILING_KINDS[r.kind as FilingType] : (PAYROLL_LABELS[r.kind] ?? 'Mzdový výkaz'),
    destination: Object.hasOwn(DESTINATIONS, destination) ? destination : 'fs', status: r.status, revision: Number(r.revision),
    lastReference: r.last_reference, name: r.name, rank: filing ? Object.keys(FILING_KINDS).indexOf(r.kind) : 10 + Object.keys(PAYROLL_LABELS).indexOf(r.kind), sha256: r.sha256, xml: r.xml, fileKey: r.file_key, fileBytes: r.file_bytes === null ? null : Number(r.file_bytes),
    notes: typeof r.notes_text === 'string' && typeof r.notes_sha === 'string' ? { text: r.notes_text, sha256: r.notes_sha } : null,
  }
}

const periodWords = (period: string) => (period.length === 4 ? `rok ${period}` : period.includes('-Q') ? `${period.slice(6)}. štvrťrok ${period.slice(0, 4)}` : `${period.slice(5)}/${period.slice(0, 4)}`)

/** The file's name in the ZIP: a payroll batch keeps the name its portal wants (N514… for a health insurer). */
function fileName(i: BundleItem, ext: string): string {
  if (i.source === 'payroll' && /^[NO]514\d{4}\.\d{3}$/.test(i.name)) return i.name
  return `${i.period} ${i.label}.${ext}`
}

/**
 * The ZIP of everything to be sent: a folder for each office, in it a folder for each company, each document as
 * saved with its podklady (its fingerprint checked again; one that differs is left out and named in the overview).
 * PREHLAD.txt says what each file is, where it goes and what to record afterwards.
 */
export function bundleZip(items: BundleItem[], files: R2Bucket | undefined, at = now()): ReadableStream<Uint8Array> {
  const taken = new Set<string>()
  const lines: string[] = []
  const skipped: string[] = []
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const i of items) {
      const ext = i.source === 'filing' ? 'xml' : (i.fileKey?.split('.').pop() ?? 'xml')
      const folder = `${DESTINATIONS[i.destination].folder}/${i.company}${i.ico ? ` (ICO ${i.ico})` : ''}`
      const name = uniqueName(zipName(`${folder}/${fileName(i, ext)}`), taken)
      const bytes = await read(i, files)
      if (!bytes) {
        skipped.push(`${i.company}, ${i.label}, ${periodWords(i.period)}: súbor sa nezhoduje s uloženým odtlačkom alebo nie je dostupný. Otvorte podanie vo Firmony.`)
        continue
      }
      lines.push(`${name}\n  ${i.company}${i.ico ? `, IČO ${i.ico}` : ''} · ${i.label} · ${periodWords(i.period)} · podať: ${DESTINATIONS[i.destination].name}${i.status === 'rejected' ? ' · opätovné odoslanie po odmietnutí' : ''}\n  SHA-256 ${i.sha256}`)
      yield { name, when: at, data: async () => bytes }
      // The statements' notes beside them, as eDane takes them: a PDF attached to the statements.
      if (i.notes && (await sha256Hex(i.notes.text)) === i.notes.sha256) {
        const notes = new TextEncoder().encode(i.notes.text)
        const notesName = uniqueName(zipName(`${folder}/${i.period} Poznamky k zavierke.pdf`), taken)
        lines.push(`${notesName}\n  ${i.company} · poznámky k účtovnej závierke · ${periodWords(i.period)} · priložiť k závierke ako PDF\n  SHA-256 ${i.notes.sha256}`)
        yield { name: notesName, when: at, data: async () => notes }
      }
    }
    const text = [
      'Firmony: balík na podanie',
      '',
      'Každý súbor nahrajte na portáli úradu, ktorého priečinok ho obsahuje (Načítať zo súboru). Potom vo Firmony',
      'v časti Podania na dokončenie zapíšte čísla podaní a priložte potvrdenky, všetko jedným formulárom.',
      'Prijatie evidujeme až s potvrdenkou, ktorú ste skontrolovali.',
      '',
      ...lines,
      ...(skipped.length ? ['', 'Nezaradené:', ...skipped] : []),
      '',
    ].join('\n')
    yield { name: 'PREHLAD.txt', when: at, data: async () => new TextEncoder().encode(text) }
  }
  return zipStream(entries())
}

async function read(i: BundleItem, files: R2Bucket | undefined): Promise<Uint8Array | null> {
  if (i.source === 'filing') {
    if (i.xml === null || (await sha256Hex(i.xml)) !== i.sha256) return null
    return new TextEncoder().encode(i.xml)
  }
  if (!files || !i.fileKey?.startsWith(`companies/${i.companyId}/filings/`)) return null
  const object = await files.get(i.fileKey)
  if (!object) return null
  const bytes = new Uint8Array(await object.arrayBuffer())
  return bytes.length === i.fileBytes && (await fileHash(bytes)) === i.sha256 ? bytes : null
}

/** One row of the form as it came back. */
export interface BundleRow {
  key: string
  reference: string
  reason: string
  checked: boolean
  receipt: { name: string; bytes: Uint8Array } | null
}

export interface BundleOutcome {
  recorded: number
  /** By row key: what went wrong, said as on the document's own page. */
  errors: Record<string, string>
}

/** The key of a row in the form: its source and id, so a filing and a payroll package can never be confused. */
export const rowKey = (i: Pick<BundleItem, 'source' | 'id'>) => `${i.source === 'filing' ? 'f' : 'm'}-${i.id}`

/**
 * Records what the form says, row by row, each against the rows this user may work on now (the form's own ids are
 * only looked up among them). A row with nothing in it is skipped. A number without a receipt records the submission;
 * a receipt she has checked records the acceptance. Each row stands on its own: one that fails leaves the others.
 */
export async function recordBundle(db: D1Database, files: R2Bucket | undefined, user: User, rows: BundleRow[], externalOn: string, today: string): Promise<BundleOutcome> {
  const { toSend, toConfirm } = await bundleItems(db, user)
  const known = new Map([...toSend, ...toConfirm].map((i) => [rowKey(i), i]))
  const outcome: BundleOutcome = { recorded: 0, errors: {} }
  for (const row of rows) {
    const i = known.get(row.key)
    if (!i) continue
    const reference = row.reference || (i.status === 'submitted' ? (i.lastReference ?? '') : '')
    if (!row.receipt && (i.status === 'submitted' || row.reference === '')) continue
    if (row.receipt && !row.checked) {
      outcome.errors[row.key] = 'Potvrďte, že potvrdenka zodpovedá firme, obdobiu, dokumentu a číslu podania.'
      continue
    }
    const to: DeliveryState = row.receipt ? 'accepted' : 'submitted'
    const input: DeliveryChange = {
      to,
      revision: i.revision,
      externalOn,
      reference,
      reason: row.reason,
      channel: DESTINATIONS[i.destination].channel,
      checked: row.checked,
      ...(row.receipt ? { receipt: row.receipt } : {}),
    }
    const tables = i.source === 'filing' ? ({ packages: 'filing_packages', events: 'filing_events' } as const) : ({ packages: 'payroll_packages', events: 'payroll_events' } as const)
    const result = await recordDelivery(db, files, { id: i.id, company_id: i.companyId, status: i.status, revision: i.revision }, user, input, today, tables)
    if (result.ok) outcome.recorded++
    else outcome.errors[row.key] = result.error ?? 'Záznam sa nepodarilo uložiť.'
  }
  return outcome
}
