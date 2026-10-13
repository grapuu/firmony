// What kind of file a client sent, and what is written on a photographed or scanned document. The reading is
// Claude's (Anthropic's API, READER in config.ts); an e-invoice is read by our own code (xml.ts). Without the key,
// or when the reader cannot say, the document goes to the accountant, and the client is told only that.
import { READER } from '../config'
import { CATEGORIES, CATEGORY_IDS, isCategory } from './booking'
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
      typ: { type: 'string', enum: ['blocek', 'faktura_prijata', 'faktura_vydana', 'iny'], description: 'faktura_vydana: našu firmu na nej uvádza ako dodávateľa.' },
      druha_strana: { type: 'string', description: 'Názov druhej strany: obchodu alebo dodávateľa, pri faktúre vydanej odberateľa.' },
      ico_druhej_strany: { type: 'string' },
      iban_druhej_strany: { type: 'string', description: 'IBAN, na ktorý sa má platiť (pri faktúre prijatej).' },
      cislo_dokladu: { type: 'string' },
      variabilny_symbol: { type: 'string' },
      datum_vystavenia: { type: 'string', description: 'RRRR-MM-DD' },
      datum_splatnosti: { type: 'string', description: 'RRRR-MM-DD' },
      suma_celkom: { type: 'string', description: 'Celková suma na úhradu s DPH, s desatinnou bodkou, napríklad 12.40.' },
      dph_celkom: { type: 'string', description: 'Celková DPH, s desatinnou bodkou.' },
      mena: { type: 'string', description: 'Kód meny, napríklad EUR.' },
      kategoria: {
        type: 'string',
        enum: CATEGORY_IDS,
        description: `Na čo výdavok bol, alebo pri faktúre vydanej za čo: ${CATEGORY_IDS.map((id) => `${id} (${CATEGORIES[id].hint})`).join('; ')}.`,
      },
    },
    required: ['je_doklad'],
  },
} as const

const KINDS: Record<string, DocKind> = { blocek: 'receipt', faktura_prijata: 'invoice_in', faktura_vydana: 'invoice_out', iny: 'other' }

const clean = (value: unknown, max = 160): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null)
const isoDay = (value: unknown): string | null => {
  const text = clean(value, 20)
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : null
}

/** What the reader wrote, checked field by field: anything that is not what it should be is left out. */
export function readingFrom(input: Record<string, unknown>): Reading | null {
  if (input.je_doklad !== true) return null
  const total = toCents(clean(input.suma_celkom, 20))
  const vat = toCents(clean(input.dph_celkom, 20))
  const ico = clean(input.ico_druhej_strany, 20)?.replace(/\s/g, '') ?? null
  const iban = clean(input.iban_druhej_strany, 40)?.replace(/\s/g, '').toUpperCase() ?? null
  const currency = clean(input.mena, 10)?.toUpperCase() ?? null
  return {
    kind: KINDS[String(input.typ)] ?? 'other',
    party: clean(input.druha_strana),
    partyIco: ico && /^\d{6,8}$/.test(ico) ? ico.padStart(8, '0') : null,
    partyIban: iban && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban) ? iban : null,
    number: clean(input.cislo_dokladu, 40),
    vs: clean(input.variabilny_symbol, 20)?.replace(/\D/g, '') || null,
    issuedOn: isoDay(input.datum_vystavenia),
    dueOn: isoDay(input.datum_splatnosti),
    totalCents: total !== null && total > 0 ? total : null,
    vatCents: vat !== null && vat >= 0 ? vat : null,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    category: isCategory(input.kategoria) ? input.kategoria : null,
  }
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
    'Sumy píš presne tak, ako sú na doklade. Nič nedomýšľaj: čo na doklade nie je, nechaj prázdne.',
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
  const used = body?.content?.find((part) => part.type === 'tool_use' && part.name === TOOL.name)
  if (!used?.input) return { manual: 'not an answer' }
  const reading = readingFrom(used.input)
  return reading ? { reading, by: READER.model } : { manual: 'not a document' }
}
