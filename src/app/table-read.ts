// A table read from a file another program wrote: an Excel workbook (.xlsx, its first sheet), a CSV or a text export
// (semicolons, tabs or commas; UTF-8 or the Windows-1250 that older Slovak programs write), or text pasted. And the
// pieces every import needs: the columns found by their headings in Slovak or Czech, amounts and days as the programs
// write them. Pohoda, Omega, Money and KROS each export their lists so; nothing here knows which wrote it.

export type TableFormat = 'xlsx' | 'csv'
export type Table = { rows: string[][]; format: TableFormat }
export type TableError = 'xls' | 'empty' | 'unreadable'

// ---------------------------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------------------------

/** Windows-1250 from 0x80 to 0xFF (the Encoding Standard's table; undefined bytes as U+FFFD). */
const CP1250 =
  '\u20AC\uFFFD\u201A\uFFFD\u201E\u2026\u2020\u2021\uFFFD\u2030\u0160\u2039\u015A\u0164\u017D\u0179\uFFFD\u2018\u2019\u201C\u201D\u2022\u2013\u2014\uFFFD\u2122\u0161\u203A\u015B\u0165\u017E\u017A\u00A0\u02C7\u02D8\u0141\u00A4\u0104\u00A6\u00A7\u00A8\u00A9\u015E\u00AB\u00AC\u00AD\u00AE\u017B\u00B0\u00B1\u02DB\u0142\u00B4\u00B5\u00B6\u00B7\u00B8\u0105\u015F\u00BB\u013D\u02DD\u013E\u017C\u0154\u00C1\u00C2\u0102\u00C4\u0139\u0106\u00C7\u010C\u00C9\u0118\u00CB\u011A\u00CD\u00CE\u010E\u0110\u0143\u0147\u00D3\u00D4\u0150\u00D6\u00D7\u0158\u016E\u00DA\u0170\u00DC\u00DD\u0162\u00DF\u0155\u00E1\u00E2\u0103\u00E4\u013A\u0107\u00E7\u010D\u00E9\u0119\u00EB\u011B\u00ED\u00EE\u010F\u0111\u0144\u0148\u00F3\u00F4\u0151\u00F6\u00F7\u0159\u016F\u00FA\u0171\u00FC\u00FD\u0163\u02D9'

/** Bytes as text: UTF-16 by its mark (Excel's "Unicode text"), UTF-8 (with or without its mark) when they are, else Windows-1250. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body)
  } catch {
    let out = ''
    for (const b of body) out += b < 0x80 ? String.fromCharCode(b) : CP1250[b - 0x80]
    return out
  }
}

/** Rows of a CSV or a text export: the delimiter the first lines use most (semicolon, tab, comma), quotes as CSV has them. */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').slice(0, 20)
  const count = (d: string) => lines.reduce((n, l) => n + l.split(d).length - 1, 0)
  const delimiter = [';', '\t', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ';')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

// ---------------------------------------------------------------------------------------------------------------
// Excel workbooks
// ---------------------------------------------------------------------------------------------------------------

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8)
const u32 = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0

/** The files of a ZIP by name (stored or deflated), read from its central directory. */
export async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('No ZIP directory')
  const entries = u16(bytes, end + 10)
  let at = u32(bytes, end + 16)
  const out = new Map<string, Uint8Array>()
  for (let n = 0; n < entries; n++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('Broken ZIP directory')
    const method = u16(bytes, at + 10)
    const size = u32(bytes, at + 20)
    const nameLength = u16(bytes, at + 28)
    const extra = u16(bytes, at + 30)
    const comment = u16(bytes, at + 32)
    const local = u32(bytes, at + 42)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extra + comment
    if (!wanted(name)) continue
    if (u32(bytes, local) !== 0x04034b50) throw new Error('Broken ZIP entry')
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    const data = bytes.subarray(start, start + size)
    if (method === 0) out.set(name, data)
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()))
    else throw new Error(`ZIP method ${method}`)
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? ''),
  )
const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unescape(m[1] ?? '')).join('')

/** A column's index from a cell reference: A1 is 0, AB7 is 27. */
const columnOf = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

