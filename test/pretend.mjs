// Stand-ins for the outside world, shared by the runtime test and the playground: Cloudflare's email service as a
// Worker of its own (it keeps every message and hands the list back over fetch), and the Register of Legal
// Entities, which knows europio s. r. o. (the answer seen on 12 October 2026), knows nobody else, and fails for
// one number so that a failure can be looked at.
import { readFileSync } from 'node:fs'

export const PRETEND_MAIL = `
import { WorkerEntrypoint } from 'cloudflare:workers'
const sent = []
export default class extends WorkerEntrypoint {
  async send(message) {
    if (typeof message.to !== 'string' || !message.subject || !message.text) throw Object.assign(new Error('not a message'), { code: 'E_VALIDATION_ERROR' })
    sent.push({ to: message.to, from: message.from, replyTo: message.replyTo, subject: message.subject, text: message.text })
    return { messageId: 'pretend-' + sent.length }
  }
  async fetch() {
    return Response.json(sent)
  }
}
`

const europio = readFileSync(new URL('./fixtures/rpo-europio.json', import.meta.url), 'utf8')

/** The register's answer for a request the Worker sends, or null when the request is not for the register. */
export function registerAnswer(url, calls = []) {
  if (!url.startsWith('https://api.statistics.sk/rpo/v1/search')) return null
  const ico = new URL(url).searchParams.get('identifier')
  calls.push(ico)
  if (ico === '57442452') return new Response(europio, { headers: { 'content-type': 'application/json' } })
  if (ico === '35757442') return new Response('busy', { status: 503 })
  return Response.json({ results: [], license: 'CC BY 4.0' })
}
