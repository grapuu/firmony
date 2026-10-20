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
