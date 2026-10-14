// Email to a company's address for documents (doklady-<code>@ the domain): what Dext and Pennylane give every
// client, so that an invoice that arrives by email is forwarded once and never has to be downloaded and uploaded.
// Cloudflare's Email Routing hands the Worker every message of its catch-all rule; the public mailbox has a rule of
// its own and never comes here. Anybody may write to the address (a supplier can be given it), so what comes is
// checked like an upload, counted per day, and an email without a document leaves a short note for the client.
import PostalMime from 'postal-mime'
import { APP, BRAND } from '../config'
import { now, withinLimit } from '../db'
import { flushOutbox } from '../mail'
import { app as t } from './copy'
import { intakeOpen } from './ending'
import { keepFilesFor, type NewFile } from './intake'
import { sniff } from './read'
import type { AppBindings } from './routes'
import { COMPANY_COLUMNS, companyOf, eventStatement, messageStatement, type Company } from './store'

type Row = Record<string, unknown>

/** The company whose address an email was sent to, from the address alone. */
export async function companyOfAddress(db: D1Database, to: string): Promise<Company | null> {
  const domain = BRAND.email.split('@')[1]?.toLowerCase()
  const m = new RegExp(`^${APP.inboxPrefix}([a-z0-9]{6,12})@(.+)$`).exec(to.trim().toLowerCase())
  if (!m || m[2] !== domain) return null
  const row = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.inbox = ? AND c.closed_at IS NULL`).bind(m[1]).first<Row>()
  return row ? companyOf(row) : null
}

export interface Mail {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream | ArrayBuffer | Uint8Array
  setReject(reason: string): void
}

export type Received = 'unknown' | 'ended' | 'too-large' | 'too-many' | 'unreadable' | 'added' | 'known' | 'empty' | 'statement'

/** Takes the documents of one email. What has to be read afterwards is handed to `later`. */
export async function receiveMail(env: AppBindings, mail: Mail, later: (work: Promise<unknown>) => void): Promise<Received> {
  const db = env.DB
  const company = await companyOfAddress(db, mail.to)
  if (!company) {
    mail.setReject('Táto adresa neexistuje.')
    return 'unknown'
  }
  // Ten days past the contract's last day the address takes nothing more (point 10.4 of the terms).
  if (!intakeOpen(company, new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date()))) {
    mail.setReject('Zmluva s Firmony skončila a doklady už neprijímame.')
    return 'ended'
  }
  if (mail.rawSize > APP.mailBytes) {
    mail.setReject('E-mail je príliš veľký. Pošlite doklady po jednom alebo ich pridajte v aplikácii.')
    return 'too-large'
  }
  const taken = await db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND source = 'email' AND created_at > ?")
    .bind(company.id, now() - 86400)
    .first<{ n: number }>()
  if ((taken?.n ?? 0) >= APP.mailFilesPerDay) {
    mail.setReject('Dnes sme z e-mailov prijali priveľa dokladov. Pridajte ich v aplikácii.')
    return 'too-many'
  }
  let email
  try {
    const raw = mail.raw instanceof ReadableStream ? await new Response(mail.raw).arrayBuffer() : mail.raw
    email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' })
  } catch {
    await db.batch([inboundStatement(db, company.id, mail.from, null, 0, 'unreadable')])
    return 'unreadable'
  }
  const sender = (email.from && 'address' in email.from && email.from.address) || mail.from
  const subject = (email.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const files: NewFile[] = []
  for (const [i, attachment] of email.attachments.entries()) {
    if (attachment.related) continue
    const content = attachment.content
    const bytes = content instanceof Uint8Array ? content : content instanceof ArrayBuffer ? new Uint8Array(content) : new TextEncoder().encode(content)
    if (bytes.length === 0 || bytes.length > APP.fileBytes) continue
    const kind = sniff(bytes)
    if (!kind) continue
    // A logo in a signature is no document.
    if (kind !== 'pdf' && kind !== 'xml' && bytes.length < APP.mailImageMin) continue
    files.push({ name: (attachment.filename ?? `priloha-${i + 1}`).replace(/[\r\n]/g, ' ').slice(0, 120), kind, bytes })
    if (files.length >= APP.filesAtOnce) break
  }
  if (files.length === 0) {
    const statements = [inboundStatement(db, company.id, sender, subject, 0, 'empty')]
    // The client hears of it, a few times a day at most: the address may be written to by anybody.
    if (await withinLimit(db, 'mail-note', company.id, APP.mailNotesPerDay, 86400)) {
      statements.push(messageStatement(db, { id: crypto.randomUUID(), company: company.id, author: null, side: 'firmony', payment: null, body: t.inbox.noFiles(subject || t.inbox.noSubject, sender) }))
    }
    await db.batch(statements)
    return 'empty'
  }
  const { kept, work } = await keepFilesFor(env, company, { user: null, source: 'email', sender }, files, null)
  // A statement the bank sends every day is the bank, not a document: said so in the record of what came.
  const outcome: Received = kept.added > 0 ? 'added' : kept.statements.statements > 0 ? 'statement' : 'known'
  await db.batch([
    inboundStatement(db, company.id, sender, subject, kept.added, outcome),
    eventStatement(db, {
      company: company.id,
      user: null,
      action: 'mail.received',
      detail: { files: files.length, added: kept.added, known: kept.known.length, statements: kept.statements.statements },
    }),
  ])
  if (work) later(work)
  // A statement that waits for the owner or the accountant rings now, not with the next run of the schedule.
  if (kept.statements.confirm + kept.statements.held > 0) later(flushOutbox(db, env.EMAIL))
  return outcome
}

function inboundStatement(db: D1Database, company: string, sender: string | null, subject: string | null, files: number, status: Received): D1PreparedStatement {
  return db
    .prepare('INSERT INTO inbound_mail (id, company_id, received_at, sender, subject, files, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), company, now(), sender?.slice(0, 200) ?? null, subject, files, status)
}
