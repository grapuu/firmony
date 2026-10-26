// The invoice as a PDF (26 October 2026): what the customer gets in place of an email from us. The owner's word of that
// day: Firmony sends no invoice by email any more; the client downloads the PDF, shares it from the phone or writes
// the email himself. So the file has to be the best invoice a Slovak company can send, at the level of Stripe's and
// Pennylane's.
//
// The rule, said plainly:
// - The content is the sheet's (invoice-sheet.ts): the same fields, the same legal sentences, the same amounts and the
//   same QR code, drawn by the same model the page draws, so the page and the file never disagree.
// - A4, the viewer's own Helvetica (pdf.ts: Windows ANSI and the Slovak letters by /Differences, never embedded). A
//   letter the font cannot print (Polish ł, Hungarian ő, Romanian ș, Cyrillic) is folded to its base letter or written
//   in Latin letters for the file alone, never a question mark (`pdfSafe`).
// - Laid out by absolute positions: the logo and the title, the two parties, the dates on a light panel, the lines in
//   a table whose head repeats on every page it continues on, the totals and the payment with its QR code drawn as
//   rectangles, the notes, and a foot on each page (the legal lines, the page's number, the quiet line of Firmony).
//   Nothing is cut and nothing overlaps: a long word breaks inside its column, a row or a block that does not fit
//   goes to the next page.
// - The company's logo: a JPEG as it is (DCTDecode), a PNG of 8 or fewer bits a sample, not interlaced (grey, grey
//   with alpha, RGB, RGBA, a palette with tRNS) decoded, its rows unfiltered and written again compressed, its alpha
//   as a soft mask; anything else (WebP, 16 bits, interlaced) leaves the invoice without a logo, never without a PDF.
// - The same invoice gives the same bytes: no clock and no random identifier in the file.
import { BRAND } from '../config'
import { typeset } from '../format'
import { app } from './copy'
import { fontDictionary, pdfCanPrint, pdfString, textWidth } from './pdf'
import type { InvoiceSheetModel } from './invoice-sheet'

const tp = app.invoices.pdf

// ---------------------------------------------------------------------------------------------------------------
// Letters the font has not
// ---------------------------------------------------------------------------------------------------------------

/** Letters without a base letter in Unicode's decomposition, and signs the font lacks, as the file writes them. */
const FOLD: Readonly<Record<string, string>> = {
  ł: 'l', Ł: 'L', ß: 'ss', ẞ: 'SS', đ: 'd', Đ: 'D', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ı: 'i', ŀ: 'l', Ŀ: 'L',
  þ: 'th', Þ: 'Th', ð: 'd', Ð: 'D', ħ: 'h', Ħ: 'H', ŧ: 't', Ŧ: 'T', ĸ: 'k', ŋ: 'n', Ŋ: 'N', ſ: 's',
  '‐': '-', '‑': '-', '‒': '-', '―': '-', '′': "'", '″': '"', '‚': ',', '­': '', '​': '', '‌': '', '‍': '', '﻿': '',
  '™': 'TM', '®': '(R)', '℗': '(P)', '№': 'No.', '½': '1/2', '¼': '1/4', '¾': '3/4', '¹': '1', '²': '2', '³': '3', µ: 'u', '£': 'GBP', '¥': 'JPY', '¢': 'c', '¤': '',
  '←': '<-', '→': '->', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
}

/** Cyrillic and Greek in Latin letters, the Slovak way where Slovak has the letter (ж ž, ч č, ш š). */
const LATIN: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'je', ж: 'ž', з: 'z', и: 'i', і: 'i', ї: 'ji', й: 'j', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'u', ф: 'f', х: 'ch', ц: 'c', ч: 'č', ш: 'š', щ: 'šč', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'ju', я: 'ja', ђ: 'dj', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'c', џ: 'dž', ѓ: 'g', ќ: 'k', ѕ: 'dz',
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r',
  σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
}

/**
 * A text the file can print as it is: what the font has stays, anything else becomes its base letter (ő o, ș s, ł l),
 * Latin letters (Москва Moskva), a plain sign (² 2, ™ TM) or, with no letter to write (an emoji), nothing. Never a
 * question mark the text did not have.
 */
