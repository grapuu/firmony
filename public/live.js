// Two phones at one meeting (src/meeting/): the designated person's page and the director's page each ask every few
// seconds where the meeting stands (data-live, a short text of states and nothing of a person) and load themselves again
// when it changed, so what one taps the other shows. While something is being typed or picked on a page, it does not
// reload under the hand: it offers the reload instead (data-live-bar).
;(() => {
  const root = document.querySelector('[data-live]')
  const url = root && root.getAttribute('data-live')
  const state = root && root.getAttribute('data-live-state')
  if (!root || !url || state === null) return
  const bar = document.querySelector('[data-live-bar]')
  let touched = false
  let asking = false
  let done = false
  const touch = (event) => {
    if (event.target instanceof Element && event.target.closest('form')) touched = true
  }
  document.addEventListener('input', touch, true)
  document.addEventListener('change', touch, true)
  const moved = () => {
    done = true
    if (touched && bar) bar.hidden = false
    else location.reload()
  }
  const ask = async () => {
    if (asking || done || document.hidden) return
    asking = true
    try {
      const answer = await fetch(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', headers: { 'x-firmony-refresh': '1' } })
      // Gone (a link replaced, a meeting ended) or no longer signed in: the page itself says what now.
      if (answer.status === 404 || answer.type === 'opaqueredirect') moved()
      else if (answer.ok && (await answer.text()).trim() !== state) moved()
    } catch {
      // Offline for a moment: the next turn asks again.
    } finally {
      asking = false
    }
  }
  setInterval(ask, 3000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ask()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) ask()
  })
})()
