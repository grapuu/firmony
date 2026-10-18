// Every kind of e-invoice Firmony writes, against what each Peppol access point checks before it sends one
// (18 October 2026): the UBL 2.1 schema, the CEN rules of EN 16931 and Peppol BIS Billing 3.0's own
// (test/peppol/README.md). A digital postman refuses a file that breaks a `fatal` rule, so none may; a `warning` is
// printed.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { build } from 'esbuild'
import SaxonJS from 'saxon-js'
import { validateXML } from 'xmllint-wasm'
import { check, done } from './check.mjs'

const here = new URL('.', import.meta.url).pathname
const tmp = new URL('../.wrangler/tmp/', import.meta.url).pathname
mkdirSync(tmp, { recursive: true })

/** The rules in SaxonJS's compiled form, made once per version of the file. */
function compiled(name) {
  const source = `${here}peppol/${name}.xslt`
  const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16)
  const sef = `${tmp}peppol-${name}-${hash}.sef.json`
  if (!existsSync(sef))
    execFileSync(process.execPath, [new URL('../node_modules/xslt3/xslt3.js', import.meta.url).pathname, `-xsl:${source}`, `-export:${sef}`, '-nogo', '-relocate:on'], { stdio: 'inherit' })
  return JSON.parse(readFileSync(sef, 'utf8'))
}
const rules = { cen: compiled('CEN-EN16931-UBL'), peppol: compiled('PEPPOL-EN16931-UBL') }

// The UBL 2.1 schemas (test/xsd/ubl21, see test/peppol/README.md).
const ubl = new URL('./xsd/ubl21/', import.meta.url).pathname
const preload = readdirSync(`${ubl}common`).map((f) => ({ fileName: `common/${f}`, contents: readFileSync(`${ubl}common/${f}`, 'utf8') }))
async function schemaErrors(xml) {
  const root = xml.includes('<CreditNote ') ? 'CreditNote' : 'Invoice'
  const schema = { fileName: `maindoc/UBL-${root}-2.1.xsd`, contents: readFileSync(`${ubl}maindoc/UBL-${root}-2.1.xsd`, 'utf8') }
  const result = await validateXML({ xml: [{ fileName: 'e-invoice.xml', contents: xml }], schema: [schema], preload })
  return result.valid ? [] : result.errors.map((e) => ({ set: 'xsd', flag: 'fatal', id: 'UBL-2.1', text: e.message }))
}

/** What a file breaks: each failed assert with its set, flag and id. */
async function validate(xml) {
  const out = await schemaErrors(xml)
  for (const [set, stylesheet] of Object.entries(rules)) {
    const svrl = SaxonJS.transform({ stylesheetInternal: stylesheet, sourceText: xml, destination: 'serialized' }, 'sync').principalResult
    for (const m of svrl.matchAll(/<svrl:failed-assert([^>]*)>[\s\S]*?<svrl:text>([\s\S]*?)<\/svrl:text>/g)) {
      out.push({ set, flag: /flag="([^"]*)"/.exec(m[1])?.[1] ?? 'fatal', id: /id="([^"]*)"/.exec(m[1])?.[1] ?? '?', text: m[2].replace(/\s+/g, ' ').trim() })
    }
  }
  return out
}

