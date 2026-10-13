// What comes in: files a client adds on a page, and the attachments of email forwarded to a company's address
// for documents. Each is checked by what its bytes are, kept once (the same file twice is one document), written
// down, and read: an e-invoice at once by our own code, a photo or a PDF by the reader after the answer.
import type { AppBindings } from './routes'
import { FILE_TYPES, fileHash, readDocument, sniff, type FileKind } from './read'
import {
  afterReading,
  documentByHash,
  eventStatement,
  insertDocumentStatement,
  linkStatement,
  manualStatement,
  matchCompany,
  readingStatement,
  type Company,
  type DocSource,
} from './store'
import { readInvoice, type Reading } from './xml'

export const EXTENSIONS: Record<FileKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic', pdf: 'pdf', xml: 'xml' }

export interface NewFile {
  name: string
  kind: FileKind
  bytes: Uint8Array
}

export interface Kept {
  added: number
  /** Names of files that were sent before. */
  known: string[]
  /** The new documents. */
  ids: string[]
}

/**
 * Keeps files and writes the documents down; a document sent on a payment's page belongs to that payment. A file
 * that was sent before is not kept twice: on a payment's page the document we have is given to it. What has to be
 * read is handed back as work to do after the answer.
 */
export async function keepFilesFor(
  env: AppBindings,
  company: Company,
  by: { user: string | null; source: Extract<DocSource, 'upload' | 'email'> },
  files: NewFile[],
  payment: string | null,
): Promise<{ kept: Kept; work: Promise<void> | null }> {
  const db = env.DB
  const bucket = env.FILES
  const kept: Kept = { added: 0, known: [], ids: [] }
  if (!bucket) return { kept, work: null }
  const toRead: string[] = []
  const readNow: string[] = []
  const statements: D1PreparedStatement[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const hash = await fileHash(file.bytes)
    const existing = seen.has(hash) ? 'this-request' : await documentByHash(db, company.id, hash)
    if (existing) {
      if (payment && existing !== 'this-request') statements.push(linkStatement(db, company.id, payment, existing, 'client', by.user))
      else kept.known.push(file.name)
      continue
    }
    seen.add(hash)
    const id = crypto.randomUUID()
    const key = `companies/${company.id}/documents/${id}.${EXTENSIONS[file.kind]}`
    await bucket.put(key, file.bytes, { httpMetadata: { contentType: FILE_TYPES[file.kind] } })
    let reading: Reading | null = null
    let status: 'reading' | 'read' | 'manual' = 'reading'
    let readBy: string | null = null
    if (file.kind === 'xml') {
      reading = readInvoice(new TextDecoder().decode(file.bytes), company.ico)
      status = reading ? 'read' : 'manual'
      readBy = reading ? 'xml' : 'person: not an invoice'
      if (reading) readNow.push(id)
    } else toRead.push(id)
    statements.push(
      insertDocumentStatement(db, { id, company: company.id, source: by.source, addedBy: by.user, fileKey: key, fileType: FILE_TYPES[file.kind], fileName: file.name, fileBytes: file.bytes.length, fileHash: hash, reading, readBy, status }),
      eventStatement(db, { company: company.id, user: by.user, action: 'document.added', subject: id, detail: { kind: file.kind, bytes: file.bytes.length, payment, source: by.source } }),
    )
    if (payment) statements.push(linkStatement(db, company.id, payment, id, 'client', by.user))
    kept.added++
    kept.ids.push(id)
  }
  if (statements.length > 0) await db.batch(statements)
  for (const id of readNow) await afterReading(db, company.id, id)
  const work = kept.added > 0 ? readAll(env, company, toRead, payment === null || files.some((f) => f.kind === 'xml')) : null
  return { kept, work }
}

/** Has every new document read, then pairs what can be paired. */
export async function readAll(env: AppBindings, company: Company, ids: string[], match: boolean): Promise<void> {
  for (const id of ids) await readOne(env, company, id)
  if (match || ids.length > 0) await matchCompany(env.DB, company.id)
}

export async function readOne(env: AppBindings, company: Company, id: string): Promise<void> {
  const db = env.DB
  const row = await db.prepare("SELECT file_key, file_type FROM documents WHERE id = ? AND company_id = ? AND status = 'reading' AND deleted_at IS NULL").bind(id, company.id).first<{ file_key: string | null; file_type: string | null }>()
  if (!row) return
  await db.prepare('UPDATE documents SET read_tries = read_tries + 1 WHERE id = ?').bind(id).run()
  const object = row.file_key && env.FILES ? await env.FILES.get(row.file_key) : null
  if (!object) {
    await db.batch([manualStatement(db, company.id, id, 'no file')])
    return
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  const kind = sniff(bytes)
  const result = kind ? await readDocument(env.ANTHROPIC_API_KEY, { kind, bytes }, company) : { manual: 'unknown file' }
  if ('reading' in result) {
    await db.batch([readingStatement(db, company.id, id, result.reading, result.by), eventStatement(db, { company: company.id, user: null, action: 'document.read', subject: id, detail: { by: result.by } })])
    await afterReading(db, company.id, id)
  } else await db.batch([manualStatement(db, company.id, id, result.manual), eventStatement(db, { company: company.id, user: null, action: 'document.manual', subject: id, detail: { why: result.manual } })])
}
