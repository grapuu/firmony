// The real reader on a set of made-up Slovak documents (20 October 2026, "Start here" item 10.2b): each document is
// sent to the model as the app sends it, and what it read is compared with what is on it, field by field. Needs
// ANTHROPIC_API_KEY (an account of europio's; about 30 calls of the reader's model); not part of the checks on GitHub.
//   ANTHROPIC_API_KEY=... npm run test:reader
//   FIRMONY_READER_ONLY=blocek npm run test:reader      (only the files whose name holds the word)
// The documents come from scripts/reader/make-documents.py; the report goes to .wrangler/reader/report.json. It fails
// when totals, VAT, the day of issue or the IČO are right on fewer than 98 % of the documents.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareFields, READ_FIELDS, READER, readDocument, sniff } from '../.wrangler/tmp/reader-bundle.mjs'

const KEY = process.env.ANTHROPIC_API_KEY
if (!KEY) {
  console.log('ANTHROPIC_API_KEY is not set: the reader cannot be asked. Nothing was measured.')
  process.exit(2)
}
const set = JSON.parse(readFileSync(new URL('./reader/expected.json', import.meta.url), 'utf8'))
const only = process.env.FIRMONY_READER_ONLY
const docs = set.documents.filter((d) => !only || d.file.includes(only))
const MUST = ['totalCents', 'vatCents', 'issuedOn', 'partyIco']
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
    // A field the set does not say (the category: which cost a receipt is, is the accountant's call) is not judged.
    for (const field of READ_FIELDS) if (!(field in doc)) fields[field] = null
    const extra = {}
    if (doc.ekasaUid !== undefined) extra.ekasaUid = (r.ekasaUid ?? null) === doc.ekasaUid
    if (doc.ekasaOkp !== undefined) extra.ekasaOkp = (r.ekasaOkp ?? null) === doc.ekasaOkp
    if (doc.corrects) extra.corrects = (r.corrects ?? '').replace(/\s/g, '').toUpperCase() === doc.corrects.toUpperCase()
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
const table = [...READ_FIELDS.map(share), ...['ekasaUid', 'ekasaOkp', 'corrects'].map(extraShare)].filter((row) => row.of > 0)
console.log(`\nReader ${READER.model}: ${read.length} of ${results.length} documents read, ${read.filter((r) => r.wrong.length === 0).length} with every field right.`)
for (const row of table) console.log(`${row.field.padEnd(12)} ${String(row.right).padStart(3)} / ${String(row.of).padEnd(3)} ${(row.share * 100).toFixed(1)} %`)
mkdirSync('.wrangler/reader', { recursive: true })
writeFileSync('.wrangler/reader/report.json', JSON.stringify({ model: READER.model, at: new Date().toISOString(), table, results }, null, 1))
const short = table.filter((row) => MUST.includes(row.field) && row.share < FLOOR)
if (short.length > 0) {
  console.log(`\nBelow ${FLOOR * 100} %: ${short.map((row) => row.field).join(', ')}`)
  process.exit(1)
}
console.log(`\nTotals, VAT, the day of issue and the IČO are right on at least ${FLOOR * 100} % of them.`)
