// What kind of file a client sent, and what is written on a photographed or scanned document. The reading is
// Claude's (Anthropic's API, READER in config.ts); an e-invoice is read by our own code (xml.ts). Without the key,
// or when the reader cannot say, the document goes to the accountant, and the client is told only that.
import { READER } from '../config'
import { CATEGORIES, CATEGORY_IDS, dayOfText, isCategory } from './booking'
import { ekasaOkp, ekasaUid } from './ekasa'
import { toCents, type Reading } from './xml'
import type { DocKind } from './match'

export type FileKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf' | 'xml'

export const FILE_TYPES: Record<FileKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  xml: 'application/xml',
}

/** A SHA-256 of a file's bytes, as hex: the same file sent twice is one document. */
export async function fileHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** What kind of file it is, by its first bytes and never by its name: a photo, a PDF or XML. Null for anything else. */
export function sniff(bytes: Uint8Array): FileKind | null {
  const b = (i: number) => bytes[i] ?? -1
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg'
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png'
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'webp'
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64))
  if (head.startsWith('%PDF-')) return 'pdf'
  if (/^....ftyp(heic|heix|hevc|mif1|msf1|heim|heis)/s.test(head)) return 'heic'
  if (/^(﻿|ï»¿)?\s*<(\?xml|[A-Za-z:]*(Invoice|CreditNote|Document)\b)/.test(head)) return 'xml'
  return null
}

