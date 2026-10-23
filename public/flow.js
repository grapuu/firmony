// The month on the home page played by scrolling where the browser has no scroll timelines (Safari before 26, iOS
// before 26). Where it has them, CSS plays it alone and this does nothing; without this script the finished card
// stays. It marks the track (`flow__track--js` in app.css: the same layout and paused keyframes) and seeks each
// piece's animation to the share of its range the scroll has reached. The ranges are the CSS's own `contain` ranges
// of the track, in per cent, kept the same as in app.css.
;(() => {
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()')) return
  const track = document.querySelector('.flow__track')
  if (!track || typeof matchMedia !== 'function') return
  const motion = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 700px)')
  const RANGES = [
    ['.flyer--1', 2, 18],
    ['.flyer--2', 13, 29],
    ['.flyer--3', 24, 40],
    ['.flyer--4', 35, 51],
    ['.flyer--5', 46, 62],
    ['.feed__row--1', 16.5, 22],
    ['.feed__row--2', 27.5, 33],
    ['.feed__row--3', 38.5, 44],
    ['.feed__row--4', 49.5, 55],
    ['.feed__row--5', 60.5, 66],
    ['.feed__foot', 68, 76],
  ]
  // Each piece with what moves with it: a row's icon and stamp keep the row's range.
  const pieces = []
  for (const [selector, from, to] of RANGES) {
    const el = track.querySelector(selector)
    if (!el) continue
    pieces.push({ els: [el, ...el.querySelectorAll('.tile__img, .pill')], from, to })
  }
  const seek = (el, share) => {
    const animations = typeof el.getAnimations === 'function' ? el.getAnimations() : []
    if (animations.length > 0) for (const a of animations) a.currentTime = share * 1000
    else el.style.animationDelay = `${-share}s`
  }
  let on = false
  let queued = false
  const update = () => {
    queued = false
    if (!on) return
    const box = track.getBoundingClientRect()
    const span = box.height - window.innerHeight
    // The track's `contain` range: from its top at the screen's top to its bottom at the screen's bottom.
    const at = span > 0 ? Math.min(100, Math.max(0, (-box.top / span) * 100)) : 100
    for (const p of pieces) {
      const share = Math.min(1, Math.max(0, (at - p.from) / (p.to - p.from)))
      for (const el of p.els) seek(el, share)
    }
  }
  const queue = () => {
    if (!queued) {
      queued = true
      requestAnimationFrame(update)
    }
  }
  const set = () => {
    on = motion.matches
    track.classList.toggle('flow__track--js', on)
    if (on) requestAnimationFrame(update)
  }
  set()
  if (typeof motion.addEventListener === 'function') motion.addEventListener('change', set)
  else if (typeof motion.addListener === 'function') motion.addListener(set)
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue)
})()

// The offer carousel on the home page: the card nearest the middle of the stage is the hero (marked
// `offer__card--on`; the CSS lets the sides fall back), a click rolls the clicked card to the middle, and the
// arrow keys step one card when the stage has focus. Scroll-snap itself runs in CSS; this only marks the hero
// and turns clicks and keys into a smooth centring. Nothing animates for a visitor who asked for less motion.
;(() => {
  const stage = document.querySelector('.offer__stage')
  if (!stage) return
  const cards = Array.from(stage.querySelectorAll('.offer__card'))
  if (cards.length === 0) return
  stage.classList.add('offer__stage--js')

  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  let reduced = motion ? motion.matches : false
  if (motion && typeof motion.addEventListener === 'function') {
    motion.addEventListener('change', (e) => {
      reduced = e.matches
    })
  }

  // The card nearest the middle of the visible stage is the hero.
  const mark = () => {
    const box = stage.getBoundingClientRect()
    const centre = box.left + box.width / 2
    let hero = null
    let best = Infinity
    for (const card of cards) {
      const c = card.getBoundingClientRect()
      const d = Math.abs(c.left + c.width / 2 - centre)
      if (d < best) {
        best = d
        hero = card
      }
    }
    for (const card of cards) card.classList.toggle('offer__card--on', card === hero)
  }

  const centre = (card) => {
    if (typeof card.scrollIntoView !== 'function') return
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
  }

  for (const card of cards) card.addEventListener('click', () => centre(card))

  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const index = cards.findIndex((card) => card.classList.contains('offer__card--on'))
    const at = index === -1 ? 0 : index
    const next = e.key === 'ArrowRight' ? Math.min(cards.length - 1, at + 1) : Math.max(0, at - 1)
    centre(cards[next])
    e.preventDefault()
  })

  let queued = false
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      mark()
    })
  }
  stage.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue)
  mark()
})()