await build({
  entryPoints: [new URL('./peppol.entry.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  logLevel: 'warning',
  outfile: `${tmp}peppol-bundle.mjs`,
})
const { invoices } = await import(`${tmp}peppol-bundle.mjs`)

// The rules see what they are meant to: Peppol's own example passes, and the same without a buyer reference fails.
const example = readFileSync(`${here}peppol/base-example.xml`, 'utf8')
check("the rules pass Peppol's own example", (await validate(example)).filter((f) => f.flag === 'fatal').length === 0)
check(
  'and catch a file that breaks one',
  (await validate(example.replace(/<cbc:BuyerReference>.*?<\/cbc:BuyerReference>/, ''))).some((f) => f.id === 'PEPPOL-EN16931-R003'),
)

const seller = { id: 'c', createdAt: 0, name: 'TEST-ONLY Ukážková firma s. r. o.', ico: '57442452', dic: '2122222222', icdph: 'SK2122222222', address: 'Hlavná 1, 811 01 Bratislava', vatPayer: true }
const invoice = {
  id: 'i',
  number: '20260006',
  status: 'issued',
  customerName: 'TEST-ONLY Smer & <Syn> s. r. o.',
  customerIco: '50123456',
  customerDic: '2120000000',
  customerIcdph: 'SK2120000000',
  customerAddress: 'Námestie 2, 040 01 Košice',
  customerEmail: null,
  issuedOn: '2026-10-01',
  deliveredOn: '2026-10-01',
  dueOn: '2026-10-15',
  note: 'Ďakujeme.',
  iban: 'SK31 1200 0000 1987 4263 7541',
}
const line = (position, description, quantityMilli, unit, unitCents, vatRate) => ({
  position,
  description,
  quantityMilli,
  unit,
  unitCents,
  vatRate,
  baseCents: Math.round((quantityMilli * unitCents) / 1000),
})
const lines = [line(1, 'Práca', 3000, 'hod', 13000, 23), line(2, 'Kniha', 1000, 'ks', 8750, 5), line(3, 'Zľava', 1000, 'ks', -1000, 23), line(4, 'Potraviny', 2500, 'kg', 333, 19)]

const cases = [
  ['an invoice of a VAT payer at three rates with a discount', invoices.ublOf(invoice, lines, seller)],
  ["a VAT payer's supply exempt from VAT", invoices.ublOf(invoice, [line(1, 'Školenie', 1000, null, 5000, 0)], seller)],
  [
    'an invoice of a company that is no VAT payer',
    invoices.ublOf(
      { ...invoice, customerIcdph: null },
      lines.map((l) => ({ ...l, vatRate: 0 })),
      { ...seller, icdph: null, vatPayer: false },
    ),
  ],
  ['an invoice without an account to pay to', invoices.ublOf({ ...invoice, iban: null, note: null }, lines, seller)],
  // The Financial Administration's Slovak transposition (v1.12, 14 October 2026): the IČO with its scheme 0158, the
  // seller's register entry (BT-33) and the day of supply when it is not the day of issue (BT-7).
  [
    "an invoice with the seller's register entry and a day of supply before its issue",
    invoices.ublOf({ ...invoice, deliveredOn: '2026-09-30' }, lines, { ...seller, legalForm: 'sro', registerLine: 'Obchodný register Mestského súdu Bratislava III, oddiel Sro, vložka č. 123456/B' }),
  ],
  [
    'an invoice to a customer in another member state',
    invoices.ublOf({ ...invoice, customerIcdph: 'CZ12345678', customerDic: null, customerAddress: 'Náměstí 1, 110 00 Praha' }, [line(1, 'Práca', 1000, 'hod', 10000, 23)], seller),
  ],
  ...[
    ['construction work with domestic reverse charge (AE)', 'reverse'],
    ['goods to a VAT payer of another member state (K)', 'eu_goods'],
    ['a service whose customer in another member state pays the VAT (AE)', 'eu_service'],
    ['an export (G)', 'export'],
    ['a supply of a VAT payer outside Slovakia (O)', 'outside'],
  ].map(([name, mode]) => [
    name,
    invoices.ublOf(
      {
        ...invoice,
        mode,
        customerIcdph: mode === 'export' ? 'CHE123456789' : mode === 'reverse' ? 'SK2120000000' : 'DE123456789',
        customerDic: null,
        customerIco: null,
        customerAddress: 'Hauptstraße 1, 10115 Berlin',
      },
      [line(1, 'Tovar', 2000, 'ks', 5000, 0)],
      seller,
    ),
  ]),
  [
    "an advance's tax document (386)",
    invoices.ublOf(
      { ...invoice, number: '20260008', kind: 'advance', iban: null, relates: 'p', relatesNumber: 'ZF20260001' },
      invoices.advanceLines(lines, 50000, true, (rate) => `Prijatá záloha, DPH ${rate} %`),
      seller,
    ),
  ],
  [
    'a final invoice deducting an advance',
    invoices.ublOf(
      { ...invoice, number: '20260009', relates: 'p', relatesNumber: 'ZF20260001' },
      [...lines, ...invoices.deductionLines([{ number: '20260008', lines: invoices.advanceLines(lines, 50000, true, () => 'z') }], lines.length + 1, (n) => `Odpočet zálohy, doklad č. ${n}`)],
      seller,
    ),
  ],
  [
    'an invoice in US dollars with its VAT also in euros',
    invoices.ublOf({ ...invoice, number: '20260010', currency: 'USD', fxRate: '1,0823', fxDay: '2026-09-30', customerIcdph: 'SK2120000000' }, lines, seller),
  ],
  [
    'an export in US dollars (G)',
    invoices.ublOf(
      { ...invoice, number: '20260011', mode: 'export', currency: 'USD', fxRate: '1,0823', fxDay: '2026-09-30', customerIcdph: 'CHE123456789', customerDic: null, customerIco: null, customerAddress: 'Bahnhofstrasse 1, 8001 Zürich' },
      [line(1, 'Tovar', 2000, 'ks', 5000, 0)],
      seller,
    ),
  ],
  [
    // A private person has no electronic address on Peppol, so its invoice is a file for import, never sent on the
    // network: Peppol's own rule R010 (a buyer's address) is the one it may break.
    'an export to a private person in the United States, the state chosen (G), a file outside the network (R010 only)',
    invoices.ublOf(
      { ...invoice, number: '20260012', mode: 'export', customerIcdph: null, customerDic: null, customerIco: null, customerCountry: 'US', customerAddress: '5th Avenue 1, 10001 New York' },
      [line(1, 'Tovar', 1000, 'ks', 5000, 0)],
      seller,
    ),
  ],
  [
    'a credit note of an invoice, kept with the minus',
    invoices.ublOf(
      { ...invoice, number: '20260007', iban: null, kind: 'credit', corrects: 'i', correctsNumber: '20260006', correctsIssuedOn: '2026-10-01', reason: 'Vrátený tovar' },
      invoices.creditLines([line(1, 'Vrátená práca', 1000, 'hod', 13000, 23), line(2, 'Kniha', 1000, 'ks', 8750, 5)]),
      seller,
    ),
  ],
  // The review of 18 October 2026: a credit note takes its invoice's day of supply, which its schema wants right after
  // the day of issue (in an invoice it comes after the note); a seller of a legal form not known writes its register alone.
  [
    'a credit note with the day of supply of its invoice, of a seller whose legal form is not known',
    invoices.ublOf(
      { ...invoice, number: '20260013', iban: null, kind: 'credit', corrects: 'i', correctsNumber: '20260006', correctsIssuedOn: '2026-10-01', reason: 'Zľava', deliveredOn: '2026-09-30' },
      invoices.creditLines([line(1, 'Zľava z práce', 1000, 'hod', 2000, 23)]),
      { ...seller, legalForm: null, registerLine: 'Obchodný register Mestského súdu Bratislava III, oddiel Sr, vložka č. 999/B' },
    ),
  ],
]
check(
  'the schema sees what it is meant to: an element out of its place fails',
  (
    await schemaErrors(
      // The invoice's number moved after its day of issue.
      cases[0][1].replace('<cbc:ID>20260006</cbc:ID>\n', '').replace('<cbc:DueDate>', '<cbc:ID>20260006</cbc:ID><cbc:DueDate>'),
    )
  ).length > 0,
)
const dollars = cases.find(([name]) => name.startsWith('an invoice in US dollars'))?.[1] ?? ''
check(
  'and an invoice in another currency without its VAT in euros fails (BR-53)',
  (await validate(dollars.replace(/<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">[^<]*<\/cbc:TaxAmount><\/cac:TaxTotal>\n/, ''))).some((f) => f.id === 'BR-53'),
)
const slovak = cases.find(([name]) => name.startsWith("an invoice with the seller's register entry"))?.[1] ?? ''
check(
  "the Slovak transposition's terms: both IČO with scheme 0158, the register entry, the day of supply",
  slovak.includes('<cbc:CompanyID schemeID="0158">57442452</cbc:CompanyID><cbc:CompanyLegalForm>Spoločnosť s ručením obmedzeným, Obchodný register Mestského súdu Bratislava III, oddiel Sro, vložka č. 123456/B</cbc:CompanyLegalForm>') &&
    slovak.includes('<cbc:CompanyID schemeID="0158">50123456</cbc:CompanyID></cac:PartyLegalEntity>') &&
    slovak.includes('<cbc:TaxPointDate>2026-09-30</cbc:TaxPointDate>') &&
    !(cases[0]?.[1] ?? '').includes('TaxPointDate'),
)
const creditDay = cases.find(([name]) => name.startsWith('a credit note with the day of supply'))?.[1] ?? ''
check(
  "a credit note's day of supply right after its day of issue, a register entry with no guessed legal form",
  creditDay.includes('<cbc:IssueDate>2026-10-01</cbc:IssueDate>\n<cbc:TaxPointDate>2026-09-30</cbc:TaxPointDate>\n<cbc:CreditNoteTypeCode>') &&
    creditDay.includes('<cbc:CompanyLegalForm>Obchodný register Mestského súdu Bratislava III, oddiel Sr, vložka č. 999/B</cbc:CompanyLegalForm>'),
  creditDay.slice(0, 900),
)
for (const [name, xml] of cases) {
  const found = await validate(xml)
  const outside = name.includes('(R010 only)')
  const fatal = found.filter((f) => f.flag === 'fatal' && !(outside && f.id === 'PEPPOL-EN16931-R010'))
  for (const f of found.filter((f) => f.flag !== 'fatal')) console.log(`     warning ${f.set} ${f.id}: ${f.text.slice(0, 140)}`)
  check(`${name}: valid UBL 2.1, no rule of EN 16931 or Peppol BIS 3.0 broken`, fatal.length === 0, fatal.map((f) => `${f.set} ${f.id}: ${f.text.slice(0, 160)}`).join(' | '))
}

done('peppol')