/** The tool the reader fills in: Slovak names, so that it reads a Slovak document in its own words. */
const TOOL = {
  name: 'zapis_doklad',
  description: 'Zapíše údaje prečítané z dokladu. Čo na doklade nie je alebo sa nedá prečítať, nechaj prázdne.',
  input_schema: {
    type: 'object',
    properties: {
      je_doklad: { type: 'boolean', description: 'Či je na obrázku účtovný doklad (bloček, pokladničný doklad, faktúra, dobropis).' },
      typ: {
        type: 'string',
        enum: ['blocek', 'faktura_prijata', 'faktura_vydana', 'iny'],
        description: 'faktura_prijata: naša firma je na nej odberateľ (kupujúci, Customer, Bill to); faktura_vydana: naša firma je na nej dodávateľ (predávajúci, Supplier).',
      },
      dodavatel: { type: 'string', description: 'Pri faktúre a dobropise: názov dodávateľa (predávajúceho, Supplier, Seller), presne ako je na doklade.' },
      ico_dodavatela: { type: 'string', description: 'IČO dodávateľa, ak ho doklad uvádza.' },
      ic_dph_dodavatela: { type: 'string', description: 'IČ DPH dodávateľa (VAT ID), ak ho doklad uvádza.' },
      odberatel: { type: 'string', description: 'Pri faktúre a dobropise: názov odberateľa (kupujúceho, Customer, Bill to), presne ako je na doklade.' },
      ico_odberatela: { type: 'string', description: 'IČO odberateľa, ak ho doklad uvádza.' },
      ic_dph_odberatela: { type: 'string', description: 'IČ DPH odberateľa (VAT ID), ak ho doklad uvádza.' },
      druha_strana: { type: 'string', description: 'Názov druhej strany, nikdy nie naša firma: obchodu alebo dodávateľa, pri faktúre vydanej odberateľa.' },
      ico_druhej_strany: { type: 'string', description: 'IČO druhej strany, nikdy nie IČO našej firmy.' },
      iban_druhej_strany: { type: 'string', description: 'IBAN, na ktorý sa má platiť (pri faktúre prijatej).' },
      cislo_dokladu: { type: 'string' },
      variabilny_symbol: { type: 'string' },
      datum_vystavenia: { type: 'string', description: 'RRRR-MM-DD' },
      datum_splatnosti: { type: 'string', description: 'RRRR-MM-DD' },
      suma_celkom: { type: 'string', description: 'Celková suma na úhradu s DPH, s desatinnou bodkou, napríklad 12.40. Pri dobropise bez mínusu.' },
      dph_celkom: {
        type: 'string',
        description:
          'Celková DPH zo súhrnu dokladu (rekapitulácia DPH, „DPH celkom“, „VAT“ pri súčte), s desatinnou bodkou. Pri dobropise bez mínusu. Pri prenesení daňovej povinnosti (reverse charge) a keď dodávateľ nie je platiteľ DPH je 0.',
      },
      mena: { type: 'string', description: 'Kód meny, napríklad EUR.' },
      kategoria: {
        type: 'string',
        enum: CATEGORY_IDS,
        description: `Na čo výdavok bol, alebo pri faktúre vydanej za čo: ${CATEGORY_IDS.map((id) => `${id} (${CATEGORIES[id].hint})`).join('; ')}.`,
      },
      ic_dph_druhej_strany: { type: 'string', description: 'IČ DPH druhej strany, ak je na doklade: dve písmená štátu a číslo, napríklad SK2020000000 alebo IE6388047V.' },
      datum_dodania: { type: 'string', description: 'Dátum dodania tovaru alebo služby, ak je na doklade uvedený osobitne. RRRR-MM-DD' },
      sidlo_v_zahranici: { type: 'boolean', description: 'Či druhá strana sídli mimo Slovenska.' },
      opravuje_fakturu: { type: 'string', description: 'Ak je to dobropis alebo opravná faktúra: číslo faktúry, ktorú opravuje.' },
      ekasa_uid: {
        type: 'string',
        description: 'Pri bločku z eKasy: unikátny identifikátor dokladu (UID), písmeno, pomlčka a 32 znakov 0 až 9 a A až F, napríklad O-7DBCDA8A56EE426DBCDA8A56EE426D1A. Prepíš ho znak po znaku; off-line doklad ho nemá.',
      },
      ekasa_okp: {
        type: 'string',
        description: 'Pri bločku z eKasy: overovací kód (OKP), päť skupín po 8 znakov 0 až 9 a A až F oddelených pomlčkou. Prepíš ho znak po znaku.',
      },
      dph_podla_sadzieb: {
        type: 'array',
        description:
          'Základ dane a DPH pre každú sadzbu, ako sú rozpísané v súhrne dokladu. Pri dobropise so znamienkom mínus. Pri prenesení daňovej povinnosti (reverse charge) sadzba 0 a DPH 0, aj keď riadok uvádza inú sadzbu.',
        items: {
          type: 'object',
          properties: {
            sadzba: { type: 'number', description: 'Sadzba v percentách: 23, 19, 5 alebo 0.' },
            zaklad: { type: 'string', description: 'Základ dane s desatinnou bodkou.' },
            dph: { type: 'string', description: 'DPH s desatinnou bodkou.' },
          },
          required: ['sadzba', 'zaklad', 'dph'],
        },
      },
    },
    required: ['je_doklad'],
  },
} as const

const KINDS: Record<string, DocKind> = { blocek: 'receipt', faktura_prijata: 'invoice_in', faktura_vydana: 'invoice_out', iny: 'other' }

const clean = (value: unknown, max = 160): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null)
const isoDay = (value: unknown): string | null => {
  const text = clean(value, 20)
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? dayOfText(text) || null : null
}

const icoOf = (value: unknown): string | null => {
  const ico = clean(value, 20)?.replace(/\s/g, '') ?? null
  return ico && /^\d{6,8}$/.test(ico) ? ico.padStart(8, '0') : null
}
const vatIdOf = (value: unknown): string | null => {
  const vatId = clean(value, 20)?.replace(/[\s.-]/g, '').toUpperCase() ?? null
  return vatId && /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatId) ? vatId : null
}
/** A name without case, accents, spaces or punctuation: "TEST Odberateľ s. r. o." and "Test Odberatel, s.r.o." are one. */
const nameKey = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

interface Side {
  name: string | null
  ico: string | null
  vatId: string | null
}

