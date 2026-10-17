// The papers of a company that are not documents of its books: the power of attorney its director signs so that we
// may file for it (plná moc). Kept in R2 beside the documents, under the company, and handed out only to the company
// and to the team that keeps it. A file is what its first bytes say: a PDF (signed or scanned), a photo of the signed
// paper, or the container a qualified signature makes (ASiC-E from slovensko.sk's signer, ASiC-S from some others).
import { APP, ENDING } from '../config'
import { now } from '../db'
import { eventStatement } from './store'

/**
 * The power of attorney the client signs (poa), what the accountant hands over when the contract ends (handover),
 * and what the former accountant hands over when a company comes to us (takeover: books, an export, open items).
 */
export type PaperKind = 'poa' | 'handover' | 'takeover'

/** Papers of books, in whatever form an accounting program gives them: downloaded, never shown. */
const isBooks = (kind: PaperKind) => kind === 'handover' || kind === 'takeover'

export interface PaperType {
  ext: string
  type: string
  /** Whether a browser shows it by itself; a signature container is downloaded. */
  inline: boolean
}

const PDF: PaperType = { ext: 'pdf', type: 'application/pdf', inline: true }
const JPEG: PaperType = { ext: 'jpg', type: 'image/jpeg', inline: true }
const PNG: PaperType = { ext: 'png', type: 'image/png', inline: true }
const WEBP: PaperType = { ext: 'webp', type: 'image/webp', inline: true }
const ASICE: PaperType = { ext: 'asice', type: 'application/vnd.etsi.asic-e+zip', inline: false }
const ASICS: PaperType = { ext: 'asics', type: 'application/vnd.etsi.asic-s+zip', inline: false }

const ascii = (bytes: Uint8Array, from: number, length: number) => String.fromCharCode(...bytes.subarray(from, from + length))

/**
 * What a paper is, by its bytes. An ASiC container is a ZIP whose first entry is "mimetype", stored, holding the
 * container's type (ETSI EN 319 162-1): its name stands at byte 30 of the file and its content right after the
 * entry's extra field, which the standard leaves empty (so at byte 38).
 */
export function sniffPaper(bytes: Uint8Array): PaperType | null {
  if (bytes.length < 12) return null
  if (ascii(bytes, 0, 5) === '%PDF-') return PDF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return JPEG
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return PNG
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return WEBP
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04 && bytes.length > 70) {
    const nameLength = (bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)
    const extraLength = (bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)
    if (nameLength !== 8 || ascii(bytes, 30, 8) !== 'mimetype') return null
    const kind = ascii(bytes, 38 + extraLength, 31)
    if (kind === ASICE.type) return ASICE
    if (kind === ASICS.type) return ASICS
  }
  return null
}

const ZIP: PaperType = { ext: 'zip', type: 'application/zip', inline: false }
const XML: PaperType = { ext: 'xml', type: 'application/xml', inline: false }
const TEXT: PaperType = { ext: 'txt', type: 'text/plain', inline: false }
const OLE: PaperType = { ext: 'xls', type: 'application/vnd.ms-excel', inline: false }

/** What an accounting program exports a ZIP as: a spreadsheet or a document of an office suite, or a ZIP itself. */
const ZIPPED = new Set(['zip', 'xlsx', 'docx', 'ods', 'odt', 'asice', 'asics'])

/**
 * What the accountant may hand over, by its bytes: a PDF (the ledgers and statements), a picture of a paper, any ZIP
 * (an export of the accounting program, a spreadsheet), XML, plain text such as CSV, and an old Excel or Word file.
 * The name gives only the ending of a file the bytes have already let in; every one of them is downloaded, never shown.
 */
export function sniffHandover(bytes: Uint8Array, name: string): PaperType | null {
  const ending = name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? ''
  const paper = sniffPaper(bytes)
  if (paper) return paper.inline ? { ...paper, inline: false } : paper
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return ZIPPED.has(ending) ? { ...ZIP, ext: ending } : ZIP
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return ending === 'doc' ? { ...OLE, ext: 'doc', type: 'application/msword' } : OLE
  const head = bytes.subarray(0, 65536)
  if (head.includes(0)) return null
  let textual: string
  try {
    textual = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(head.length < bytes.length ? head.subarray(0, head.lastIndexOf(0x0a) + 1 || head.length) : head)
  } catch {
    // Windows-1250 text, as Slovak programs write CSV: no NUL bytes, and printable.
    textual = String.fromCharCode(...head.subarray(0, 512))
    if (/[\x00-\x08\x0e-\x1f]/.test(textual)) return null
  }
  if (/^\uFEFF?\s*</.test(textual)) return XML
  return ending === 'csv' ? { ...TEXT, ext: 'csv', type: 'text/csv' } : TEXT
}

