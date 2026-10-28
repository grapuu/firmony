/**
 * Anthropic's API as Mony uses it (assistant/mony.ts), local only: the first call picks sections from the titles it is
 * shown, the second streams an answer as server-sent events. A test may set `pick` (the titles' words to pick by) and
 * `next` (the answer's text, a status, or a stream cut short). Every request body is kept for the checks.
 */
export function monyProviderFixture() {
  const fixture = {
    routes: [],
    answers: [],
    pick: null,
    next: null,
    async answer(request) {
      if (new URL(request.url).hostname !== 'api.anthropic.com') return null
      const payload = await request
        .clone()
        .json()
        .catch(() => null)
      if (!payload) return null
      if (payload.tools?.some((t) => t.name === 'mony_sekcie')) {
        fixture.routes.push(payload)
        const toc = String(payload.system?.[0]?.text ?? '').split('OBSAH PODKLADOV:\n')[1] ?? ''
        const words = (fixture.pick ?? ['bank']).map((w) => w.toLowerCase())
        const ids = toc
          .split('\n')
          .filter((line) => words.some((w) => line.toLowerCase().includes(w)))
          .map((line) => line.split(' ')[0])
          .slice(0, 6)
        return Response.json({ type: 'message', content: [{ type: 'tool_use', id: 'toolu_mony', name: 'mony_sekcie', input: { ids: [...ids, 'neexistuje', ids[0]] } }], usage: { input_tokens: 2100, output_tokens: 24, cache_read_input_tokens: 1800 } })
      }
      if (payload.stream === true && String(payload.system?.[0]?.text ?? '').startsWith('Pokyny pre asistenta Mony')) {
        fixture.answers.push(payload)
        const next = fixture.next ?? {}
        fixture.next = null
        if (next.status) return new Response('TEST-ONLY unavailable', { status: next.status })
        const text = next.text ?? '**Áno.** Banku nastavíte na /app/banka. Výpisy potom chodia samé.\n\n- Fio: token\n- ostatné: výpis raz mesačne\n\n<img src=x onerror=alert(1)> /app/neexistuje'
        const parts = next.cut ? [text.slice(0, 14)] : [text.slice(0, 14), text.slice(14)]
        const events = [
          ['message_start', { type: 'message_start', message: { usage: { input_tokens: 3200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }],
          ...parts.map((p) => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }]),
          ...(next.cut ? [] : [['message_delta', { type: 'message_delta', delta: { stop_reason: next.stop ?? 'end_turn' }, usage: { output_tokens: 57 } }], ['message_stop', { type: 'message_stop' }]]),
        ]
        return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
      }
      return null
    },
  }
  return fixture
}
