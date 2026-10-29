// The real reader on a set of made-up Slovak documents (20 October 2026, "Start here" item 10.2b): each document is
// sent to the model as the app sends it, and what it read is compared with what is on it, field by field. Needs
// ANTHROPIC_API_KEY (an account of europio's; about 30 calls of the reader's model); not part of the checks on GitHub.
//   ANTHROPIC_API_KEY=... npm run test:reader
//   FIRMONY_READER_ONLY=blocek npm run test:reader      (only the files whose name holds the word)
// The documents come from scripts/reader/make-documents.py; the report goes to .wrangler/reader/report.json. It fails
// when totals, VAT, the day of issue, the IČO or the amount left to pay are right on fewer than 98 % of the documents.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareFields, READ_FIELDS, READER, readDocument, sniff, CATEGORY_IDS } from '../.wrangler/tmp/reader-bundle.mjs'
import { createHash } from 'node:crypto'

const KEY = process.env.ANTHROPIC_API_KEY
if (!KEY) {
  console.log('ANTHROPIC_API_KEY is not set: the reader cannot be asked. Nothing was measured.')
  process.exit(2)
}
const dataset = readFileSync(new URL('./reader/expected.json', import.meta.url), 'utf8')
const set = JSON.parse(dataset)
const categories = JSON.parse(readFileSync(new URL('./reader/categories.json', import.meta.url),'utf8'))
const only = process.env.FIRMONY_READER_ONLY
const docs = set.documents.filter((d) => !only || d.file.includes(only))
if (docs.length === 0) throw new Error('No fixture matched: nothing was measured.')
for (const doc of set.documents) {
  if (!CATEGORY_IDS.includes(doc.category) || categories[doc.file]?.category !== doc.category) throw new Error(`Missing or inconsistent expected category: ${doc.file}`)
}
// What is left to pay decides pairing and payment orders: held to the same floor since 29 October 2026.
const MUST = ['totalCents', 'vatCents', 'issuedOn', 'partyIco', 'dueCents']
const FLOOR = 0.98

const results = []
let next = 0
async function worker() {
  while (next < docs.length) {
    const doc = docs[next++]
    const bytes = new Uint8Array(readFileSync(new URL(`./reader/docs/${doc.file}`, import.meta.url)))
    const kind = sniff(bytes)
    const started = Date.now()
    const result = await readDocument(KEY, { kind, bytes }, set.company)
    const ms = Date.now() - started
    if (!('reading' in result)) {
      results.push({ file: doc.file, manual: result.manual, ms })
      console.log(`${doc.file}: not read (${result.manual})`)
      continue
    }
    const r = result.reading
    // A document with no VAT may be read as 0 or left empty: both say the same.
    const got = { ...r, vatCents: r.vatCents ?? 0 }
    const want = { ...doc, vatCents: doc.vatCents ?? 0 }
    const fields = compareFields(got, want, 'ai')
    // Only genuinely unspecified fields are excluded; category is now present for every fixture.
    for (const field of READ_FIELDS) if (!(field in doc)) fields[field] = null
    const extra = {}
    if (doc.ekasaUid !== undefined) extra.ekasaUid = (r.ekasaUid ?? null) === doc.ekasaUid
    if (doc.ekasaOkp !== undefined) extra.ekasaOkp = (r.ekasaOkp ?? null) === doc.ekasaOkp
    if (doc.corrects) extra.corrects = (r.corrects ?? '').replace(/\s/g, '').toUpperCase() === doc.corrects.toUpperCase()
    // What is left to pay after a credit or a balance was set off (29 October 2026): on every document, so one the reader
    // invents where the whole total is paid counts as wrong too.
    extra.dueCents = (r.dueCents ?? null) === (doc.dueCents ?? null)
    const wrong = [...READ_FIELDS.filter((f) => fields[f] === false), ...Object.keys(extra).filter((k) => extra[k] === false)]
    results.push({ file: doc.file, ms, fields, extra, wrong, got: Object.fromEntries(wrong.map((k) => [k, r[k] ?? null])), want: Object.fromEntries(wrong.map((k) => [k, doc[k] ?? null])) })
    console.log(`${doc.file}: ${wrong.length === 0 ? 'right' : `wrong ${wrong.map((k) => `${k} (read ${JSON.stringify(r[k] ?? null)}, is ${JSON.stringify(doc[k] ?? null)})`).join(', ')}`} ${ms} ms`)
  }
}
await Promise.all(Array.from({ length: 4 }, worker))

const read = results.filter((r) => r.fields)
const share = (field) => {
  const compared = results.filter((r) => !r.fields || r.fields[field] !== null)
  const right = compared.filter((r) => r.fields && r.fields[field] === true)
  return { field, right: right.length, of: compared.length, share: compared.length ? right.length / compared.length : 1 }
}
const extraShare = (key) => {
  const compared = results.filter((r) => r.extra && r.extra[key] !== undefined)
  return { field: key, right: compared.filter((r) => r.extra[key]).length, of: compared.length, share: compared.length ? compared.filter((r) => r.extra[key]).length / compared.length : 1 }
}
const table = [...READ_FIELDS.map(share), ...['ekasaUid', 'ekasaOkp', 'corrects', 'dueCents'].map(extraShare)].filter((row) => row.of > 0)
console.log(`\nReader ${READER.model}: ${read.length} of ${results.length} documents read, ${read.filter((r) => r.wrong.length === 0).length} with every field right.`)
for (const row of table) console.log(`${row.field.padEnd(12)} ${String(row.right).padStart(3)} / ${String(row.of).padEnd(3)} ${(row.share * 100).toFixed(1)} %`)
const independent = results.filter((r) => !categories[r.file]?.contextDependent)
const categoryDirect = {right:independent.filter((r) => r.fields?.category === true).length,of:independent.length}
console.log(`Category on context-independent scenarios: ${categoryDirect.right} / ${categoryDirect.of}. Full category accuracy uses documented scenario labels, not proof of tax treatment.`)
mkdirSync('.wrangler/reader', { recursive: true })
const report = { model: READER.model, at: new Date().toISOString(), datasetSha256:createHash('sha256').update(dataset).digest('hex'),categoryDirect,table,results }
writeFileSync('.wrangler/reader/report.json', JSON.stringify(report, null, 1))
// Preserve the small synthetic report in the job log even when GitHub's artifact quota blocks its ZIP upload.
console.log(`READER_REPORT_JSON ${JSON.stringify(report)}`)
const short = table.filter((row) => MUST.includes(row.field) && row.share < FLOOR)
if (short.length > 0) {
  console.log(`\nBelow ${FLOOR * 100} %: ${short.map((row) => row.field).join(', ')}`)
  process.exit(1)
}
console.log(`\nTotals, VAT, the day of issue, the IČO and the amount left to pay are right on at least ${FLOOR * 100} % of them.`)
