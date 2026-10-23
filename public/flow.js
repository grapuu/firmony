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

// The offer carousel on the home page: four cards on a virtual ring. The card in front is the hero in the middle,
// the cards left and right are visible and readable, and the fourth hides behind it. A click on an arrow or a side
// card turns the ring a quarter turn; the arrow keys and a swipe do the same. The turn is a 2.5D orbit — a
// horizontal offset, a scale and a slight tilt from the card's place on the ring — nothing flies up or down, so
// the ring never ends and never jumps. The CSS holds the motion, so less motion means an instant turn.
;(() => {
  const stage = document.querySelector('.offer__stage')
  if (!stage) return
  const cards = Array.from(stage.querySelectorAll('.offer__card'))
  const prev = stage.querySelector('[data-offer-prev]')
  const next = stage.querySelector('[data-offer-next]')
  const count = stage.querySelector('[data-offer-count]')
  if (cards.length === 0 || !prev || !next) return
  stage.classList.add('offer__stage--js')

  // The four places of the ring: 0 the front, 1 right, 2 the back, 3 left. x is the horizontal offset in card
  // widths, s the scale, ry the tilt, o the opacity, z the stacking and f the brightness.
  const PLACE = [
    { x: 0, s: 1, ry: 0, o: 1, z: 40, f: 1 },
    { x: 1, s: 0.84, ry: -18, o: 0.85, z: 30, f: 0.92 },
    { x: 0, s: 0.72, ry: 0, o: 0, z: 10, f: 0.8 },
    { x: -1, s: 0.84, ry: 18, o: 0.85, z: 30, f: 0.92 },
  ]

  // "Založenie s. r. o. zadarmo", the second card, opens in front.
  let rotation = 1
  let radius = 0

  const render = () => {
    const front = ((rotation % 4) + 4) % 4
    for (let i = 0; i < cards.length; i++) {
      const place = PLACE[((i - rotation) % 4 + 4) % 4]
      const card = cards[i]
      card.style.transform = `translate(-50%, -50%) translateX(${(place.x * radius).toFixed(1)}px) rotateY(${place.ry}deg) scale(${place.s})`
      card.style.opacity = String(place.o)
      card.style.zIndex = String(place.z)
      card.style.filter = place.f === 1 ? 'none' : `brightness(${place.f})`
      card.style.pointerEvents = place.o === 0 ? 'none' : ''
      card.setAttribute('aria-hidden', place.o === 0 ? 'true' : 'false')
      card.classList.toggle('offer__card--on', i === front)
    }
    if (count) count.textContent = `${front + 1} / ${cards.length}`
  }

  const measure = () => {
    radius = cards[0].offsetWidth * 0.86
    render()
  }

  const turn = (step) => {
    rotation += step
    render()
  }

  prev.addEventListener('click', () => turn(-1))
  next.addEventListener('click', () => turn(1))

  // A click on a side card brings it to the front.
  for (let i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', () => {
      const place = ((i - rotation) % 4 + 4) % 4
      if (place === 1) turn(1)
      else if (place === 3) turn(-1)
    })
  }

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { turn(1); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { turn(-1); e.preventDefault() }
  })

  // A horizontal swipe turns the ring one card.
  let startX = null
  stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX }, { passive: true })
  stage.addEventListener('touchend', (e) => {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) > 42) turn(dx < 0 ? 1 : -1)
    startX = null
  }, { passive: true })

  window.addEventListener('resize', measure)
  measure()
})()
