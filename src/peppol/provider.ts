// The certified postman behind Firmony's e-invoices (26 October 2026). The person sees one app: an invoice is sent
// through the Peppol network by a click on its page, its state follows by itself, and what the network delivers to
// the company lands among its documents. The postman, a certified provider of the delivery service, is the highway
// underneath: one adapter per provider, chosen by the Worker's settings, so the app never depends on whose it is.
//
// Until europio has a contract with a provider (his step: an intermediary agreement and its API), no adapter is
// configured on the live Worker and the app says that sending through Firmony starts before 1 January 2027; the public
// lookup of who can receive (participant.ts) works already. The reference adapter below speaks the small protocol the
// app needs and is what the tests and the playground run against; a real provider's adapter maps its API onto it.
import { BIS } from './participant'

export type SendKind = 'invoice' | 'credit'

export interface OutMessage {
  /** Ours, also the idempotency key: the same sending asked twice is one e-invoice. */
  id: string
  sender: string
  receiver: string
  kind: SendKind
  xml: string
}

export type SendOutcome = { ok: true; ref: string } | { ok: false; retry: boolean; reason: string }

export type ProviderEvent =
  | { type: 'status'; ref: string; state: 'delivered' | 'rejected'; reason: string | null }
  | { type: 'received'; ref: string; sender: string | null; receiver: string; xml: string }

export interface PeppolProvider {
  name: string
  /** The host of the provider's SMP, as the SML's record names it: tells a company registered with us from one elsewhere. */
  smpHost: string | null
  send(message: OutMessage): Promise<SendOutcome>
  /** The events of a notice the provider sent us, its signature checked; null when it is not the provider's. */
  events(request: Request, body: string): Promise<ProviderEvent[] | null>
}

export interface PeppolEnv {
  /** Which adapter: unset on the live Worker until a contract exists. */
  PEPPOL_PROVIDER?: string
  PEPPOL_API_URL?: string
  PEPPOL_API_KEY?: string
  /** The secret the provider signs its notices with. */
  PEPPOL_WEBHOOK_SECRET?: string
  PEPPOL_SMP_HOST?: string
}

const enc = new TextEncoder()

function base64(text: string): string {
  const bytes = enc.encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): string | null {
  try {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return null
  }
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Equal in constant time for strings of one length. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** "t=<unix seconds>,v1=<hex HMAC-SHA256 of t.body>", at most five minutes old. */
export async function signatureValid(header: string | null, body: string, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > 300 || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '')) return false
  return same(await hmacHex(secret, `${t}.${body}`), parts.v1 ?? '')
}

export async function signatureOf(body: string, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${nowSeconds},v1=${await hmacHex(secret, `${nowSeconds}.${body}`)}`
}

const PARTICIPANT = /^\d{4}:[A-Za-z0-9._-]{1,50}$/

/** What a notice says, each event checked; anything malformed is left out. */
export function eventsOf(json: unknown): ProviderEvent[] {
  const list = json && typeof json === 'object' && Array.isArray((json as { events?: unknown }).events) ? ((json as { events: unknown[] }).events) : []
  const out: ProviderEvent[] = []
  for (const raw of list.slice(0, 100)) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const ref = typeof e.id === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(e.id) ? e.id : null
    if (!ref) continue
    if (e.type === 'status' && (e.state === 'delivered' || e.state === 'rejected')) {
      out.push({ type: 'status', ref, state: e.state, reason: typeof e.reason === 'string' ? e.reason.replace(/[\u0000-\u001f]/g, ' ').slice(0, 500) : null })
    } else if (e.type === 'received' && typeof e.receiver === 'string' && PARTICIPANT.test(e.receiver) && typeof e.document === 'string' && e.document.length <= 14_000_000) {
      const xml = fromBase64(e.document)
      if (xml) out.push({ type: 'received', ref, sender: typeof e.sender === 'string' && PARTICIPANT.test(e.sender) ? e.sender : null, receiver: e.receiver, xml })
    }
  }
  return out
}

/** The reference adapter: the protocol the app needs, over HTTPS with a bearer key. */
function referenceProvider(name: string, url: string, key: string, secret: string, smpHost: string | null, fetcher: typeof fetch): PeppolProvider {
  return {
    name,
    smpHost,
    async send(m) {
      try {
        const response = await fetcher(`${url}/v1/documents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'idempotency-key': m.id, 'content-type': 'application/json' },
          body: JSON.stringify({ sender: m.sender, receiver: m.receiver, documentType: BIS[m.kind], process: BIS.process, document: base64(m.xml) }),
          signal: AbortSignal.timeout(15_000),
        })
        const text = (await response.text()).slice(0, 4096)
        let body: Record<string, unknown> = {}
        try {
          body = JSON.parse(text) as Record<string, unknown>
        } catch {
          body = {}
        }
        if (response.ok && typeof body.id === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(body.id)) return { ok: true, ref: body.id }
        const reason = typeof body.error === 'string' ? body.error.slice(0, 300) : `HTTP ${response.status}`
        // The network or the provider may recover; a document it refused will not.
        return { ok: false, retry: response.status === 429 || response.status >= 500 || response.ok, reason }
      } catch (err) {
        return { ok: false, retry: true, reason: err instanceof Error ? err.name : 'error' }
      }
    },
    async events(request, body) {
      if (!(await signatureValid(request.headers.get('x-peppol-signature'), body, secret))) return null
      try {
        return eventsOf(JSON.parse(body))
      } catch {
        return []
      }
    },
  }
}

/** The configured postman, or null: then nothing is sent through Firmony and the app says so. */
export function providerOf(env: PeppolEnv, fetcher: typeof fetch = fetch): PeppolProvider | null {
  const name = env.PEPPOL_PROVIDER
  const url = (env.PEPPOL_API_URL ?? '').replace(/\/+$/, '')
  const key = env.PEPPOL_API_KEY ?? ''
  const secret = env.PEPPOL_WEBHOOK_SECRET ?? ''
  if (!name || !url || !key || secret.length < 32) return null
  let host: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    host = parsed.hostname
  } catch {
    return null
  }
  // The reference adapter talks only to a pretend postman of the tests and the playground. A real provider gets an
  // adapter of its own here, by its name, once its API is in a contract.
  if (name === 'pretend' && host.endsWith('.test')) return referenceProvider(name, url, key, secret, env.PEPPOL_SMP_HOST?.toLowerCase() ?? null, fetcher)
  return null
}