/** Whether a side of a document is the company it was read for: by its IČO, its VAT number's digits, else its name. */
function isOurs(side: Side, company: { name: string; ico: string | null }): boolean {
  const ico = company.ico ? company.ico.padStart(8, '0') : null
  if (ico && side.ico) return side.ico === ico
  if (side.name) return nameKey(side.name) !== '' && nameKey(side.name) === nameKey(company.name)
  return false
}

/** What the reader wrote, checked field by field: anything that is not what it should be is left out. */
export function readingFrom(input: Record<string, unknown>, company?: { name: string; ico: string | null }): Reading | null {
  if (input.je_doklad !== true) return null
  const total = toCents(clean(input.suma_celkom, 20))
  const vat = toCents(clean(input.dph_celkom, 20))
  const ico = clean(input.ico_druhej_strany, 20)?.replace(/\s/g, '') ?? null
  const iban = clean(input.iban_druhej_strany, 40)?.replace(/\s/g, '').toUpperCase() ?? null
  const currency = clean(input.mena, 10)?.toUpperCase() ?? null
  const vatId = clean(input.ic_dph_druhej_strany, 20)?.replace(/[\s.-]/g, '').toUpperCase() ?? null
  // A credit note keeps its amounts without a minus (the booking form takes them so, and its lines carry the sign); a
  // reader that wrote them with one for a document that corrects an invoice is taken at their size. Anything else
  // negative is no amount.
  const credit = clean(input.opravuje_fakturu, 40) !== null
  const sized = (cents: number | null, zero: boolean) => (cents === null ? null : cents > 0 || (zero && cents === 0) ? cents : credit && cents < 0 ? -cents : null)
  const reading: Reading = {
    kind: typeof input.typ === 'string' && Object.hasOwn(KINDS, input.typ) ? KINDS[input.typ] ?? 'other' : 'other',
    party: clean(input.druha_strana),
    partyIco: ico && /^\d{6,8}$/.test(ico) ? ico.padStart(8, '0') : null,
    partyIban: iban && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban) ? iban : null,
    number: clean(input.cislo_dokladu, 40),
    vs: clean(input.variabilny_symbol, 20)?.replace(/\D/g, '') || null,
    issuedOn: isoDay(input.datum_vystavenia),
    dueOn: isoDay(input.datum_splatnosti),
    totalCents: sized(total, false),
    vatCents: sized(vat, true),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    category: isCategory(input.kategoria) ? input.kategoria : null,
    partyVatId: vatId && /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatId) ? vatId : null,
    suppliedOn: isoDay(input.datum_dodania),
    foreign: typeof input.sidlo_v_zahranici === 'boolean' ? input.sidlo_v_zahranici : null,
    corrects: clean(input.opravuje_fakturu, 40),
    vatLines: ratesOf(input.dph_podla_sadzieb),
    ekasaUid: ekasaUid(input.ekasa_uid),
    ekasaOkp: ekasaOkp(input.ekasa_okp),
  }
  return company ? withSides(reading, input, company) : reading
}

/**
 * Which way an invoice goes is decided by its two sides, not by the reader's word for it (on 20 October 2026 the real
 * reader took two received invoices for issued ones, once naming our own company as the supplier): the side that is
 * our company says whether it was issued or received, and the other side is the party. A party that is our company is
 * never kept.
 */
function withSides(reading: Reading, input: Record<string, unknown>, company: { name: string; ico: string | null }): Reading {
  const side = (name: unknown, ico: unknown, vatId: unknown): Side => ({ name: clean(name), ico: icoOf(ico), vatId: vatIdOf(vatId) })
  const supplier = side(input.dodavatel, input.ico_dodavatela, input.ic_dph_dodavatela)
  const customer = side(input.odberatel, input.ico_odberatela, input.ic_dph_odberatela)
  const invoice = reading.kind === 'invoice_in' || reading.kind === 'invoice_out'
  let out = reading
  if (invoice && (supplier.name || supplier.ico) && (customer.name || customer.ico)) {
    const ourSupplier = isOurs(supplier, company)
    const ourCustomer = isOurs(customer, company)
    const take = (kind: DocKind, other: Side): Reading => ({
      ...reading,
      kind,
      party: other.name ?? reading.party,
      partyIco: other.ico ?? (other.name ? null : reading.partyIco),
      partyVatId: other.vatId ?? (other.name ? null : reading.partyVatId),
      // The account printed on an invoice we issued is our own.
      partyIban: kind === 'invoice_out' ? null : reading.partyIban,
    })
    if (ourSupplier && !ourCustomer) out = take('invoice_out', customer)
    else if (ourCustomer && !ourSupplier) out = take('invoice_in', supplier)
  }
  if (isOurs({ name: out.party, ico: out.partyIco, vatId: null }, company)) out = { ...out, party: null, partyIco: null, partyVatId: null }
  return out
}

