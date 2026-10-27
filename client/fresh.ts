// Always the current Firmony (27 October 2026, the owner's word: a client must never see an old version). Pages are
// never cached, but a browser shows a tab it kept open, a page restored by Back or an app on the phone's home screen
// as they were. Every page carries the build it came from; when such a page comes into view again, it asks for the
// current build and, if Firmony was deployed since, loads itself anew. A page with something typed in is not reloaded
// under the person's hands: a bar offers the new version instead.
const mine = document.querySelector<HTMLMetaElement>('meta[name="firmony-build"]')?.content ?? ''
let asking = false
let asked = 0
let offered = false

const typed = () =>
  Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')).some((el) => {
    if (el instanceof HTMLSelectElement) return Array.from(el.options).some((o) => o.selected !== o.defaultSelected)
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked !== el.defaultChecked
    if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'file')) return el.type === 'file' && Boolean(el.files?.length)
    return el.value !== el.defaultValue
  })

function offer() {
  if (offered) return
  offered = true
  const bar = document.createElement('div')
  bar.className = 'fresh'
  bar.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.textContent = 'Firmony má novú verziu.'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'fresh__button'
  button.textContent = 'Obnoviť stránku'
  button.addEventListener('click', () => location.reload())
  bar.append(text, button)
  document.body.append(bar)
}

async function check(force = false) {
  if (!mine || asking || document.visibilityState !== 'visible') return
  if (!force && Date.now() - asked < 60_000) return
  asking = true
  asked = Date.now()
  try {
    const response = await fetch('/verzia', { cache: 'no-store', credentials: 'omit' })
    const current = response.ok ? (await response.text()).trim() : ''
    if (current && current !== mine) {
      if (typed() || document.querySelector('.is-busy')) offer()
      else location.reload()
    }
  } catch {
    /* offline: the page stays as it is and is asked again later */
  } finally {
    asking = false
  }
}

if (mine) {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void check(true)
  })
  document.addEventListener('visibilitychange', () => void check())
  window.addEventListener('focus', () => void check())
  setInterval(() => void check(), 10 * 60_000)
  // A page the browser restored from its own memory rather than fetched is checked at once.
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (navigation && navigation.type === 'back_forward') void check(true)
}

// The site's menu on a phone (views/layout.tsx) closes when one of its links is followed, a part of this page too.
for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.top__menu'))
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) menu.open = false
  })
