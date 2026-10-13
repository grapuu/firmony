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

/** Today in Bratislava, moved by a number of days, as YYYY-MM-DD. */
function bratislavaDay(shift = 0) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(Date.now() + shift * 86400000))
}

/**
 * Anthropic's API as the reader of documents: whatever picture it is shown, it reads yesterday's receipt from a
 * café for 12,40 €, which is what the sample company paid by card yesterday. A request without the key's header
 * or for another model's tool is refused as the real API would.
 */
export async function readerAnswer(request, calls = []) {
  if (!request.url.startsWith('https://api.anthropic.com/')) return null
  const body = await request.json().catch(() => null)
  calls.push(body)
  if (!request.headers.get('x-api-key')) return Response.json({ type: 'error', error: { type: 'authentication_error' } }, { status: 401 })
  const tool = body?.tools?.[0]?.name
  return Response.json({
    id: 'msg_pretend',
    type: 'message',
    role: 'assistant',
    model: body?.model,
    content: [
      {
        type: 'tool_use',
        id: 'toolu_pretend',
        name: tool,
        input: { je_doklad: true, typ: 'blocek', druha_strana: 'Kaviareň Na rohu s. r. o.', ico_druhej_strany: '50123456', datum_vystavenia: bratislavaDay(-1), suma_celkom: '12.40', dph_celkom: '2.07', mena: 'EUR' },
      },
    ],
    stop_reason: 'tool_use',
  })
}
