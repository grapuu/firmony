// Public, local-only invoice for a Slovak non-VAT business supplying another Slovak business in EUR.
// Sources read 22 October 2026 in the current Slov-Lex originals:
// https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-10 (content, parties, amounts, dates;
// the issuer's internal verification under section 10(1)(f) is not performed by this generator).
// https://static.slov-lex.sk/static/SK/ZZ/1991/513/20260817.html#paragraf-3a (business identity and registry).
// https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-69 (5): do not show VAT as a non-payer.
// This is not a VAT invoice, electronic delivery service, accounting record store or numbering register.
import { formatEurExact } from '../format'
import { pdfCanPrint, pdfOf, textWidth, type PdfBlock } from '../app/pdf'

export const INVOICE_PATH = '/faktura-zadarmo'
export const TOOLS_PATH = '/bezplatne-nastroje'
export const TOOL_UPDATED = '2026-10-22'
export const MAX_ITEMS = 50
export const MAX_TOTAL = 99_999_999_999
export const INVOICE_META = {
  title: 'Faktúra zadarmo bez registrácie | Firmony',
  description: 'Vytvorte faktúru neplatiteľa DPH a stiahnite PDF zadarmo. Bez účtu a zadania platobnej karty. Údaje spracúva Váš prehliadač.',
}

export interface InvoiceParty { name: string; address: string; ico: string; dic: string; registry: string }
export interface FreeLine { description: string; quantity: string; unit: string; price: string }
export interface FreeInvoice {
  supplier: InvoiceParty
  customer: InvoiceParty
  number: string
  issued: string
  supplied: string
  due: string
  iban: string
  vs: string
  note: string
  nonVat: boolean
  domestic: boolean
  lines: FreeLine[]
}
export interface InvoiceCheck {
  errors: { field: string; message: string }[]
  amounts: (number | null)[]
  total: number | null
}

export function blankInvoice(today: string): FreeInvoice {
  const party = (): InvoiceParty => ({ name: '', address: '', ico: '', dic: '', registry: '' })
  return { supplier: party(), customer: party(), number: '', issued: today, supplied: today, due: '', iban: '', vs: '', note: '', nonVat: false, domestic: false,
    lines: [{ description: '', quantity: '1', unit: 'ks', price: '' }] }
}

/** Fixed-point decimal; ambiguity, exponent notation and excess decimal places are refused, never rounded away. */
export function decimalUnits(raw: string, places: number): bigint | null {
  const value = raw.trim().replace(/[\u00a0\u202f]/g, ' ')
  if (!new RegExp(`^(?:\\d+|\\d{1,3}(?: \\d{3})+)(?:[,.]\\d{1,${places}})?$`).test(value)) return null
  const [whole = '', fraction = ''] = value.replace(/ /g, '').replace(',', '.').split('.')
  if (whole.length > 12) return null
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'))
}

export function lineCents(line: FreeLine): number | null {
  const quantity = decimalUnits(line.quantity, 3), price = decimalUnits(line.price, 2)
  if (quantity === null || price === null || quantity <= 0n || quantity > 1_000_000_000n || price > 1_000_000_000n) return null
  const result = (quantity * price + 500n) / 1000n
  return result <= BigInt(MAX_TOTAL) ? Number(result) : null
}

