// A small PDF writer for the documents Firmony hands out as files (17 October 2026: the notes to the financial
// statements, which eDane takes as a PDF attachment). Pure and without a library: A4 pages of text and tables in the
// viewer's own Helvetica, which every PDF reader has (the standard 14 fonts are never embedded). Slovak letters that
// the Windows ANSI encoding lacks (č, ď, ľ, ĺ, ň, ŕ, ť, ě, ř, ů and their capitals) are given codes of their own by
// the font's /Differences, the way the Central European core fonts have long been written; the glyph names are
// Adobe's. Widths are Helvetica's (AFM of the core fonts), so lines wrap and amounts align as they print.
//
// The document is a list of blocks (headings, paragraphs, tables); `pdfOf` lays them out page by page with a header
// line on each (what the forms ask for: the form's name on the left, IČO and DIČ on the right) and the page number.

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string; bold?: boolean }
  | { kind: 'table'; columns: { label: string; width: number; align?: 'left' | 'right' }[]; rows: { cells: string[]; bold?: boolean }[] }

export interface PdfDocument {
  /** The header line of every page: left and right. */
  header: { left: string; right: string }
  blocks: PdfBlock[]
  /** The document's title in its properties. */
  title: string
}

// ---------------------------------------------------------------------------------------------------------------
// The encoding and the widths
// ---------------------------------------------------------------------------------------------------------------

/** Letters outside Windows ANSI, each with the code and the glyph name the font's /Differences gives it. */
const EXTRA: readonly [string, number, string][] = [
  ['č', 129, 'ccaron'],
  ['Č', 141, 'Ccaron'],
  ['ď', 143, 'dcaron'],
  ['Ď', 144, 'Dcaron'],
  ['ľ', 157, 'lcaron'],
  ['Ľ', 161, 'Lcaron'],
  ['ĺ', 162, 'lacute'],
  ['Ĺ', 163, 'Lacute'],
  ['ň', 164, 'ncaron'],
  ['Ň', 165, 'Ncaron'],
  ['ŕ', 166, 'racute'],
  ['Ŕ', 168, 'Racute'],
  ['ť', 170, 'tcaron'],
  ['Ť', 172, 'Tcaron'],
  ['ě', 174, 'ecaron'],
  ['Ě', 175, 'Ecaron'],
  ['ř', 178, 'rcaron'],
  ['Ř', 179, 'Rcaron'],
  ['ů', 185, 'uring'],
  ['Ů', 186, 'Uring'],
]

/** Windows ANSI's letters above 127 that Slovak and its documents use, by their code. */
const ANSI: Readonly<Record<string, number>> = {
  '€': 128, '−': 150, '„': 132, '…': 133, '‰': 137, 'Š': 138, '‹': 139, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '\u2013': 150, '\u2014': 151, 'š': 154, '›': 155, 'ž': 158,
  '§': 167, '©': 169, '«': 171, '°': 176, '±': 177, '´': 180, '·': 183, '»': 187, '×': 215, '÷': 247,
  'Á': 193, 'Ä': 196, 'É': 201, 'Í': 205, 'Ó': 211, 'Ô': 212, 'Ö': 214, 'Ú': 218, 'Ü': 220, 'Ý': 221,
  'á': 225, 'ä': 228, 'é': 233, 'í': 237, 'ó': 243, 'ô': 244, 'ö': 246, 'ú': 250, 'ü': 252, 'ý': 253,
}

const CODE = new Map<string, number>([...Object.entries(ANSI), ...EXTRA.map(([ch, code]) => [ch, code] as [string, number])])

/** A character as the font's code: ASCII as it is, a non-breaking or narrow space a space, what the font has not a question mark. */
function codeOf(ch: string): number {
  if (ch === ' ' || ch === ' ' || ch === ' ') return 32
  const c = ch.charCodeAt(0)
  if (c >= 32 && c <= 126) return c
  return CODE.get(ch) ?? 63
}

/** Whether this writer can preserve every character, rather than silently replacing one with a question mark. */
export function pdfCanPrint(text: string): boolean {
  return [...text].every((ch) => ch === '\n' || ch === '\r' || ch === '\t' || ch === '?' || codeOf(ch) !== 63)
}

