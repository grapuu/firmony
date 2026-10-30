// The money view (src/app/money.ts): the next 30 days' known movements and whether a payout leaves the known
// obligations covered, every obligation checked on its own day. Pure rules, no database.
import { check } from './check.mjs'
import { money } from '../.wrangler/tmp/units-bundle.mjs'

export function checkMoneyUnits() {
  const facts = (over = {}) => ({
    today: '2026-10-30',
    balanceCents: 500000,
    balanceOn: '2026-10-29',
    incoming: [],
    outgoing: [],
    ...over,
  })
  const item = (day, label, cents) => ({ day, label, cents })

  // The window: today and the 29 days after it; the day the window ends on is already outside.
  let w = money.moneyWindow(facts({ incoming: [item('2026-10-30', 'dnes', 1000), item('2026-11-28', 'posledný', 2000), item('2026-11-29', 'po okne', 4000)] }), 30)
  check('the window counts today and the 29 days after it, nothing beyond', w.inCents === 3000 && w.days === 30, JSON.stringify(w))
  w = money.moneyWindow(facts({ outgoing: [item('2026-10-31', 'a', 10000), item('2026-11-28', 'b', 20000)] }), 30)
  check('the reserve is the balance plus what comes in minus what goes out', w.outCents === 30000 && w.reserveCents === 500000 - 30000)
  w = money.moneyWindow(facts({ balanceCents: null }))
  check('without a balance the mood is unknown, never a guess', w.reserveCents === null && w.mood === 'unknown')
  w = money.moneyWindow(facts({ outgoing: [item('2026-10-31', 'a', 600000)] }))
  check('outflows above what is there mean short', w.mood === 'short' && w.reserveCents === -100000)
  w = money.moneyWindow(facts({ outgoing: [item('2026-10-31', 'a', 600000)], incoming: [item('2026-11-05', 'b', 200000)] }))
  check('covered only thanks to the money expected to come in means tight', w.mood === 'tight' && w.reserveCents === 100000)
  w = money.moneyWindow(facts({ outgoing: [item('2026-10-31', 'a', 400000)] }))
  check('a balance that alone covers the outflows means fine', w.mood === 'fine' && w.reserveCents === 100000)

  // The payout: every obligation on its own day, an inflow after an outflow does not cover it.
  let v = money.payoutVerdict(facts({ outgoing: [item('2026-11-05', 'dph', 300000)] }), 100000)
  check('a payout that fits leaves the reserve', v.ok === true && v.reserveCents === 100000)
  v = money.payoutVerdict(facts({ incoming: [item('2026-11-03', 'faktúra', 200000)], outgoing: [item('2026-11-05', 'dph', 300000)] }), 100000)
  check('an inflow that comes before an outflow covers it', v.ok === true && v.reserveCents === 300000)
  v = money.payoutVerdict(facts({ incoming: [item('2026-11-10', 'faktúra', 200000)], outgoing: [item('2026-11-05', 'dph', 500000)] }), 100000)
  check('an inflow that comes after an outflow does not cover it, and the outflow is named', v.ok === false && v.known === true && v.immediate === true && v.uncovered.length === 1 && v.uncovered[0].label === 'dph' && v.shortCents === 100000, JSON.stringify(v))
  v = money.payoutVerdict(facts({}), 600000)
  check('a payout above the balance is never ok, however calm the month', v.ok === false && v.immediate === false && v.uncovered.length === 0 && v.shortCents === 100000)
  v = money.payoutVerdict(facts({ balanceCents: null }), 1000)
  check('without a balance the payout answer says so', v.ok === false && v.known === false)
  v = money.payoutVerdict(facts({ outgoing: [item('2026-10-31', 'a', 400000), item('2026-11-05', 'b', 200000)] }), 300000)
  check('the deepest dip is reported, not only the end', v.ok === false && v.shortCents === 400000 && v.reserveCents === -400000 && v.uncovered.length === 1 && v.uncovered[0].label === 'a', JSON.stringify(v))
  v = money.payoutVerdict(facts({ outgoing: [item('2026-11-05', 'dph', 200000)] }), 0)
  check('a payout of nothing is the window itself', v.ok === true && v.reserveCents === 300000)

  // The view helper passes the ask through and keeps the invalid mark separate.
  const view = money.moneyView(facts(), 12300, false)
  check('the view holds the facts, the window and the ask together', view.facts.today === '2026-10-30' && view.window.days === 30 && view.ask?.ok === true && view.asked === 12300 && view.invalid === false)
}
