// The one address Mony answers at (assistant/mony.ts): POST /app/mony with the question, the conversation of the tab
// and the page. It is the session that says who asks, never the browser: a client gets a client's knowledge, somebody
// of the team the team's, and only after the team's passkey of the last 12 hours.
import type { Context } from 'hono'
import { currentWho } from '../app/session'
import { eventStatement } from '../app/store'
import { ensureSchema, withinLimit } from '../db'
import { securityGate } from '../security/routes'
import { MONY, answerStream, monyFor, pageOf, pickSections, sectionsFor, systemOf, turnsOf, type MonyAudience } from './mony'

type Env = { Bindings: { DB: D1Database; ANTHROPIC_API_KEY?: string } }

const said = (c: Context, message: string, status: 400 | 401 | 403 | 409 | 429 | 503) =>
  c.json({ error: message }, status, { 'Cache-Control': 'no-store' })

export async function monyAnswer(c: Context<Env>): Promise<Response> {
  const db = c.env.DB
  await ensureSchema(db)
  const who = await currentWho(c, db)
  if (!who) return said(c, 'Prihláste sa, prosím, znova.', 401)
  const audience: MonyAudience = monyFor({ ANTHROPIC_API_KEY: 'any' }, who.user) ?? 'client'
  if (audience === 'client' && (!who.company || !who.role)) return said(c, 'Prihláste sa, prosím, znova.', 401)
  // The team's side asks for its passkey of the last 12 hours, as every page of it does.
  if (audience !== 'client' && (await securityGate(c, who))) return said(c, 'Potvrďte prístup prihlasovacím kľúčom a skúste to znova.', 401)
  const key = c.env.ANTHROPIC_API_KEY
  const control = await db.prepare('SELECT enabled FROM assistant_control WHERE id = 1').first<{ enabled: number }>()
  if (!key || control?.enabled !== 1) return said(c, `${MONY.name} je teraz vypnutá. Napíšte nám do Správ.`, 503)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return said(c, 'Napíšte otázku.', 400)
  if (question.length > MONY.questionChars) return said(c, `Otázka je dlhá. Skráťte ju, prosím, na ${MONY.questionChars} znakov.`, 400)
  const turns = turnsOf(body?.history)
  const page = pageOf(body?.page)

  const company = audience === 'client' ? (who.company?.id ?? null) : null
  if (
    !(await withinLimit(db, 'mony-user', who.user.id, MONY.perDay[audience], 86_400)) ||
    (company && !(await withinLimit(db, 'mony-company', company, MONY.perCompany, 86_400))) ||
    !(await withinLimit(db, 'mony-all', 'all', MONY.all, 86_400))
  )
    return said(c, `Dnes ste sa už pýtali veľa. ${MONY.name} odpovie zase zajtra, dovtedy nám napíšte do Správ.`, 429)

  const started = Date.now()
  const picked = await pickSections(key, audience, page, turns, question)
  if (!picked) return said(c, `${MONY.name} teraz neodpovedá. Skúste to o chvíľu.`, 503)
  const sections = sectionsFor(audience, picked.ids)
  const system = systemOf(audience, page, Boolean(who.company?.invoicingOnly), sections)
  const stream = await answerStream(key, system, turns, question, async (usage) => {
    // The cost of the answer, never its words.
    await db
      .batch([
        eventStatement(db, {
          company,
          user: who.user.id,
          action: 'mony.answered',
          subject: audience,
          detail: {
            ok: usage.ok,
            ms: Date.now() - started,
            sections: sections.length,
            routerIn: picked.usage.input,
            routerOut: picked.usage.output,
            routerCached: picked.usage.cached,
            input: usage.input,
            output: usage.output,
            cacheRead: usage.cacheRead,
            cacheWrite: usage.cacheWrite,
          },
        }),
      ])
      .catch(() => null)
  })
  if (!stream) return said(c, `${MONY.name} teraz neodpovedá. Skúste to o chvíľu.`, 503)
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