export function validInvoiceDay(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw < '2000-01-01' || raw > '2099-12-31') return false
  const date = new Date(`${raw}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw
}

/** This first tool accepts Slovak accounts only, including their ISO 13616 checksum. It does not verify ownership. */
export function validSlovakIban(raw: string): boolean {
  const value = raw.replace(/\s/g, '').toUpperCase()
  if (!/^SK\d{22}$/.test(value)) return false
  const rearranged = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

const badText = (s: string, max: number) => s.trim() === '' || s.length > max || /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(s)
export function checkInvoice(invoice: FreeInvoice): InvoiceCheck {
  const errors: InvoiceCheck['errors'] = []
  const add = (field: string, message: string) => errors.push({ field, message })
  const printable = (field: string, value: string) => { if (!pdfCanPrint(value)) add(field, 'Tento export podporuje slovenské a české písmená a bežné symboly. Odstráňte nepodporované znaky, napríklad emoji, aby sa v PDF nestratili.') }
  for (const [key, party] of [['supplier', invoice.supplier], ['customer', invoice.customer]] as const) {
    const who = key === 'supplier' ? 'dodávateľa' : 'odberateľa'
    if (badText(party.name, 160)) add(`${key}.name`, `Doplňte obchodné meno ${who}, najviac 160 znakov.`)
    if (badText(party.address, 240)) add(`${key}.address`, `Doplňte úplnú slovenskú adresu ${who}, najviac 240 znakov.`)
    // Older registry identities can fail the usual check digit. This offline tool checks shape, never existence.
    if (!/^\d{8}$/.test(party.ico.replace(/\s/g, ''))) add(`${key}.ico`, `Skontrolujte osemmiestne IČO ${who}.`)
    if (party.dic && !/^\d{10}$/.test(party.dic)) add(`${key}.dic`, `DIČ ${who} má desať číslic.`)
    if ((key === 'supplier' && badText(party.registry, 240)) || party.registry.length > 240) add(`${key}.registry`, 'Doplňte register dodávateľa a číslo zápisu, najviac 240 znakov.')
    for (const field of ['name', 'address', 'registry'] as const) printable(`${key}.${field}`, party[field])
  }
  if (badText(invoice.number, 40) || !/\d/.test(invoice.number)) add('number', 'Doplňte vlastné číslo faktúry s číslicou, najviac 40 znakov.')
  printable('number', invoice.number)
  for (const field of ['issued', 'supplied', 'due'] as const) if (!validInvoiceDay(invoice[field])) add(field, 'Doplňte platný dátum.')
  if (validInvoiceDay(invoice.due) && validInvoiceDay(invoice.issued) && invoice.due < invoice.issued) add('due', 'Splatnosť nemôže byť pred vystavením.')
  if (invoice.iban && !validSlovakIban(invoice.iban)) add('iban', 'Skontrolujte slovenský IBAN vrátane kontrolných číslic, alebo ho nechajte prázdny.')
  if (invoice.vs && !/^\d{1,10}$/.test(invoice.vs)) add('vs', 'Variabilný symbol môže mať najviac desať číslic.')
  if (invoice.note.length > 1000 || (invoice.note && badText(invoice.note, 1000))) add('note', 'Poznámka môže mať najviac 1 000 bežných textových znakov.')
  printable('note', invoice.note)
  if (!invoice.nonVat) add('nonVat', 'Potvrďte, že dodávateľ nie je platiteľom DPH.')
  if (!invoice.domestic) add('domestic', 'Potvrďte bežné tuzemské dodanie medzi slovenskými podnikateľmi v EUR.')
  if (invoice.lines.length < 1 || invoice.lines.length > MAX_ITEMS) add('lines', `Faktúra môže mať 1 až ${MAX_ITEMS} položiek.`)
  const amounts = invoice.lines.map((line, i) => {
    if (badText(line.description, 240)) add(`lines.${i}.description`, `Položka ${i + 1}: doplňte popis, najviac 240 znakov.`)
    if (badText(line.unit, 12)) add(`lines.${i}.unit`, `Položka ${i + 1}: doplňte jednotku, najviac 12 znakov.`)
    printable(`lines.${i}.description`, line.description); printable(`lines.${i}.unit`, line.unit)
    const amount = lineCents(line)
    if (amount === null) add(`lines.${i}.price`, `Položka ${i + 1}: skontrolujte kladné množstvo (najviac 3 desatinné miesta) a nezápornú cenu (najviac 2). Hodnota položky je príliš vysoká alebo neplatná.`)
    return amount
  })
  const sum = amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0)
  const total = amounts.every((amount) => amount !== null) && sum > 0 && sum <= MAX_TOTAL ? sum : null
  if (total === null) add('lines', 'Celková suma musí byť kladná a najviac 999 999 999,99 EUR. Skontrolujte položky.')
  return { errors, amounts, total }
}

/** Import only our explicit, bounded data fields. Never merge arbitrary objects or accept tax modes from a file. */
export function importInvoice(raw: unknown): FreeInvoice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const root = raw as Record<string, unknown>
  if (root.format !== 'firmony-invoice' || root.version !== 1 || !root.invoice || typeof root.invoice !== 'object') return null
  const data = root.invoice as Record<string, unknown>
  const read = (o: Record<string, unknown>, key: string, max: number): string | null => typeof o[key] === 'string' && (o[key] as string).length <= max ? o[key] as string : null
  const party = (value: unknown): InvoiceParty | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const o = value as Record<string, unknown>
    const name = read(o, 'name', 160), address = read(o, 'address', 240), ico = read(o, 'ico', 20), dic = read(o, 'dic', 10), registry = read(o, 'registry', 240)
    return name !== null && address !== null && ico !== null && dic !== null && registry !== null ? { name, address, ico, dic, registry } : null
  }
  const supplier = party(data.supplier), customer = party(data.customer)
  if (!supplier || !customer || !Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > MAX_ITEMS) return null
  const lines: FreeLine[] = []
  for (const value of data.lines) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const o = value as Record<string, unknown>
    const description = read(o, 'description', 240), quantity = read(o, 'quantity', 20), unit = read(o, 'unit', 12), price = read(o, 'price', 20)
    if (description === null || quantity === null || unit === null || price === null) return null
    lines.push({ description, quantity, unit, price })
  }
  const out = blankInvoice('')
  for (const [key, max] of [['number', 40], ['issued', 10], ['supplied', 10], ['due', 10], ['iban', 34], ['vs', 10], ['note', 1000]] as const) {
    const value = read(data, key, max)
    if (value === null) return null
    out[key] = value
  }
  // A restored draft asks the person to confirm the scope again before any PDF can be made.
  return { ...out, supplier, customer, lines, nonVat: false, domestic: false }
}

export function invoiceFileName(number: string): string {
  return `faktura-${number.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'nova'}`
}
const dateText = (day: string) => day.split('-').reverse().join('. ')
/** The shared writer leaves an overlong word intact. Split such tokens here, within this tool's actual column. */
function fittedText(raw: string, width: number, size: number, bold = false): string {
  return raw.replace(/\s+/g, ' ').trim().split(' ').map((word) => {
    let out = '', part = ''
    for (const ch of word) {
      if (part && textWidth(part + ch, size, bold) > width) { out += `${part}\n`; part = '' }
      part += ch
    }
    return out + part
  }).join(' ')
}
export function invoicePdf(invoice: FreeInvoice): Uint8Array | null {
  const result = checkInvoice(invoice)
  if (result.errors.length || result.total === null) return null
  const blocks: PdfBlock[] = [{ kind: 'title', text: `Faktúra ${invoice.number}` }]
  for (const [label, party] of [['Dodávateľ', invoice.supplier], ['Odberateľ', invoice.customer]] as const) {
    blocks.push({ kind: 'heading', text: label }, { kind: 'text', text: party.name, bold: true }, { kind: 'text', text: party.address },
      { kind: 'text', text: `IČO: ${party.ico.replace(/\s/g, '')}${party.dic ? `    DIČ: ${party.dic}` : ''}` })
    if (party.registry) blocks.push({ kind: 'text', text: party.registry })
  }
  blocks.push({ kind: 'text', text: 'Dodávateľ nie je platiteľom DPH.' },
    { kind: 'text', text: `Vystavenie: ${dateText(invoice.issued)}    Dodanie: ${dateText(invoice.supplied)}    Splatnosť: ${dateText(invoice.due)}` },
    { kind: 'table', columns: [{ label: 'Popis', width: 245 }, { label: 'Množstvo', width: 60, align: 'right' }, { label: 'Cena / jedn.', width: 95, align: 'right' }, { label: 'Spolu', width: 95, align: 'right' }],
      rows: invoice.lines.map((line, i) => ({ cells: [line.description, `${line.quantity} ${line.unit}`, formatEurExact(Number(decimalUnits(line.price, 2))), formatEurExact(result.amounts[i]!) ] })) },
    { kind: 'heading', text: `Na úhradu: ${formatEurExact(result.total)}` })
  if (invoice.iban) blocks.push({ kind: 'text', text: `IBAN: ${invoice.iban.replace(/\s/g, '').toUpperCase()}` })
  if (invoice.vs) blocks.push({ kind: 'text', text: `Variabilný symbol: ${invoice.vs}` })
  if (invoice.note) blocks.push({ kind: 'text', text: invoice.note })
  // One long user paragraph or table token must not draw outside the page or another column.
  const fitted: PdfBlock[] = blocks.flatMap((block): PdfBlock[] => {
    if (block.kind === 'table') {
      const totalWidth = block.columns.reduce((sum, column) => sum + column.width, 0)
      return [{ ...block, rows: block.rows.map((row) => ({ ...row, cells: row.cells.map((cell, i) => fittedText(cell, 495.28 * block.columns[i]!.width / totalWidth - 6, 8.5, row.bold)) })) }]
    }
    const size = block.kind === 'title' ? 15 : block.kind === 'heading' ? 11 : 9.5
    const bold = block.kind !== 'text' || Boolean(block.bold)
    // Bound each text block to one input line; page layout can then move it safely to the next page.
    return block.text.split(/\r?\n/).filter((line) => line.trim()).map((line) => ({ ...block, text: fittedText(line, 495.28, size, bold) }))
  })
  return pdfOf({ title: `Faktúra ${invoice.number}`, header: { left: 'FAKTÚRA', right: invoice.number }, blocks: fitted })
}