// Helvetica and Helvetica-Bold, ASCII 32 to 126 (Adobe's AFM of the core fonts), in thousandths of the size.
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
/** The glyphs above ASCII by the letter they are drawn on (an accent does not widen it), and the few that are wider. */
const BASE: Readonly<Record<string, string>> = { á: 'a', ä: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ĺ: 'l', ľ: 'l', ň: 'n', ó: 'o', ô: 'o', ö: 'o', ŕ: 'r', ř: 'r', š: 's', ť: 't', ú: 'u', ů: 'u', ü: 'u', ý: 'y', ž: 'z', Á: 'A', Ä: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Í: 'I', Ĺ: 'L', Ľ: 'L', Ň: 'N', Ó: 'O', Ô: 'O', Ö: 'O', Ŕ: 'R', Ř: 'R', Š: 'S', Ť: 'T', Ú: 'U', Ů: 'U', Ü: 'U', Ý: 'Y', Ž: 'Z' }
const WIDE: Readonly<Record<string, [number, number]>> = { ď: [643, 743], ľ: [299, 400], ť: [317, 389], Ľ: [556, 611], '€': [556, 556], '§': [556, 556], '„': [333, 500], '“': [333, 500], '”': [333, 500], '\u2013': [556, 556], '−': [556, 556], '\u2014': [1000, 1000], '…': [1000, 1000], '•': [350, 350], '°': [400, 400], '×': [584, 584] }

/** A text's width in points at a size. */
export function textWidth(text: string, size: number, bold = false): number {
  let units = 0
  for (const raw of text) {
    const ch = BASE[raw] ?? raw
    const wide = WIDE[raw]
    const c = codeOf(ch)
    units += wide ? wide[bold ? 1 : 0] : c >= 32 && c <= 126 ? ((bold ? BOLD : REGULAR)[c - 32] as number) : 556
  }
  return (units * size) / 1000
}