export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch === '\n') {
      out += ch
      continue
    }
    if (ch === '\t' || ch === '\r') {
      out += ' '
      continue
    }
    if (pdfCanPrint(ch)) {
      out += ch
      continue
    }
    const fold = FOLD[ch]
    if (fold !== undefined) {
      out += fold
      continue
    }
    const lower = ch.toLowerCase()
    const latin = LATIN[lower] ?? LATIN[lower.normalize('NFD').replace(/\p{M}/gu, '')]
    if (latin !== undefined) {
      out += lower === ch || latin === '' ? latin : latin.charAt(0).toUpperCase() + latin.slice(1)
      continue
    }
    const bare = ch.normalize('NFKD').replace(/\p{M}/gu, '')
    if (bare !== '' && bare !== ch && pdfCanPrint(bare)) {
      out += bare
      continue
    }
    if (/\s/u.test(ch)) out += ' '
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The logo
// ---------------------------------------------------------------------------------------------------------------

/** A picture as the file embeds it: a JPEG as it came, or the samples compressed with their alpha apart. */
export interface PdfImage {
  filter: 'DCTDecode' | 'FlateDecode'
  width: number
  height: number
  colorSpace: 'DeviceGray' | 'DeviceRGB'
  data: Uint8Array
  /** The alpha channel compressed (a soft mask), when any pixel is not opaque. */
  alpha: Uint8Array | null
}

/**
 * The largest picture decoded (pixels: 4 000 000 take about 40 MB while decoded, well within a Worker's memory), and the
 * size it is brought down to: the logo's box at about 300 dpi.
 */
const LOGO_PIXELS = 4_000_000
const LOGO_MAX = { width: 600, height: 200 }
/** No side longer than this and no strip thinner than a hundredth of its length: a logo, not a weapon (the review of 26 October 2026). */
const LOGO_SIDE = 4000
const LOGO_RATIO = 100

/** Whether a picture's size is one we decode and embed. */
export const logoFits = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width <= LOGO_SIDE && height <= LOGO_SIDE && width * height <= LOGO_PIXELS && Math.max(width, height) / Math.min(width, height) <= LOGO_RATIO

/** A PNG's or a JPEG's size from its header; null for anything else (a WebP is shown on the page and never decoded here). */
export function logoSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  const jpeg = jpegInfo(b)
  return jpeg ? { width: jpeg.width, height: jpeg.height } : null
}

async function through(data: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const piped = new Blob([data]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

const deflate = (data: Uint8Array) => through(data, new CompressionStream('deflate') as unknown as TransformStream<Uint8Array, Uint8Array>)

/** The first `size` bytes inflated, and no more (a picture's rows: a stream that would inflate to more is cut there). */
async function inflateRows(data: Uint8Array, size: number): Promise<Uint8Array | null> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate') as unknown as TransformStream<Uint8Array, Uint8Array>)
  const reader = stream.getReader()
  const out = new Uint8Array(size)
  let at = 0
  try {
    while (at < size) {
      const { done, value } = await reader.read()
      if (done) break
      const take = Math.min(value.length, size - at)
      out.set(value.subarray(0, take), at)
      at += take
    }
    if (at >= size) await reader.cancel().catch(() => undefined)
  } catch {
    // A broken stream: enough of it is still enough.
  }
  return at >= size ? out : null
}

/** A JPEG's size and components from its frame header; null for one a PDF reader may not show (lossless, arithmetic). */
export function jpegInfo(b: Uint8Array): { width: number; height: number; components: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] as number
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2
      continue
    }
    const length = ((b[i + 2] as number) << 8) | (b[i + 3] as number)
    if (length < 2) return null
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (i + 9 >= b.length) return null
      const height = ((b[i + 5] as number) << 8) | (b[i + 6] as number)
      const width = ((b[i + 7] as number) << 8) | (b[i + 8] as number)
      const components = b[i + 9] as number
      return width > 0 && height > 0 && (components === 1 || components === 3) ? { width, height, components } : null
    }
    // Another frame (lossless, arithmetic), or the scan before any frame: nothing a reader is sure to show.
    if ((marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) || marker === 0xda || marker === 0xd9) return null
    i += 2 + length
  }
  return null
}

interface PngHead {
  width: number
  height: number
  depth: number
  color: number
  interlace: number
  palette: Uint8Array | null
  trns: Uint8Array | null
  idat: Uint8Array
}

function pngChunks(b: Uint8Array): PngHead | null {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 33 || SIGNATURE.some((v, i) => b[i] !== v)) return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let head: Omit<PngHead, 'idat' | 'palette' | 'trns'> | null = null
  let palette: Uint8Array | null = null
  let trns: Uint8Array | null = null
  const idat: Uint8Array[] = []
  for (let i = 8; i + 8 <= b.length; ) {
    const length = view.getUint32(i)
    const type = String.fromCharCode(b[i + 4] as number, b[i + 5] as number, b[i + 6] as number, b[i + 7] as number)
    const start = i + 8
    if (start + length > b.length) return null
    const data = b.subarray(start, start + length)
    if (type === 'IHDR' && length >= 13) {
      head = { width: view.getUint32(start), height: view.getUint32(start + 4), depth: data[8] as number, color: data[9] as number, interlace: data[12] as number }
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    i = start + length + 4
  }
  if (!head || idat.length === 0) return null
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0))
  let at = 0
  for (const d of idat) {
    all.set(d, at)
    at += d.length
  }
  return { ...head, palette, trns, idat: all }
}

