// Mony in the browser (views/mony.tsx, assistant/mony.ts): opens and folds the cloud, keeps whether it is open for
// this browser and the conversation for this tab, asks /app/mony and writes the answer as it comes. An answer is
// written as text, never as HTML; only its bold, its lists and links to pages that exist become elements.
import { MONY_ROUTES } from '../src/generated/mony-routes'

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

const root = document.querySelector<HTMLElement>('[data-mony]')
const panel = root?.querySelector<HTMLElement>('.mony__panel')
const launcher = root?.querySelector<HTMLButtonElement>('[data-mony-open]')
const log = root?.querySelector<HTMLElement>('[data-mony-log]')
const form = root?.querySelector<HTMLFormElement>('[data-mony-form]')
const input = form?.querySelector<HTMLTextAreaElement>('textarea')

const PAGES = MONY_ROUTES.map((route) => new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:id/g, '[A-Za-z0-9_-]+')}$`))
const isPage = (path: string) => PAGES.some((page) => page.test(path))

const store = {
  get(area: Storage | undefined, key: string): string | null {
    try {
      return area?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  set(area: Storage | undefined, key: string, value: string | null): void {
    try {
      if (value === null) area?.removeItem(key)
      else area?.setItem(key, value)
    } catch {
      /* private mode or blocked storage: Mony still works, it only forgets */
    }
  },
}
const local = (() => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
})()
const session = (() => {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
})()

if (root && panel && launcher && log && form && input) {
  // The conversation belongs to this person and this company: another account or company in the tab starts afresh.
  const context = document.body.getAttribute('data-client-context') ?? root.dataset.mony ?? 'web'
  const KEY = `mony:${context}`
  const OPEN = 'mony:open'
  let turns: Turn[] = []
  try {
    const kept = JSON.parse(store.get(session, KEY) ?? '[]')
    if (Array.isArray(kept)) turns = kept.filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string').slice(-30)
  } catch {
    turns = []
  }
  const chips = log.querySelector<HTMLElement>('[data-mony-chips]')
  let busy = false

  const inline = (text: string, into: HTMLElement) => {
    const pattern = /\*\*([^*\n]+)\*\*|(^|[\s(„"])(\/[A-Za-z0-9/_-]*[A-Za-z0-9_/-])/g
    let at = 0
    for (const m of text.matchAll(pattern)) {
      const index = m.index ?? 0
      if (m[1] !== undefined) {
        into.append(text.slice(at, index))
        const strong = document.createElement('strong')
        strong.textContent = m[1]
        into.append(strong)
        at = index + m[0].length
        continue
      }
      const lead = m[2] ?? ''
      const path = (m[3] ?? '').replace(/\/$/, '') || '/'
      if (!isPage(path)) continue
      into.append(text.slice(at, index) + lead)
      const link = document.createElement('a')
      link.className = 'link'
      link.href = path
      link.textContent = path
      into.append(link)
      at = index + m[0].length
    }
    into.append(text.slice(at))
  }

  const render = (text: string, into: HTMLElement) => {
    into.replaceChildren()
    for (const block of text.trim().split(/\n{2,}/)) {
      const lines = block.split('\n')
      let list: HTMLElement | null = null
      let para: HTMLElement | null = null
      for (const line of lines) {
        const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
        const step = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (bullet || step) {
          const kind = bullet ? 'UL' : 'OL'
          if (!list || list.tagName !== kind) {
            list = document.createElement(kind.toLowerCase())
            into.append(list)
          }
          const item = document.createElement('li')
          inline((bullet ?? step)?.[1] ?? '', item)
          list.append(item)
          para = null
          continue
        }
        list = null
        if (!para) {
          para = document.createElement('p')
          into.append(para)
        } else para.append(document.createElement('br'))
        inline(line, para)
      }
    }
  }

  const bubble = (role: Turn['role'], text = '') => {
    const el = document.createElement('div')
    el.className = `mony__msg mony__msg--${role === 'user' ? 'user' : 'mony'}`
    if (role === 'user') el.textContent = text
    else render(text, el)
    log.append(el)
    return el
  }
  const scroll = () => {
    log.scrollTop = log.scrollHeight
  }
  const save = () => store.set(session, KEY, JSON.stringify(turns.slice(-30)))
  const showChips = () => {
    if (chips) chips.hidden = turns.length > 0
  }

  for (const turn of turns) bubble(turn.role, turn.text)
  showChips()

  // On a phone Mony opens over the whole screen, like a chat app (his word of 28 October 2026: the page ran away under
  // the chat). The page behind is held still where it was, and the sheet follows the part of the screen the keyboard
  // leaves visible, so neither the page nor the cloud moves while the person scrolls or types.
  const phone = window.matchMedia('(max-width: 900px)')
  const viewport = window.visualViewport
  let heldAt: number | null = null
  const hold = () => {
    if (!phone.matches || heldAt !== null) return
    heldAt = window.scrollY
    document.body.style.top = `-${heldAt}px`
    document.documentElement.classList.add('mony-held')
  }
  const release = () => {
    if (heldAt === null) return
    const at = heldAt
    heldAt = null
    document.documentElement.classList.remove('mony-held')
    document.body.style.top = ''
    window.scrollTo({ top: at, behavior: 'instant' as ScrollBehavior })
  }
  const fit = () => {
    if (!viewport || heldAt === null) {
      root.style.removeProperty('--mony-vh')
      root.style.removeProperty('--mony-top')
      return
    }
    // A conversation read at its end stays at its end when the keyboard comes up, as in a chat app.
    const atEnd = turns.length > 0 && log.scrollHeight - log.scrollTop - log.clientHeight < 24
    root.style.setProperty('--mony-vh', `${Math.round(viewport.height)}px`)
    root.style.setProperty('--mony-top', `${Math.round(viewport.offsetTop)}px`)
    if (atEnd) scroll()
  }
  viewport?.addEventListener('resize', fit)
  viewport?.addEventListener('scroll', fit)

  const open = (focus: boolean) => {
    panel.hidden = false
    launcher.hidden = true
    launcher.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')
    store.set(local, OPEN, '1')
    hold()
    fit()
    scroll()
    if (focus) input.focus({ preventScroll: true })
  }
  const fold = () => {
    panel.hidden = true
    launcher.hidden = false
    launcher.setAttribute('aria-expanded', 'false')
    root.classList.remove('is-open')
    store.set(local, OPEN, '0')
    release()
    fit()
    launcher.focus({ preventScroll: true })
  }
  // Turned from a phone's width to a wide one while open: the page is let go and the cloud is the corner's again.
  phone.addEventListener('change', () => {
    if (!root.classList.contains('is-open')) return
    if (phone.matches) hold()
    else release()
    fit()
  })

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    busy = true
    form.classList.add('is-busy')
    const history = turns.slice()
    turns.push({ role: 'user', text: q })
    bubble('user', q)
    showChips()
    save()
    const answer = bubble('assistant')
    answer.classList.add('is-thinking')
    answer.setAttribute('aria-label', 'Mony premýšľa')
    for (let i = 0; i < 3; i++) answer.append(Object.assign(document.createElement('span'), { className: 'mony__dot' }))
    scroll()
    let text = ''
    try {
      const response = await fetch('/app/mony', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history, page: location.pathname }),
      })
      if (!response.ok || !response.body) {
        const said = await response.json().catch(() => null)
        throw new Error(typeof said?.error === 'string' ? said.error : 'Mony teraz neodpovedá. Skúste to o chvíľu.')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        text += decoder.decode(part.value, { stream: true })
        answer.classList.remove('is-thinking')
        answer.removeAttribute('aria-label')
        render(text, answer)
        scroll()
      }
      text += decoder.decode()
      render(text, answer)
      turns.push({ role: 'assistant', text })
    } catch (error) {
      answer.classList.remove('is-thinking')
      answer.removeAttribute('aria-label')
      answer.classList.add('mony__msg--error')
      answer.textContent = error instanceof Error && error.message ? error.message : 'Mony teraz neodpovedá. Skúste to o chvíľu.'
      // A question without its answer is not kept: the next one is asked as if it were the first.
      turns.pop()
    }
    save()
    scroll()
    busy = false
    form.classList.remove('is-busy')
  }

  launcher.addEventListener('click', () => open(true))
  // A word on the page that names Mony opens her too.
  for (const call of document.querySelectorAll<HTMLElement>('[data-mony-call]')) call.addEventListener('click', () => open(true))
  root.querySelector('[data-mony-hide]')?.addEventListener('click', fold)
  root.querySelector('[data-mony-new]')?.addEventListener('click', () => {
    if (busy) return
    turns = []
    save()
    for (const el of log.querySelectorAll('.mony__msg:not(:first-child)')) el.remove()
    showChips()
    input.focus()
  })
  for (const chip of root.querySelectorAll<HTMLButtonElement>('[data-mony-ask]')) chip.addEventListener('click', () => void ask(chip.dataset.monyAsk ?? ''))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const q = input.value
    if (!q.trim() || busy) return
    input.value = ''
    void ask(q)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fold()
  })

  root.hidden = false
  // A cloud left open opens again on the next page; on a phone, where it covers the page, it waits to be asked.
  if (store.get(local, OPEN) === '1' && !phone.matches) open(false)
}