/** A text as a PDF string: its codes, with the brackets and the backslash escaped and every code above 126 in octal. */
export function pdfString(text: string): string {
  let out = '('
  for (const ch of text) {
    const c = codeOf(ch)
    if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`
    else if (c > 126) out += `\\${c.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(c)
  }
  return `${out})`
}

/** A text broken into lines no wider than `width`, at spaces; a word wider than a line stands alone on it. */
export function wrap(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`
      if (line !== '' && textWidth(next, size, bold) > width) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

// ---------------------------------------------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------------------------------------------

const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = { left: 50, right: 50, top: 60, bottom: 56 }
const BODY = PAGE.width - MARGIN.left - MARGIN.right
const SIZE = { title: 15, heading: 11, text: 9.5, table: 8.5, header: 8 }

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()

/** The document laid out: each page's content stream. */
function layout(doc: PdfDocument): string[] {
  const pages: string[][] = []
  let ops: string[] = []
  let y = 0
  const newPage = () => {
    ops = []
    pages.push(ops)
    y = PAGE.height - MARGIN.top
  }
  const room = (height: number) => {
    if (y - height < MARGIN.bottom) newPage()
  }
  const text = (x: number, at: number, s: string, size: number, bold = false) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${fmt(size)} Tf ${fmt(x)} ${fmt(at)} Td ${pdfString(s)} Tj ET`)
  const rule = (at: number, width = 0.5) => ops.push(`${fmt(width)} w ${fmt(MARGIN.left)} ${fmt(at)} m ${fmt(MARGIN.left + BODY)} ${fmt(at)} l S`)
  newPage()
  for (const [index, block] of doc.blocks.entries()) {
    if (block.kind === 'title' || block.kind === 'heading' || block.kind === 'text') {
      const size = block.kind === 'title' ? SIZE.title : block.kind === 'heading' ? SIZE.heading : SIZE.text
      const bold = block.kind !== 'text' || Boolean(block.bold)
      const lead = size * 1.35
      const before = block.kind === 'title' ? 0 : block.kind === 'heading' ? 10 : 3
      const lines = wrap(block.text, BODY, size, bold)
      // A heading keeps at least two lines of what follows on its page, a text before a table the table's head and two rows.
      const next = doc.blocks[index + 1]
      room(before + lead * lines.length + (block.kind === 'heading' ? SIZE.text * 3 : 0) + (next?.kind === 'table' ? SIZE.table * 1.3 * 6 + 24 : 0))
      y -= before
      for (const line of lines) {
        y -= lead
        text(MARGIN.left, y, line, size, bold)
      }
      if (block.kind === 'title') y -= 6
      continue
    }
    // A table: the columns' widths as shares of the body, the head repeated on a new page.
    const total = block.columns.reduce((s, c) => s + c.width, 0)
    const widths = block.columns.map((c) => (c.width / total) * BODY)
    const lead = SIZE.table * 1.3
    const pad = 3
    const head = () => {
      const cells = block.columns.map((c, i) => wrap(c.label, (widths[i] as number) - 2 * pad, SIZE.table, true))
      const height = Math.max(...cells.map((l) => l.length)) * lead + 2 * pad
      room(height + lead * 2)
      rule(y)
      drawRow(cells, true, height)
      rule(y)
    }
    const drawRow = (cells: string[][], bold: boolean, height: number) => {
      let x = MARGIN.left
      cells.forEach((lines, i) => {
        const w = widths[i] as number
        const right = block.columns[i]?.align === 'right'
        lines.forEach((line, j) => {
          const at = y - pad - lead * (j + 1) + 2
          text(right ? x + w - pad - textWidth(line, SIZE.table, bold) : x + pad, at, line, SIZE.table, bold)
        })
        x += w
      })
      y -= height
    }
    y -= 6
    head()
    for (const row of block.rows) {
      const cells = row.cells.map((cell, i) => wrap(cell, (widths[i] as number) - 2 * pad, SIZE.table, Boolean(row.bold)))
      const height = Math.max(1, ...cells.map((l) => l.length)) * lead + 2 * pad
      if (y - height < MARGIN.bottom) {
        newPage()
        head()
      }
      drawRow(cells, Boolean(row.bold), height)
      rule(y, 0.25)
    }
  }
  // Each page's header and number.
  return pages.map((page, i) => {
    const top = PAGE.height - 34
    const head = [
      `BT /F1 ${SIZE.header} Tf ${fmt(MARGIN.left)} ${fmt(top)} Td ${pdfString(doc.header.left)} Tj ET`,
      `BT /F1 ${SIZE.header} Tf ${fmt(MARGIN.left + BODY - textWidth(doc.header.right, SIZE.header))} ${fmt(top)} Td ${pdfString(doc.header.right)} Tj ET`,
      `0.5 w ${fmt(MARGIN.left)} ${fmt(top - 6)} m ${fmt(MARGIN.left + BODY)} ${fmt(top - 6)} l S`,
    ]
    const number = `${i + 1} / ${pages.length}`
    const foot = `BT /F1 ${SIZE.header} Tf ${fmt(MARGIN.left + BODY - textWidth(number, SIZE.header))} ${fmt(30)} Td ${pdfString(number)} Tj ET`
    return [...head, ...page, foot].join('\n')
  })
}

/** The document as a PDF file, as bytes and as its text (ASCII). */
export function pdfOf(doc: PdfDocument): Uint8Array {
  return latin1(pdfText(doc))
}

/** A core font's dictionary with this writer's encoding: Windows ANSI, the Slovak letters it lacks by /Differences. */
export function fontDictionary(base: 'Helvetica' | 'Helvetica-Bold'): string {
  const differences = `[${EXTRA.map(([, code, name]) => `${code} /${name}`).join(' ')}]`
  return `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${differences} >> >>`
}

export function pdfText(doc: PdfDocument): string {
  const streams = layout(doc)
  const objects: string[] = []
  const add = (body: string) => objects.push(body)
  const font = fontDictionary
  // 1 the catalog, 2 the page tree, 3 and 4 the fonts, 5 the information; then each page and its content.
  const pageIds = streams.map((_, i) => 6 + i * 2)
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${streams.length} >>`)
  add(font('Helvetica'))
  add(font('Helvetica-Bold'))
  add(`<< /Title ${pdfString(doc.title)} /Producer (Firmony) >>`)
  streams.forEach((content, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${(pageIds[i] as number) + 1} 0 R >>`)
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  // Plain ASCII throughout (every code above 126 is written in octal), so the file can be kept as text.
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(byteLength(out))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

/** The file's text as bytes: it is ASCII, one byte a character. */
const latin1 = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0x7f)
const byteLength = (text: string): number => text.length