/** The rows of a PNG with their filters undone (Sub, Up, Average, Paeth), one after another. */
function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array | null {
  if (raw.length < height * (stride + 1)) return null
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const at = y * stride
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? (out[at + x - bpp] as number) : 0
      const up = y > 0 ? (out[at - stride + x] as number) : 0
      const corner = x >= bpp && y > 0 ? (out[at - stride + x - bpp] as number) : 0
      const value = row[x] as number
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - corner
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - corner)
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      } else if (filter !== 0) return null
      out[at + x] = (value + add) & 0xff
    }
  }
  return out
}

/** A PNG's pixels as grey or RGB samples of 8 bits and an alpha of 8 bits (null when every pixel is opaque). */
async function pngPixels(b: Uint8Array): Promise<{ width: number; height: number; channels: 1 | 3; color: Uint8Array; alpha: Uint8Array | null } | null> {
  const png = pngChunks(b)
  if (!png || png.interlace !== 0 || !logoFits(png.width, png.height)) return null
  const { width, height, depth, color } = png
  const channels = color === 0 ? 1 : color === 2 ? 3 : color === 3 ? 1 : color === 4 ? 2 : color === 6 ? 4 : 0
  const depthOk = color === 0 || color === 3 ? [1, 2, 4, 8].includes(depth) : depth === 8
  if (channels === 0 || !depthOk || (color === 3 && !png.palette)) return null
  const stride = Math.ceil((width * channels * depth) / 8)
  const raw = await inflateRows(png.idat, height * (stride + 1))
  if (!raw) return null
  const rows = unfilter(raw, height, stride, Math.max(1, (channels * depth) >> 3))
  if (!rows) return null
  const out = new Uint8Array(width * height * (color === 0 || color === 4 ? 1 : 3))
  const alpha = new Uint8Array(width * height).fill(255)
  const max = (1 << depth) - 1
  const sample = (y: number, x: number) => {
    const bit = x * depth
    return ((rows[y * stride + (bit >> 3)] as number) >> (8 - depth - (bit & 7))) & max
  }
  const trns = png.trns
  const word = (i: number) => (trns && trns.length >= i * 2 + 2 ? ((trns[i * 2] as number) << 8) | (trns[i * 2 + 1] as number) : -1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const at = y * stride + x * channels
      if (color === 0) {
        const v = sample(y, x)
        out[p] = Math.round((v * 255) / max)
        if (trns && v === word(0)) alpha[p] = 0
      } else if (color === 4) {
        out[p] = rows[at] as number
        alpha[p] = rows[at + 1] as number
      } else if (color === 2 || color === 6) {
        const r = rows[at] as number
        const g = rows[at + 1] as number
        const bl = rows[at + 2] as number
        out[p * 3] = r
        out[p * 3 + 1] = g
        out[p * 3 + 2] = bl
        if (color === 6) alpha[p] = rows[at + 3] as number
        else if (trns && r === word(0) && g === word(1) && bl === word(2)) alpha[p] = 0
      } else {
        const index = sample(y, x)
        const palette = png.palette as Uint8Array
        out[p * 3] = palette[index * 3] ?? 0
        out[p * 3 + 1] = palette[index * 3 + 1] ?? 0
        out[p * 3 + 2] = palette[index * 3 + 2] ?? 0
        if (trns && index < trns.length) alpha[p] = trns[index] as number
      }
    }
  }
  return { width, height, channels: color === 0 || color === 4 ? 1 : 3, color: out, alpha: alpha.every((a) => a === 255) ? null : alpha }
}

