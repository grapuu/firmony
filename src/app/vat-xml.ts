// The files the Financial Administration takes: the VAT return (DPHv25, the schema dph2025.xsd) and the control
// statement (KVDPHv25, kv_dph_2025.xsd), written the way the official eForms write them, so that "Načítať zo
// súboru" in eDane or in the personal internet zone opens them as they are. test/xsd holds both schemas, and the
// unit checks validate every file written here against them.
//
// The return's elements are all present, empty when the row is not filled (the eForm writes it so); amounts have
// two decimals and a full stop; a quarter is I to IV, a month 1 to 12; the declaration's date is DD.MM.YYYY. The
// control statement is in its schema's namespace, dates are YYYY-MM-DD, and an attribute is left out rather than
// written empty.
import { BRAND, OPERATOR } from '../config'
import { ROWS, isQuarter, kvFileOf, type FilingKind, type Kv, type KvFile, type Rows, type VatStatus } from './vat'

/** The tax offices a return can be addressed to, as the eForm lists them. */
export const TAX_OFFICES = ['Bratislava', 'Trnava', 'Trenčín', 'Nitra', 'Žilina', 'Banská Bystrica', 'Prešov', 'Košice', 'Úrad pre vybrané hospodárske subjekty'] as const
export type TaxOffice = (typeof TAX_OFFICES)[number]

export const isTaxOffice = (value: unknown): value is TaxOffice => typeof value === 'string' && (TAX_OFFICES as readonly string[]).includes(value)

