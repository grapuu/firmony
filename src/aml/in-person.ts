// Identification verified in person (programme 4.2 c), § 8 ods. 1 písm. a) of Act 297/2008, read in the original on
// 21 October 2026: https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html): the designated person compares the
// declaration's data with the identity document and the person's likeness with its photo, at a meeting. The copy of the
// document he makes (§ 19 ods. 5: legible, the photo good enough to compare the likeness) is kept with the dossier for
// the same five years as the rest of it, under the order's own files, which go only with the whole record.
// Schema step 91 (29 October 2026, his word of 23:29 and 23:33: a client won at a meeting, simply and without errors).
import { sniffPaper } from '../app/papers'
import { now } from '../db'
import { textDay } from '../app/booking'
import { bratislavaClock, bratislavaDay } from '../time'
import type { User } from '../app/store'
import type { DossierView } from './model'
import { bytesHash } from './store'

export interface InPerson {
  id: number
  dossier_id: string
  verified_at: number
  verified_by: string
  facts_hash: string
  front_key: string
  front_type: string
  front_sha256: string
  front_bytes: number
  back_key: string | null
  back_type: string | null
  back_sha256: string | null
  back_bytes: number | null
  note: string
  by_name?: string | null
}

/** The newest in-person identification of a dossier, or null. */
export async function inPersonOf(db: D1Database, dossier: string): Promise<InPerson | null> {
  return db.prepare('SELECT p.*, u.name AS by_name FROM aml_in_person p LEFT JOIN users u ON u.id = p.verified_by WHERE p.dossier_id = ? ORDER BY p.id DESC LIMIT 1').bind(dossier).first<InPerson>()
}

/** A photo of the document, one side: a picture or a PDF by its bytes, up to 10 MB, as the founding takes it. */
export const ID_COPY_BYTES = 10 * 1024 * 1024
const COPY_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
export async function idCopy(file: unknown): Promise<{ bytes: Uint8Array; type: string; ext: string; sha256: string } | 'missing' | 'type' | 'size'> {
  if (!(file instanceof File) || file.size === 0) return 'missing'
  if (file.size > ID_COPY_BYTES) return 'size'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffPaper(bytes)
  if (!kind || !COPY_TYPES.has(kind.type)) return 'type'
  return { bytes, type: kind.type, ext: kind.ext, sha256: await bytesHash(bytes) }
}

const ID_WORDS: Record<string, string> = { op: 'občiansky preukaz', pas: 'cestovný pas', iny: 'doklad totožnosti' }
/** "******456": the end of a number, as the rest of the app shows a document's number. */
const tail = (value: string) => (value.length > 3 ? `${'*'.repeat(Math.min(value.length - 3, 6))}${value.slice(-3)}` : value)

/**
 * Records the identification verified in person and, in the same batch, the identity check it stands for: the copy of
 * the document first (R2, under the order), then the record and the check, the check only when the record was written.
 * An identity card has two sides, a passport one. Only the newest dossier of an open order, by the designated person
 * (the trigger of step 91 and those of step 73 hold it even if this code were wrong).
 */
export async function recordInPerson(db: D1Database, files: R2Bucket, user: User, view: DossierView,
  input: { hash: string; front: Awaited<ReturnType<typeof idCopy>>; back: Awaited<ReturnType<typeof idCopy>>; compared: boolean }): Promise<'ok' | 'stale' | 'compared' | 'front' | 'back' | 'type' | 'size'> {
  const d = view.dossier
  if (!d.order_id || input.hash !== d.facts_hash) return 'stale'
  if (!input.compared) return 'compared'
  const passport = view.declaration.director.idKind === 'pas'
  for (const [side, copy] of [['front', input.front], ['back', input.back]] as const) {
    if (copy === 'type' || copy === 'size') return copy
    if (copy === 'missing' && (side === 'front' || !passport)) return side
  }
  const front = input.front as Exclude<typeof input.front, string>
  const back = typeof input.back === 'string' ? null : input.back
  const at = now()
  const key = (side: string, ext: string) => `onboarding/${d.order_id}/doklad/${d.id}-${side}-${crypto.randomUUID()}.${ext}`
  const frontKey = key('predna', front.ext)
  const backKey = back ? key('zadna', back.ext) : null
  await files.put(frontKey, front.bytes, { httpMetadata: { contentType: front.type } })
  if (back && backKey) await files.put(backKey, back.bytes, { httpMetadata: { contentType: back.type } })
  const director = view.declaration.director
  const note = `Osobne za fyzickej prítomnosti (§ 8 ods. 1 písm. a) zákona č. 297/2008 Z. z.) dňa ${textDay(bratislavaDay(at))} o ${bratislavaClock(at)}: údaje z vyhlásenia (meno, ${director.birthNumber ? 'rodné číslo' : 'dátum narodenia'}, číslo dokladu) porovnané s dokladom ${ID_WORDS[director.idKind] ?? 'totožnosti'} č. ${tail(director.idNumber.replace(/\s/g, ''))} a podoba osoby s fotografiou v ňom. Kópia ${back ? 'oboch strán' : 'dokladu'} je v spise.`
  try {
    const [record, check] = await db.batch([
      db.prepare(`INSERT INTO aml_in_person (dossier_id,verified_at,verified_by,facts_hash,front_key,front_type,front_sha256,front_bytes,back_key,back_type,back_sha256,back_bytes,note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(d.id, at, user.id, d.facts_hash, frontKey, front.type, front.sha256, front.bytes.length, backKey, back?.type ?? null, back?.sha256 ?? null, back?.bytes.length ?? null, note),
      db.prepare(`INSERT INTO aml_checks (dossier_id,kind,result,checked_at,checked_by,source,subject_name,facts_hash)
        SELECT ?1,'identity','clear',?2,?3,?4,d.signer_name,d.facts_hash FROM aml_dossiers d
        WHERE d.id = ?1 AND d.facts_hash = ?5 AND EXISTS (SELECT 1 FROM aml_in_person p WHERE p.front_key = ?6 AND p.dossier_id = ?1)`).bind(d.id, at, user.id, note, d.facts_hash, frontKey),
    ])
    if ((record?.meta.changes ?? 0) > 0 && (check?.meta.changes ?? 0) > 0) return 'ok'
  } catch {
    // A trigger refused it (the dossier is no longer the newest, the officer changed): nothing was written.
  }
  // The copy is kept only with its record: an identity document nobody points to is not left in the store.
  if (!(await db.prepare('SELECT 1 AS x FROM aml_in_person WHERE front_key = ?').bind(frontKey).first().catch(() => true))) {
    await files.delete([frontKey, ...(backKey ? [backKey] : [])]).catch(() => undefined)
  }
  return 'stale'
}

/** Whether the copies the record points to are still the ones written (their size and SHA-256). */
export async function inPersonIntact(files: R2Bucket | undefined, p: InPerson): Promise<boolean> {
  if (!files) return false
  for (const [key, bytes, sha] of [[p.front_key, p.front_bytes, p.front_sha256], [p.back_key, p.back_bytes, p.back_sha256]] as const) {
    if (!key) continue
    const object = await files.get(key)
    if (!object || object.size !== bytes || await bytesHash(new Uint8Array(await object.arrayBuffer())) !== sha) return false
  }
  return true
}