/** Pixels brought down by a whole factor, each new one the average of its block (colour weighed by its alpha). */
function shrink(px: { width: number; height: number; channels: 1 | 3; color: Uint8Array; alpha: Uint8Array | null }) {
  const factor = Math.max(1, Math.ceil(Math.max(px.width / LOGO_MAX.width, px.height / LOGO_MAX.height)))
  if (factor === 1) return px
  const width = Math.max(1, Math.floor(px.width / factor))
  const height = Math.max(1, Math.floor(px.height / factor))
  const n = px.channels
  const color = new Uint8Array(width * height * n)
  const alpha = px.alpha ? new Uint8Array(width * height) : null
  const sum = new Array<number>(n).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sum.fill(0)
      let weight = 0
      let count = 0
      // A block never reaches past the picture: work stays the picture's own size.
      for (let dy = 0; dy < factor && y * factor + dy < px.height; dy++) {
        for (let dx = 0; dx < factor && x * factor + dx < px.width; dx++) {
          const p = (y * factor + dy) * px.width + x * factor + dx
          const a = px.alpha ? (px.alpha[p] as number) : 255
          for (let c = 0; c < n; c++) sum[c] = (sum[c] as number) + (px.color[p * n + c] as number) * a
          weight += a
          count++
        }
      }
      const q = y * width + x
      for (let c = 0; c < n; c++) color[q * n + c] = weight > 0 ? Math.round((sum[c] as number) / weight) : 255
      if (alpha) alpha[q] = Math.round(weight / count)
    }
  }
  return { width, height, channels: px.channels, color, alpha }
}