export function paperTypeOf(type: string): PaperType | null {
  return [PDF, JPEG, PNG, WEBP, ASICE, ASICS].find((t) => t.type === type) ?? null
}

export interface Paper {
  id: string
  kind: PaperKind
  createdAt: number
  createdBy: string | null
  createdByName: string | null
  fileName: string
  fileType: string
  fileSize: number
  r2Key: string
  checkedAt: number | null
  checkedByName: string | null
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

function paperOf(row: Row): Paper {
  return {
    id: String(row.id),
    kind: row.kind === 'handover' ? 'handover' : row.kind === 'takeover' ? 'takeover' : 'poa',
    createdAt: Number(row.created_at ?? 0),
    createdBy: str(row.created_by),
    createdByName: str(row.created_by_name),
    fileName: String(row.file_name),
    fileType: String(row.file_type),
    fileSize: Number(row.file_size ?? 0),
    r2Key: String(row.r2_key),
    checkedAt: typeof row.checked_at === 'number' ? row.checked_at : null,
    checkedByName: str(row.checked_by_name),
  }
}

/** A company's papers of one kind, the newest first. */
export async function papersOf(db: D1Database, company: string, kind: PaperKind): Promise<Paper[]> {
  const rows = await db
    .prepare(
      `SELECT f.*, cb.name AS created_by_name, kb.name AS checked_by_name
       FROM company_files f LEFT JOIN users cb ON cb.id = f.created_by LEFT JOIN users kb ON kb.id = f.checked_by
       WHERE f.company_id = ? AND f.kind = ? AND f.deleted_at IS NULL ORDER BY f.created_at DESC, f.rowid DESC LIMIT 20`,
    )
    .bind(company, kind)
    .all<Row>()
  return rows.results.map(paperOf)
}

export async function getPaper(db: D1Database, company: string, id: string): Promise<Paper | null> {
  const row = await db
    .prepare(
      `SELECT f.*, cb.name AS created_by_name, kb.name AS checked_by_name
       FROM company_files f LEFT JOIN users cb ON cb.id = f.created_by LEFT JOIN users kb ON kb.id = f.checked_by
       WHERE f.id = ? AND f.company_id = ? AND f.deleted_at IS NULL`,
    )
    .bind(id, company)
    .first<Row>()
  return row ? paperOf(row) : null
}

/** Where the power of attorney stands: none yet, one that waits for our check, or one we checked. */
export type PoaState = 'missing' | 'waiting' | 'checked'

export function poaStateOf(papers: Paper[]): PoaState {
  if (papers.some((p) => p.checkedAt !== null)) return 'checked'
  return papers.length > 0 ? 'waiting' : 'missing'
}

/** The same as SQL over a company aliased c, for lists. */
export const POA_STATE_SQL = `CASE WHEN EXISTS (SELECT 1 FROM company_files f WHERE f.company_id = c.id AND f.kind = 'poa' AND f.deleted_at IS NULL AND f.checked_at IS NOT NULL) THEN 'checked'
  WHEN EXISTS (SELECT 1 FROM company_files f WHERE f.company_id = c.id AND f.kind = 'poa' AND f.deleted_at IS NULL) THEN 'waiting' ELSE 'missing' END`

export interface NewPaper {
  name: string
  bytes: Uint8Array
}

export type Kept = { ok: true; paper: { id: string; name: string; type: PaperType } } | { ok: false; reason: 'none' | 'large' | 'type' | 'many' | 'storage' }

/**
 * Keeps one paper of a company: the file in R2 first, then its row and the event in one batch, with whatever the
 * caller adds to it for that paper (the note to the team). A file that is not a paper of the kinds above is refused
 * by its bytes, and a company keeps twenty of a kind at most.
 */
export async function keepPaper(
  db: D1Database,
  files: R2Bucket | undefined,
  who: { company: string; user: string },
  kind: PaperKind,
  file: NewPaper | null,
  extra: (paper: { id: string; name: string }) => D1PreparedStatement[] = () => [],
): Promise<Kept> {
  if (!file || file.bytes.byteLength === 0) return { ok: false, reason: 'none' }
  if (file.bytes.byteLength > APP.fileBytes) return { ok: false, reason: 'large' }
  const type = isBooks(kind) ? sniffHandover(file.bytes, file.name) : sniffPaper(file.bytes)
  if (!type) return { ok: false, reason: 'type' }
  if (!files) return { ok: false, reason: 'storage' }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM company_files WHERE company_id = ? AND kind = ? AND deleted_at IS NULL').bind(who.company, kind).first<{ n: number }>()
  if ((count?.n ?? 0) >= (isBooks(kind) ? ENDING.handoverFiles : 20)) return { ok: false, reason: 'many' }
  const id = crypto.randomUUID()
  const key = `companies/${who.company}/papers/${id}.${type.ext}`
  const base = file.name.replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/[^\p{L}\p{N} ._-]/gu, '_').trim().slice(0, 80) || (isBooks(kind) ? 'uctovnictvo' : 'plna-moc')
  const name = `${base}.${type.ext}`
  await files.put(key, file.bytes, { httpMetadata: { contentType: type.type } })
  try {
    await db.batch([
      db
        .prepare('INSERT INTO company_files (id, company_id, kind, created_at, created_by, file_name, file_type, file_size, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, who.company, kind, now(), who.user, name, type.type, file.bytes.byteLength, key),
      eventStatement(db, { company: who.company, user: who.user, action: `${kind}.added`, subject: id, detail: { type: type.ext } }),
      ...extra({ id, name }),
    ])
  } catch (error) {
    // This UUID belongs only to this upload. An interrupted answer may hide a batch that did commit: the file is
    // deleted only when no row names it, so a kept paper never loses its original.
    const used = await db.prepare('SELECT 1 AS x FROM company_files WHERE r2_key = ?').bind(key).first().catch(() => true)
    if (!used) await files.delete(key)
    throw error
  }
  return { ok: true, paper: { id, name, type } }
}

/**
 * A whole upload of books looked at before any of it is kept: one file that cannot be taken, or more files than a
 * company keeps, holds every file back. An upload is all or nothing, so nobody sends the same files twice to finish it.
 */
export async function booksRefused(db: D1Database, company: string, kind: 'handover' | 'takeover', files: File[]): Promise<'none' | 'large' | 'type' | 'many' | null> {
  if (files.length === 0) return 'none'
  for (const file of files) {
    if (file.size > APP.fileBytes) return 'large'
    if (!sniffHandover(new Uint8Array(await file.arrayBuffer()), file.name || '')) return 'type'
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM company_files WHERE company_id = ? AND kind = ? AND deleted_at IS NULL').bind(company, kind).first<{ n: number }>()
  return (count?.n ?? 0) + files.length > ENDING.handoverFiles ? 'many' : null
}

/** Marks a paper as checked by somebody of the team, once. */
export function checkPaperStatement(db: D1Database, company: string, id: string, user: string): D1PreparedStatement {
  return db.prepare('UPDATE company_files SET checked_at = ?, checked_by = ? WHERE id = ? AND company_id = ? AND checked_at IS NULL').bind(now(), user, id, company)
}

/** A paper's file as an answer: shown when a browser can show it safely, downloaded when it is a signature container. */
export async function paperResponse(files: R2Bucket | undefined, paper: Paper): Promise<Response | null> {
  const object = files ? await files.get(paper.r2Key) : null
  if (!object) return null
  // What the accountant hands over is downloaded, whatever it is; a power of attorney is shown when a browser can.
  const type = isBooks(paper.kind) ? null : paperTypeOf(paper.fileType)
  const inline = type?.inline ?? false
  const name = paper.fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_')
  const pdf = paper.fileType === 'application/pdf'
  return new Response(object.body, {
    headers: {
      'Content-Type': inline ? paper.fileType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': pdf ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'X-Frame-Options': pdf ? 'SAMEORIGIN' : 'DENY',
    },
  })
}

/** Retire from normal access while keeping the original and its provenance until controlled company retention. */
export function retirePaperStatements(db: D1Database, company: string, id: string, user: string): D1PreparedStatement[] {
  const ts = now(), nonce = crypto.randomUUID()
  return [
    db.prepare("UPDATE company_files SET deleted_at = ?1, deleted_by = ?2, retire_nonce = ?3 WHERE id = ?4 AND company_id = ?5 AND kind = 'handover' AND deleted_at IS NULL").bind(ts, user, nonce, id, company),
    db.prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail)
      SELECT ?1, company_id, ?2, 'handover.removed', id, json_object('fileName', file_name, 'r2Key', r2_key, 'retainedUntilControlledPurge', 1)
      FROM company_files WHERE id = ?4 AND company_id = ?5 AND retire_nonce = ?3`).bind(ts, user, nonce, id, company),
  ]
}