/** The reader's lines by rate, each checked: a rate of the Slovak ones and amounts that are amounts; null when none holds. */
function ratesOf(value: unknown): { rate: number; base: number; vat: number }[] | null {
  if (!Array.isArray(value)) return null
  const lines = value
    .map((line) => (line && typeof line === 'object' ? (line as Record<string, unknown>) : {}))
    .map((line) => ({ rate: Number(line.sadzba), base: toCents(clean(line.zaklad, 20)), vat: toCents(clean(line.dph, 20)) }))
    .filter((line): line is { rate: number; base: number; vat: number } => [23, 19, 5, 0].includes(line.rate) && line.base !== null && line.vat !== null)
  return lines.length > 0 && lines.length <= 4 ? lines : null
}

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

export type ReadResult = { reading: Reading; by: string } | { manual: string }

/**
 * Has Claude read a photo or a PDF. The answer says what was read, or why a person reads it instead: no key, a
 * file the reader does not take, no answer in time, or a picture that is no document.
 */
export async function readDocument(key: string | undefined, file: { kind: FileKind; bytes: Uint8Array }, company: { name: string; ico: string | null }): Promise<ReadResult> {
  if (!key) return { manual: 'no reader' }
  if (file.kind === 'heic' || file.kind === 'xml') return { manual: `not for the reader (${file.kind})` }
  if (file.kind === 'pdf' ? file.bytes.length > READER.pdfBytes : file.bytes.length > READER.imageBytes) return { manual: 'too large for the reader' }
  const source = { type: 'base64', media_type: FILE_TYPES[file.kind], data: base64(file.bytes) }
  const block = file.kind === 'pdf' ? { type: 'document', source } : { type: 'image', source }
  const prompt = [
    `Si účtovník na Slovensku. Prečítaj tento doklad firmy ${company.name}${company.ico ? ` (IČO ${company.ico})` : ''} a zapíš ho nástrojom ${TOOL.name}.`,
    'Pri faktúre a dobropise zapíš obe strany, dodávateľa aj odberateľa. Ak je naša firma odberateľ, je to faktúra prijatá a druhá strana je dodávateľ; ak je naša firma dodávateľ, je to faktúra vydaná a druhá strana je odberateľ.',
    'Sumy píš presne tak, ako sú na doklade; celkovú sumu a DPH ber zo súhrnu dokladu. Nič nedomýšľaj: čo na doklade nie je, nechaj prázdne.',
  ].join(' ')
  let answer: Response
  try {
    answer = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: READER.model,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
      }),
      signal: AbortSignal.timeout(READER.timeoutMs),
    })
  } catch (err) {
    return { manual: err instanceof Error ? err.name : 'no answer' }
  }
  if (!answer.ok) return { manual: `status ${answer.status}` }
  const body = (await answer.json().catch(() => null)) as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] } | null
  const used = Array.isArray(body?.content) ? body.content.find((part) => part?.type === 'tool_use' && part.name === TOOL.name) : null
  if (!used?.input || typeof used.input !== 'object' || Array.isArray(used.input)) return { manual: 'not an answer' }
  const reading = readingFrom(used.input, company)
  return reading ? { reading, by: READER.model } : { manual: 'not a document' }
}