export interface Filer {
  name: string
  /** SK and ten digits. */
  icdph: string
  address: string | null
  taxOffice: TaxOffice
  status: Exclude<VatStatus, 'none'>
}

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Cents as the forms take an amount: two decimals and a full stop, a minus in front when it is negative. */
export function amount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const plain = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(plain / 100)}.${String(plain % 100).padStart(2, '0')}`
}

/** "K lesu 2218/39A, 040 18 Košice" in its parts; a village without streets is "Obec 12, 811 01". */
export function addressParts(address: string | null): { street: string; number: string; postal: string; city: string } {
  const parts = (address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : ''
  const postalCity = /^(\d{3})\s?(\d{2})(?:\s+(.+))?$/.exec(last)
  const first = (postalCity ? parts.slice(0, -1) : parts).join(', ')
  const streetNumber = /^(.*?)\s+(\d[\w/-]*)$/u.exec(first)
  const street = streetNumber ? (streetNumber[1] ?? '') : first
  const number = streetNumber ? (streetNumber[2] ?? '') : ''
  const city = postalCity?.[3]?.trim() ?? ''
  return {
    street: city ? street : '',
    number,
    postal: postalCity ? `${postalCity[1]}${postalCity[2]}` : '',
    city: city || street,
  }
}

/** A name in lines of the form's width, at spaces: one line for nearly every company. */
export function nameLines(name: string, width = 100, max = 3): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of name.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines.slice(0, max)
}

const ROMAN = ['I', 'II', 'III', 'IV']
const textDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
const cut = (text: string, max: number) => text.slice(0, max)

/**
 * The return of a period. `declaredOn` is the day the accountant makes it (the form's "dátum vyhlásenia");
 * the representative who files it under the power of attorney is europio. A corrective return (O) is the whole
 * return again; a supplementary one (D) is too, with the day the reason for it was found and rows 36 and 37 (vat.ts,
 * `settle`). `fastRefund` marks that the payer meets the conditions of § 79(2) for an excess deduction.
 */
export function returnXml(filer: Filer, period: string, rows: Rows, opts: { declaredOn: string; nothing: boolean; fastRefund?: boolean; kind?: FilingKind; foundOn?: string | null }): string {
  const kind = opts.kind ?? 'R'
  const a = addressParts(filer.address)
  const quarter = isQuarter(period) ? (ROMAN[Number(period.slice(6)) - 1] ?? '') : ''
  const month = isQuarter(period) ? '' : String(Number(period.slice(5, 7)))
  const flag = (on: boolean) => (on ? '1' : '0')
  const el = (name: string, value: string) => `<${name}>${esc(value)}</${name}>`
  const row = (name: (typeof ROWS)[number]) => el(name, rows[name] === 0 ? '' : amount(rows[name]))
  const telo = ROWS.flatMap((name) => (name === 'r33' ? [el('splneniePodmienok', flag(Boolean(opts.fastRefund) && rows.r33 > 0)), row(name)] : [row(name)]))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<dokument>',
    '<hlavicka>',
    `<identifikacneCislo>${el('kodStatu', 'SK')}${el('cislo', filer.icdph.replace(/^SK/, ''))}</identifikacneCislo>`,
    el('dic', ''),
    el('danovyUrad', filer.taxOffice),
    el('nevzniklaPov', flag(opts.nothing && filer.status === 'payer')),
    `<typDP>${el('rdp', flag(kind === 'R'))}${el('odp', flag(kind === 'O'))}${el('ddp', flag(kind === 'D'))}${el('datumZisteniaDdp', kind === 'D' && opts.foundOn ? textDay(opts.foundOn) : '')}</typDP>`,
    `<osoba>${el('platitel', flag(filer.status === 'payer'))}${el('registrovana', flag(filer.status === 'reg7a'))}${el('inaPovinna', '0')}${el('zdanitelna', '0')}${el('zastupca', '0')}${el('zastupca69aa', '0')}</osoba>`,
    `<zdanObd>${el('mesiac', month)}${el('stvrtrok', quarter)}${el('rok', period.slice(0, 4))}</zdanObd>`,
    `<meno>${nameLines(filer.name)
      .map((line) => el('riadok', line))
      .join('')}</meno>`,
    `<adresa>${el('ulica', cut(a.street, 28))}${el('cislo', cut(a.number, 14))}${el('psc', a.postal)}${el('obec', cut(a.city, 40))}${el('telefon', '')}${el('email', '')}</adresa>`,
    `<opravnenaOsoba>${el('menoPriezvisko', OPERATOR.name)}${el('telefon', OPERATOR.phone)}${el('email', BRAND.email)}</opravnenaOsoba>`,
    el('datumVyhlasenia', textDay(opts.declaredOn)),
    '</hlavicka>',
    '<telo>',
    ...telo,
    '</telo>',
    '</dokument>',
    '',
  ].join('\n')
}

const attrs = (pairs: [string, string | number | null | undefined][]): string =>
  pairs
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => ` ${name}="${esc(String(value))}"`)
    .join('')

/**
 * The control statement of a period: a regular one (R), a corrective one that replaces it before the deadline (O),
 * or a supplementary one (D), whose lines carry their correction codes (KOpr; vat.ts, `kvDiff`).
 */
export function statementXml(filer: Filer, period: string, statement: Kv | KvFile, kind: FilingKind = 'R'): string {
  const kv: KvFile = Array.isArray(statement.b31) ? (statement as KvFile) : kvFileOf(statement as Kv)
  const a = addressParts(filer.address)
  const money = (cents: number) => amount(cents)
  const code = (k: number | undefined): [string, number | null] => ['KOpr', kind === 'D' && k ? k : null]
  const lines = [
    ...kv.a1.map((r) => `<A1${attrs([['Odb', r.odb], ['F', r.f], ['Den', r.den], ['Z', money(r.z)], ['D', money(r.d)], ['S', r.s], code(r.k)])}/>`),
    ...kv.b1.map((r) => `<B1${attrs([['Dod', r.dod], ['F', r.f], ['Den', r.den], ['Z', money(r.z)], ['D', money(r.d)], ['S', r.s], ['O', money(r.o)], code(r.k)])}/>`),
    ...kv.b2.map((r) => `<B2${attrs([['Dod', r.dod], ['F', r.f], ['Den', r.den], ['Z', money(r.z)], ['D', money(r.d)], ['S', r.s], ['O', money(r.o)], code(r.k)])}/>`),
    ...kv.b31.map((r) => `<B31${attrs([['Z', money(r.z)], ['D', money(r.d)], ['O', money(r.o)], code(r.k)])}/>`),
    ...kv.b32.map((r) => `<B32${attrs([['Dod', r.dod], ['Z', money(r.z)], ['D', money(r.d)], ['O', money(r.o)], code(r.k)])}/>`),
    ...kv.c1.map((r) => `<C1${attrs([['Odb', r.odb], ['FO', r.fo], ['FP', r.fp], ['ZR', money(r.zr)], ['DR', money(r.dr)], ['S', r.s], code(r.k)])}/>`),
    ...kv.c2.map((r) => `<C2${attrs([['Dod', r.dod], ['FO', r.fo], ['FP', r.fp], ['ZR', money(r.zr)], ['DR', money(r.dr)], ['S', r.s], ['OR', money(r.or)], code(r.k)])}/>`),
    ...kv.d2.map((r) => `<D2${attrs([['Z', money(r.z)], ['D', money(r.d)], ['ZZn', money(r.zzn)], ['DZn', money(r.dzn)], code(r.k)])}/>`),
  ]
  const el = (name: string, value: string) => `<${name}>${esc(value)}</${name}>`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<KVDPH_2025 xmlns="https://ekr.financnasprava.sk/Formulare/XSD/kv_dph_2025.xsd">',
    '<Identifikacia>',
    el('IcDphPlatitela', filer.icdph),
    el('Druh', kind),
    `<Obdobie>${el('Rok', period.slice(0, 4))}${isQuarter(period) ? el('Stvrtrok', period.slice(6)) : el('Mesiac', String(Number(period.slice(5, 7))))}</Obdobie>`,
    el('Nazov', filer.name.replace(/\s+/g, ' ').trim()),
    el('Stat', OPERATOR.country),
    el('Obec', a.city),
    ...(a.postal ? [el('PSC', a.postal)] : []),
    ...(a.street ? [el('Ulica', a.street)] : []),
    ...(a.number ? [el('Cislo', a.number)] : []),
    el('Email', BRAND.email),
    '</Identifikacia>',
    '<Transakcie>',
    ...lines,
    '</Transakcie>',
    '</KVDPH_2025>',
    '',
  ].join('\n')
}