/** The first sheet of an Excel workbook as rows of text (numbers as Excel keeps them, a date as its serial number). */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n))
  const text = (name: string) => (files.has(name) ? new TextDecoder().decode(files.get(name)) : '')
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1] ?? ''))
  const firstId = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(text('xl/workbook.xml'))?.[1]
  const target = firstId
    ? (new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`).exec(text('xl/_rels/workbook.xml.rels'))?.[1] ??
      new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstId}"`).exec(text('xl/_rels/workbook.xml.rels'))?.[1])
    : undefined
  const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()[0]
  const sheet = path ? text(path) : ''
  const rows: string[][] = []
  for (const r of sheet.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row: string[] = []
    let next = 0
    for (const c of (r[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const index = ref ? columnOf(ref) : next
      next = index + 1
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const body = c[2] ?? ''
      const v = unescape(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1] ?? '')
      const value = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? texts(body) : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v
      while (row.length < index) row.push('')
      row[index] = value.trim()
    }
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

/** A file as a table: an Excel workbook, else text (an old .xls is said, it needs saving as .xlsx or CSV). */
export async function readTable(bytes: Uint8Array): Promise<Table | { error: TableError }> {
  if (bytes.length === 0) return { error: 'empty' }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return { error: 'xls' }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    try {
      const rows = await readXlsx(bytes)
      return rows.length ? { rows, format: 'xlsx' } : { error: 'empty' }
    } catch {
      return { error: 'unreadable' }
    }
  }
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)
  if (!utf16 && bytes.subarray(0, 4096).includes(0)) return { error: 'unreadable' }
  const rows = parseDelimited(decodeText(bytes))
  return rows.length ? { rows, format: 'csv' } : { error: 'empty' }
}

// ---------------------------------------------------------------------------------------------------------------
// Columns, amounts, days
// ---------------------------------------------------------------------------------------------------------------

/** A heading as it is compared: small letters, no accents, single spaces, no punctuation. */
export const plainHeading = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

/**
 * The columns of a table found by their headings: each key's first column whose heading is one of its names (or begins
 * with one followed by a space), looked for in the first 15 rows; the row with all the required keys and the most others
 * is the heading row. Null when no row has the required ones.
 */
export function findColumns<K extends string>(
  rows: readonly string[][],
  names: Record<K, readonly string[]>,
  required: readonly NoInfer<K>[],
): { header: number; cols: Partial<Record<K, number>> } | null {
  let best: { header: number; cols: Partial<Record<K, number>>; score: number } | null = null
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const headings = (rows[r] ?? []).map(plainHeading)
    const cols: Partial<Record<K, number>> = {}
    const taken = new Set<number>()
    for (const key of Object.keys(names) as K[]) {
      const wanted = names[key].map(plainHeading)
      // An exact heading first, then one that begins with a name: "ks md" before "ks".
      let index = headings.findIndex((h, i) => !taken.has(i) && wanted.includes(h))
      if (index < 0) index = headings.findIndex((h, i) => !taken.has(i) && wanted.some((w) => h.startsWith(`${w} `)))
      if (index >= 0) {
        cols[key] = index
        taken.add(index)
      }
    }
    if (!required.every((k) => cols[k] !== undefined)) continue
    const score = Object.keys(cols).length
    if (!best || score > best.score) best = { header: r, cols, score }
  }
  return best ? { header: best.header, cols: best.cols } : null
}

/** "1 234,56", "1234.56", "-1.234,56", "(12,40)", "12,40 €" or "1 234,56 D" in cents; null when empty, NaN when it is no amount. */
export function amountOf(text: string): number | null {
  let s = text.replace(/[\s  ]|€|eur/gi, '')
  if (s === '' || s === '-') return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    negative = true
    s = s.slice(0, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  const decimal = comma > dot ? ',' : dot > comma ? '.' : null
  const plain =
    decimal === null
      ? s
      : s
          .split(decimal === ',' ? '.' : ',')
          .join('')
          .replace(decimal, '.')
  if (!/^\d+(\.\d+)?$/.test(plain)) return Number.NaN
  const cents = Math.round(Number(plain) * 100)
  return negative ? -cents : cents
}

/** "31.12.2026", "31. 12. 2026", "2026-12-31", "31/12/2026" or an Excel day number as YYYY-MM-DD; null when empty or no day. */
export function dayOf(text: string): string | null {
  const s = text.trim()
  if (s === '') return null
  let y: number, m: number, d: number
  let match = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})(?:\s.*)?$/.exec(s)
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    // An Excel day number: days from 30 December 1899.
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000).toISOString().slice(0, 10)
  } else return null
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
}