/** The company's logo as the file embeds it; null for a picture it does not take (WebP, 16 bits, interlaced, broken). */
export async function logoImage(bytes: Uint8Array): Promise<PdfImage | null> {
  const jpeg = jpegInfo(bytes)
  if (jpeg && !logoFits(jpeg.width, jpeg.height)) return null
  if (jpeg) return { filter: 'DCTDecode', width: jpeg.width, height: jpeg.height, colorSpace: jpeg.components === 1 ? 'DeviceGray' : 'DeviceRGB', data: bytes, alpha: null }
  try {
    const decoded = await pngPixels(bytes)
    if (!decoded) return null
    const px = shrink(decoded)
    return {
      filter: 'FlateDecode',
      width: px.width,
      height: px.height,
      colorSpace: px.channels === 1 ? 'DeviceGray' : 'DeviceRGB',
      data: await deflate(px.color),
      alpha: px.alpha ? await deflate(px.alpha) : null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

const PAGE = { width: 595.28, height: 841.89 }
const LEFT = 56
const BODY = PAGE.width - 2 * LEFT
const TOP = PAGE.height - 54
/** The colours: text, labels, hairlines, panels, the quiet line at the foot. */
const INK = '0.067 0.094 0.153'
const GREY = '0.42 0.447 0.502'
const HAIR = '0.898 0.906 0.922'
const PANEL = '0.969 0.973 0.98'
const FAINT = '0.612 0.639 0.686'

const n = (v: number): string => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

type Align = 'left' | 'right'

/** A text's width as the file prints it. */
const measure = (text: string, size: number, bold = false) => textWidth(pdfSafe(text), size, bold)

/**
 * A text broken into lines no wider than `width`: at spaces, never after a one-letter word or inside "s. r. o." or a
 * date (format.ts, typeset), and a word wider than a line broken inside it.
 */
export function wrapText(raw: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = []
  for (const paragraph of pdfSafe(typeset(raw)).split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ').filter((w) => w !== '')) {
      let rest = word
      while (textWidth(rest, size, bold) > width) {
        // The longest start of the word that fits beside what the line holds, else on a line of its own.
        const room = line === '' ? width : width - textWidth(`${line} `, size, bold)
        let cut = 0
        for (const ch of rest) {
          if (textWidth(rest.slice(0, cut + ch.length), size, bold) > room) break
          cut += ch.length
        }
        if (cut === 0) {
          if (line !== '') {
            lines.push(line)
            line = ''
            continue
          }
          cut = [...rest][0]?.length ?? 1
        }
        lines.push(line === '' ? rest.slice(0, cut) : `${line} ${rest.slice(0, cut)}`)
        line = ''
        rest = rest.slice(cut)
      }
      if (rest === '') continue
      const next = line === '' ? rest : `${line} ${rest}`
      if (line !== '' && textWidth(next, size, bold) > width) {
        lines.push(line)
        line = rest
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

/** The size, at most `size` and at least `least`, at which a text fits a width. */
function fitSize(text: string, width: number, size: number, bold: boolean, least: number): number {
  let s = size
  while (s > least && measure(text, s, bold) > width) s = Math.max(least, s - 0.5)
  return s
}

class Page {
  readonly ops: string[] = []

  text(x: number, y: number, raw: string, size: number, { bold = false, color = INK, align = 'left' as Align } = {}) {
    const text = pdfSafe(raw)
    if (text === '') return
    const at = align === 'right' ? x - textWidth(text, size, bold) : x
    this.ops.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(at)} ${n(y)} Td ${pdfString(text)} Tj ET`)
  }

  rule(x1: number, x2: number, y: number, width = 0.6, color = HAIR) {
    this.ops.push(`${color} RG ${n(width)} w ${n(x1)} ${n(y)} m ${n(x2)} ${n(y)} l S`)
  }

  /** A filled rectangle with rounded corners, from its top left corner down. */
  panel(x: number, top: number, w: number, h: number, r = 6, color = PANEL) {
    const k = 0.5523 * r
    const b = top - h
    const right = x + w
    this.ops.push(
      [
        `${color} rg`,
        `${n(x + r)} ${n(top)} m`,
        `${n(right - r)} ${n(top)} l ${n(right - r + k)} ${n(top)} ${n(right)} ${n(top - r + k)} ${n(right)} ${n(top - r)} c`,
        `${n(right)} ${n(b + r)} l ${n(right)} ${n(b + r - k)} ${n(right - r + k)} ${n(b)} ${n(right - r)} ${n(b)} c`,
        `${n(x + r)} ${n(b)} l ${n(x + r - k)} ${n(b)} ${n(x)} ${n(b + r - k)} ${n(x)} ${n(b + r)} c`,
        `${n(x)} ${n(top - r)} l ${n(x)} ${n(top - r + k)} ${n(x + r - k)} ${n(top)} ${n(x + r)} ${n(top)} c`,
        'h f',
      ].join(' '),
    )
  }
}

/** A text's first baseline below a top edge: its letters stand under that edge, not across it. */
const baseline = (top: number, size: number) => top - size * 0.78

// ---------------------------------------------------------------------------------------------------------------
// The invoice laid out
// ---------------------------------------------------------------------------------------------------------------

export interface InvoicePdfInput {
  sheet: InvoiceSheetModel
  /** The document's number as the file's title and the pages' heads name it (no "č."). */
  number: string
  logo: PdfImage | null
}

interface Laid {
  pages: string[]
  logo: boolean
}

function layout({ sheet, number, logo }: InvoicePdfInput): Laid {
  const pages: Page[] = []
  let page = new Page()
  pages.push(page)
  let y = TOP

  // The foot of every page: the sheet's foot (no VAT payer, the register entry, who issued it) over a hairline, the
  // page's number and the quiet line of Firmony under them.
  const legal = sheet.foot.flatMap((line) => wrapText(line, BODY, 7.5))
  const LEGAL_LEAD = 10
  const footBase = 30
  const legalTop = footBase + 14 + legal.length * LEGAL_LEAD
  const bottom = legalTop + 18

  const continuation = () => {
    page = new Page()
    pages.push(page)
    page.text(LEFT, baseline(TOP, 8), sheet.seller.name.length > 70 ? `${sheet.seller.name.slice(0, 68).trim()}…` : sheet.seller.name, 8, { color: GREY })
    page.text(LEFT + BODY, baseline(TOP, 8), `${sheet.kind} ${sheet.number}`, 8, { color: GREY, align: 'right' })
    page.rule(LEFT, LEFT + BODY, TOP - 14)
    y = TOP - 34
  }
  const room = (h: number) => y - h >= bottom
  const need = (h: number) => {
    if (!room(h)) continuation()
  }

  // The head: the logo (or the company's name) on the left, the document and its number on the right.
  const titleWidth = 250
  const titleSize = fitSize(sheet.kind, titleWidth, 22, true, 13)
  const right: { text: string; size: number; bold: boolean; color: string; gap: number }[] = [
    { text: sheet.kind, size: titleSize, bold: true, color: INK, gap: 0 },
    { text: sheet.number, size: 11, bold: false, color: INK, gap: 9 },
    ...sheet.refs.flatMap((ref) => wrapText(ref, titleWidth, 8).map((line, i) => ({ text: line, size: 8, bold: false, color: GREY, gap: i === 0 ? 7 : 2 }))),
  ]
  let rightY = TOP
  for (const line of right) {
    rightY -= line.gap
    page.text(LEFT + BODY, baseline(rightY, line.size), line.text, line.size, { bold: line.bold, color: line.color, align: 'right' })
    rightY -= line.size * 1.05
  }
  const rightWidth = Math.max(...right.map((line) => measure(line.text, line.size, line.bold)))
  let leftY = TOP
  if (logo) {
    const scale = Math.min(140 / logo.width, 48 / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    page.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(LEFT)} ${n(TOP - h)} cm /Im1 Do Q`)
    leftY = TOP - h
  } else {
    const width = Math.max(160, BODY - rightWidth - 32)
    const lines = wrapText(sheet.seller.name, width, 13, true).slice(0, 3)
    lines.forEach((line, i) => page.text(LEFT, baseline(TOP - i * 16, 13), line, 13, { bold: true }))
    leftY = TOP - lines.length * 16
  }
  y = Math.min(leftY, rightY) - 28

  // The parties: who supplies, who is supplied.
  const columnWidth = (BODY - 32) / 2
  const party = (x: number, label: string, who: InvoiceSheetModel['seller'], top: number, draw: boolean): number => {
    let at = top
    const put = (text: string, size: number, opts: { bold?: boolean; color?: string } = {}) => {
      if (draw) page.text(x, baseline(at, size), text, size, opts)
    }
    put(label, 7.5, { color: GREY })
    at -= 7.5 + 6
    for (const line of wrapText(who.name, columnWidth, 10.5, true)) {
      put(line, 10.5, { bold: true })
      at -= 13.5
    }
    at -= 2
    for (const line of who.lines.flatMap((l) => wrapText(l, columnWidth, 9))) {
      put(line, 9)
      at -= 12.5
    }
    if (who.ids.length > 0) at -= 4
    for (const id of who.ids) {
      if (draw) {
        page.text(x, baseline(at, 8.5), id.label, 8.5, { color: GREY })
        page.text(x + measure(`${id.label} `, 8.5), baseline(at, 8.5), id.value, 8.5)
      }
      at -= 12
    }
    return top - at
  }
  const partiesHeight = Math.max(party(LEFT, sheet.supplierLabel, sheet.seller, y, false), party(LEFT + columnWidth + 32, sheet.customerLabel, sheet.customer, y, false))
  need(partiesHeight)
  party(LEFT, sheet.supplierLabel, sheet.seller, y, true)
  party(LEFT + columnWidth + 32, sheet.customerLabel, sheet.customer, y, true)
  y -= partiesHeight + 20

  // The dates and the variable symbol on a light panel.
  {
    const pad = { x: 16, y: 12 }
    const width = (BODY - 2 * pad.x) / sheet.dates.length
    const cells = sheet.dates.map((d) => ({ label: wrapText(d.label, width - 10, 7.5), value: wrapText(d.value, width - 10, 9.5, true) }))
    const inner = Math.max(...cells.map((c) => c.label.length * 9.5 + 5 + c.value.length * 12))
    const height = inner + 2 * pad.y
    need(height)
    page.panel(LEFT, y, BODY, height)
    cells.forEach((c, i) => {
      const x = LEFT + pad.x + i * width
      let at = y - pad.y
      for (const line of c.label) {
        page.text(x, baseline(at, 7.5), line, 7.5, { color: GREY })
        at -= 9.5
      }
      at -= 5
      for (const line of c.value) {
        page.text(x, baseline(at, 9.5), line, 9.5, { bold: true })
        at -= 12
      }
    })
    y -= height + 24
  }

  // The lines: their head on every page the table goes on.
  const vat = sheet.head.vat !== null
  const widths = vat ? { quantity: 62, unitPrice: 82, vat: 44, amount: 86 } : { quantity: 72, unitPrice: 92, vat: 0, amount: 92 }
  const descWidth = BODY - widths.quantity - widths.unitPrice - widths.vat - widths.amount
  const columns: { key: 'quantity' | 'unitPrice' | 'vat' | 'amount'; right: number; width: number }[] = []
  {
    let x = LEFT + descWidth
    for (const key of ['quantity', 'unitPrice', 'vat', 'amount'] as const) {
      if (key === 'vat' && !vat) continue
      x += widths[key]
      columns.push({ key, right: x, width: widths[key] - 10 })
    }
  }
  const HEAD = 20
  const head = () => {
    page.text(LEFT, baseline(y, 7.5), sheet.head.description, 7.5, { color: GREY })
    for (const c of columns) page.text(c.right, baseline(y, 7.5), sheet.head[c.key] ?? '', 7.5, { color: GREY, align: 'right' })
    y -= HEAD - 6
    page.rule(LEFT, LEFT + BODY, y, 0.8, '0.82 0.835 0.86')
  }
  const LEAD = 12
  const PAD = 6.5
  const rowOf = (row: InvoiceSheetModel['rows'][number]) => {
    const lines = wrapText(row.description, descWidth - 14, 9)
    return { lines, height: Math.max(1, lines.length) * LEAD + 2 * PAD - 2.5 }
  }
  const rows = sheet.rows.map((row) => ({ row, ...rowOf(row) }))
  need(HEAD + (rows[0]?.height ?? 0))
  head()
  for (const { row, lines, height } of rows) {
    if (!room(height)) {
      continuation()
      head()
    }
    const top = y - PAD - 1
    lines.forEach((line, i) => page.text(LEFT, baseline(top - i * LEAD, 9), line, 9))
    for (const c of columns) {
      const value = (row[c.key] ?? '').trim()
      const size = fitSize(value, c.width, 9, false, 6.5)
      page.text(c.right, baseline(top, 9), value, size, { align: 'right' })
    }
    y -= height
    page.rule(LEFT, LEFT + BODY, y)
  }
  y -= 16

  // What the law asks it to say: a credit note's reason, the taxation without Slovak VAT, a request's note.
  const paragraph = (text: string, size: number, opts: { bold?: boolean; color?: string } = {}, lead = size * 1.35) => {
    for (const line of wrapText(text, BODY, size, opts.bold)) {
      need(lead)
      page.text(LEFT, baseline(y, size), line, size, opts)
      y -= lead
    }
  }
  if (sheet.reason) {
    need(9.5 + 4 + 12)
    page.text(LEFT, baseline(y, 7.5), sheet.reason.label, 7.5, { color: GREY })
    y -= 9.5 + 4
    paragraph(sheet.reason.value, 9)
    y -= 10
  }
  for (const note of [sheet.mode, sheet.proforma]) {
    if (!note) continue
    paragraph(note, 8.5)
    y -= 8
  }
  if (sheet.reason || sheet.mode || sheet.proforma) y -= 8

  // The totals on the right, how to pay on the left (with the QR code a bank's app reads).
  {
    const TW = 212
    const tx = LEFT + BODY - TW
    const ROW = 15
    const totalH = 40
    const eurLead = 13
    const rightH = sheet.totals.length * ROW + (sheet.totals.length > 0 ? 6 : 0) + totalH + (sheet.eur.length > 0 ? 8 + sheet.eur.length * eurLead : 0)
    const QS = 80
    const qrCaption = sheet.qr ? wrapText(sheet.qrCaption.text, QS, 6.5) : []
    const qrH = sheet.qr ? QS + 6 + qrCaption.length * 8.5 + 8.5 : 0
    const px = LEFT + (sheet.qr ? QS + 16 : 0)
    const pw = BODY - TW - 28 - (sheet.qr ? QS + 16 : 0)
    const pairs = (sheet.pay ?? []).map((p) => ({ label: wrapText(p.label, pw, 7.5), value: p.value, size: fitSize(p.value, pw, 9.5, false, 6.5) }))
    const payH = pairs.reduce((h, p) => h + p.label.length * 9.5 + 3 + 13 + 8, 0)
    const height = Math.max(rightH, qrH, payH)
    need(height)
    const top = y
    let at = top
    for (const p of sheet.totals) {
      page.text(tx, baseline(at, 8.5), p.label, 8.5, { color: GREY })
      page.text(tx + TW, baseline(at, 8.5), p.value, 9, { align: 'right' })
      at -= ROW
    }
    if (sheet.totals.length > 0) at -= 6
    page.panel(tx, at, TW, totalH)
    const labelWidth = measure(sheet.total.label, 9.5, true)
    const valueSize = fitSize(sheet.total.value, TW - 24 - labelWidth - 10, 15, true, 9)
    page.text(tx + 12, at - totalH / 2 - 9.5 * 0.35, sheet.total.label, 9.5, { bold: true })
    page.text(tx + TW - 12, at - totalH / 2 - valueSize * 0.35, sheet.total.value, valueSize, { bold: true, align: 'right' })
    at -= totalH
    if (sheet.eur.length > 0) {
      at -= 8
      for (const p of sheet.eur) {
        page.text(tx, baseline(at, 8), p.label, 8, { color: GREY })
        page.text(tx + TW, baseline(at, 8), p.value, 8.5, { align: 'right' })
        at -= eurLead
      }
    }
    if (sheet.qr) {
      // The modules stand on the margin, level with the first label; the quiet zone of four is the white page around.
      const qr = sheet.qr
      const quiet = 4
      const module = QS / (qr.size - 2 * quiet)
      const rects: string[] = []
      for (const m of qr.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) rects.push(`${m[1]} ${m[2]} ${m[3]} 1.02 re`)
      page.ops.push(`/PayBySquare BMC q ${module.toFixed(4)} 0 0 ${(-module).toFixed(4)} ${(LEFT - quiet * module).toFixed(2)} ${(top + quiet * module - 1).toFixed(2)} cm 0 0 0 rg ${rects.join(' ')} f Q EMC`)
      let cy = top - 1 - QS - 7
      for (const line of qrCaption) {
        page.text(LEFT, baseline(cy, 6.5), line, 6.5, { color: GREY })
        cy -= 8.5
      }
      page.text(LEFT, baseline(cy, 6.5), sheet.qrCaption.brand, 6.5, { bold: true })
    }
    let py = top
    for (const p of pairs) {
      for (const line of p.label) {
        page.text(px, baseline(py, 7.5), line, 7.5, { color: GREY })
        py -= 9.5
      }
      py -= 3
      page.text(px, baseline(py, 9.5), p.value, p.size)
      py -= 13 + 8
    }
    y = top - height - 20
  }

  // The rate of another currency, the note.
  if (sheet.fx) {
    paragraph(sheet.fx, 8.5, { color: GREY })
    y -= 8
  }
  if (sheet.note) paragraph(sheet.note, 9, {}, 12.5)

  // Each page's foot.
  const total = pages.length
  const growth = tp.growth(new URL(BRAND.origin).hostname)
  pages.forEach((p, i) => {
    p.rule(LEFT, LEFT + BODY, legalTop + 8)
    legal.forEach((line, j) => p.text(LEFT, legalTop - 8 - j * LEGAL_LEAD, line, 7.5, { color: GREY }))
    p.text(LEFT, footBase, growth, 6.5, { color: FAINT })
    if (total > 1) p.text(LEFT + BODY, footBase, tp.page(i + 1, total), 7.5, { color: GREY, align: 'right' })
  })
  return { pages: pages.map((p) => p.ops.join('\n')), logo: Boolean(logo) }
}

// ---------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff)

/** A title for the reader's window: UTF-16 with its mark, so any letter is kept. */
const utf16 = (text: string): string => `<FEFF${[...text].flatMap((ch) => {
  const code = ch.codePointAt(0) as number
  if (code < 0x10000) return [code]
  const v = code - 0x10000
  return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)]
}).map((c) => c.toString(16).toUpperCase().padStart(4, '0')).join('')}>`

type PdfObject = string | { dict: string; data: Uint8Array }

/** The invoice as a PDF file. */
export function invoicePdf(input: InvoicePdfInput): Uint8Array {
  const laid = layout(input)
  const logo = laid.logo ? input.logo : null
  const objects: PdfObject[] = []
  const add = (o: PdfObject) => objects.push(o) // its number is the count after it
  add('<< /Type /Catalog /Pages 2 0 R /Lang (sk) /ViewerPreferences << /DisplayDocTitle true >> >>')
  add('') // the page tree, written once the pages have their numbers
  add(fontDictionary('Helvetica'))
  add(fontDictionary('Helvetica-Bold'))
  add(`<< /Title ${utf16(tp.title(input.sheet.kind, input.number, input.sheet.seller.name))} /Producer (Firmony) /Creator (Firmony) >>`)
  let image: number | null = null
  if (logo) {
    let mask: number | null = null
    if (logo.alpha) {
      add({ dict: `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, data: logo.alpha })
      mask = objects.length
    }
    add({
      dict: `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /${logo.colorSpace} /BitsPerComponent 8 /Filter /${logo.filter}${mask ? ` /SMask ${mask} 0 R` : ''}`,
      data: logo.data,
    })
    image = objects.length
  }
  const pageIds: number[] = []
  for (const content of laid.pages) {
    add({ dict: '', data: ascii(content) })
    const contentId = objects.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${image ? ` /XObject << /Im1 ${image} 0 R >>` : ''} >> /Contents ${contentId} 0 R >>`)
    pageIds.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  // The header, with a comment of bytes above 127 that tells a reader the file is binary.
  const parts: Uint8Array[] = [ascii('%PDF-1.4\n'), Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])]
  let length = parts.reduce((s, p) => s + p.length, 0)
  const push = (p: Uint8Array) => {
    parts.push(p)
    length += p.length
  }
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(length)
    if (typeof o === 'string') push(ascii(`${i + 1} 0 obj\n${o}\nendobj\n`))
    else {
      push(ascii(`${i + 1} 0 obj\n<< ${o.dict}${o.dict ? ' ' : ''}/Length ${o.data.length} >>\nstream\n`))
      push(o.data)
      push(ascii('\nendstream\nendobj\n'))
    }
  })
  const xref = length
  push(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`))
  push(ascii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  const out = new Uint8Array(length)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** The file's name in plain letters: "Faktura-20260001.pdf", "Dobropis-FA2026-0007.pdf", "Zalohova-faktura-ZF20260001.pdf". */
export function invoicePdfName(kind: string, number: string): string {
  const slug = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9._]+/g, '-')
      .replace(/^-+|-+$/g, '')
  return `${slug(kind) || 'Faktura'}-${slug(number) || 'faktura'}.pdf`
}

