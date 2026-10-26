// Firmony's own billing (src/team/billing.ts): what a client is billed in a month, from its contract and its month.
import { check } from './check.mjs'
import { billing as b, config } from '../.wrangler/tmp/units-bundle.mjs'

export function checkBillingRules() {
  const plans = config.PLANS.map((p) => ({ id: p.id, name: p.name, docs: p.docs, monthlyCents: Math.round(p.price * 100) }))
  const tariff = { source: 'contract', plans, payrollCents: 1500, closingCents: 24900 }
  const facts = (over = {}) => ({
    month: '2027-03',
    startOn: '2027-01-01',
    endsOn: null,
    plan: 'rast',
    tariff,
    docs: new Map(),
    people: new Map(),
    closings: [],
    billed: new Set(),
    ...over,
  })
  const keys = (d) => d.lines.map((l) => l.key).join(' ')

  check('months are counted across the turn of a year', b.addMonths('2026-12', 1) === '2027-01' && b.addMonths('2027-01', -1) === '2026-12' && b.addMonths('2027-03', -14) === '2026-01')
  check('a range of months includes both ends', b.monthsFrom('2026-11', '2027-02').join(' ') === '2026-11 2026-12 2027-01 2027-02' && b.monthsFrom('2027-02', '2027-01').length === 0)

  let d = b.draftOf(facts())
  check('every month of the plan since the start is billed in advance, the current month included', keys(d) === 'plan:2027-01 plan:2027-02 plan:2027-03' && d.totalCents === 3 * 16900, keys(d))
  d = b.draftOf(facts({ billed: new Set(['plan:2027-01', 'plan:2027-02']) }))
  check('what was billed is billed no more', keys(d) === 'plan:2027-03')
  d = b.draftOf(facts({ startOn: '2027-05-01' }))
  check('nothing is billed before the contract starts', d.lines.length === 0)
  d = b.draftOf(facts({ endsOn: '2027-02-28' }))
  check('nothing of the plan is billed after the last month of the contract', keys(d) === 'plan:2027-01 plan:2027-02')

  d = b.draftOf(facts({ docs: new Map([['2027-02', 64]]) }))
  const extra = d.lines.find((l) => l.key === 'extra:2027-02')
  check('a month with more documents than the plan is for is billed as the nearest higher plan (4.2)', extra?.cents === 32900 - 16900 && extra.description.includes('Firma') && extra.description.includes('64'))
  d = b.draftOf(facts({ docs: new Map([['2027-02', 60]]) }))
  check('as many documents as the plan is for cost nothing more', !d.lines.some((l) => l.key.startsWith('extra:')))
  d = b.draftOf(facts({ plan: 'start', docs: new Map([['2027-02', 21]]) }))
  check('Štart with 21 documents is billed as Rast', d.lines.find((l) => l.key === 'extra:2027-02')?.cents === 16900 - 8900)
  d = b.draftOf(facts({ docs: new Map([['2027-03', 99]]) }))
  check('the month that runs is not counted before it ends', !d.lines.some((l) => l.key === 'extra:2027-03'))
  d = b.draftOf(facts({ docs: new Map([['2027-02', 151]]) }))
  check('more than the highest plan bills the highest plan and asks for a price to be agreed', d.lines.find((l) => l.key === 'extra:2027-02')?.cents === 32900 - 16900 && d.flags.includes('agree'))
  d = b.draftOf(facts({ plan: 'firma', docs: new Map([['2027-01', 200]]) }))
  check('an older month above the highest plan asks nothing any more', !d.flags.includes('agree'))
  d = b.draftOf(facts({ plan: 'firma', docs: new Map([['2027-02', 200]]) }))
  check('on the highest plan more documents add nothing but the question of a price', !d.lines.some((l) => l.key.startsWith('extra:')) && d.flags.includes('agree'))

  d = b.draftOf(facts({ people: new Map([['2027-02', 3], ['2027-03', 5]]) }))
  const payroll = d.lines.find((l) => l.key === 'payroll:2027-02')
  check('payroll is each person of an ended month at the contract price', payroll?.quantityMilli === 3000 && payroll.cents === 4500 && !d.lines.some((l) => l.key === 'payroll:2027-03'))

  d = b.draftOf(facts({ closings: [2026, 2027] }))
  check('a closing is billed once filed, only for a year we kept the books', d.lines.some((l) => l.key === 'closing:2027' && l.cents === 24900) && !d.lines.some((l) => l.key === 'closing:2026'))
  d = b.draftOf(facts({ endsOn: '2027-02-28', closings: [2027], month: '2028-04' }))
  check('the closing is billed also after the contract ended', d.lines.some((l) => l.key === 'closing:2027') && !d.lines.some((l) => l.key.startsWith('plan:2028')))

  d = b.draftOf(facts({ month: '2028-06', startOn: '2027-01-01' }))
  check('at most twelve months back are billed by themselves', d.lines[0]?.key === 'plan:2027-06' && d.lines.length === 13, keys(d))
  d = b.draftOf(facts({ tariff: { ...tariff, source: 'pricelist' } }))
  check('prices from the price list are flagged for a look', d.flags.includes('pricelist'))
  d = b.draftOf(facts({ plan: 'neznamy' }))
  check('a plan without a price bills nothing of the plan and says why', d.flags.includes('plan') && !d.lines.some((l) => l.key.startsWith('plan:')))
  d = b.draftOf(facts({ tariff: { ...tariff, plans: plans.map((p) => (p.id === 'rast' ? { ...p, monthlyCents: 15000 } : p)) } }))
  check('the price is the contract’s, not today’s', d.lines[0]?.cents === 15000)

  // The offer of 26 October 2026: the first month costs nothing, saved with the contract's prices.
  const offered = { ...tariff, firstMonthFree: true }
  d = b.draftOf(facts({ tariff: offered, docs: new Map([['2027-01', 99]]), people: new Map([['2027-01', 2], ['2027-02', 1]]) }))
  check('the first month of an offered contract bills no plan, no documents above it and no payroll; the next ones are billed as ever',
    keys(d) === 'plan:2027-02 plan:2027-03 payroll:2027-02' && d.totalCents === 2 * 16900 + 1500, keys(d))
  d = b.draftOf(facts({ tariff: offered, closings: [2027], month: '2028-02', billed: new Set(['plan:2027-02']) }))
  check('the free first month never frees the closing of the year', d.lines.some((l) => l.key === 'closing:2027') && !d.lines.some((l) => l.key === 'plan:2027-01'))
  d = b.draftOf(facts({ tariff: offered, startOn: '2027-03-01' }))
  check('a contract that starts in the month of the invoice bills nothing yet', d.lines.length === 0, keys(d))
  d = b.draftOf(facts({ tariff: { ...tariff, firstMonthFree: false } }))
  check('a contract saved without the offer pays its first month', keys(d) === 'plan:2027-01 plan:2027-02 plan:2027-03')

  check('people are counted in a month they were employed in at all', b.peopleIn('2027-02', [
    { startedOn: '2027-02-28', endedOn: null },
    { startedOn: '2026-01-01', endedOn: '2027-02-01' },
    { startedOn: '2026-01-01', endedOn: '2027-01-31' },
    { startedOn: '2027-03-01', endedOn: null },
  ]) === 2)
  check('a month begins at midnight in Bratislava, in winter and in summer', b.monthStart('2027-01') === Date.parse('2026-12-31T23:00:00Z') / 1000 && b.monthStart('2027-07') === Date.parse('2027-06-30T22:00:00Z') / 1000)
}
