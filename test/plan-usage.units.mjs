// Prehľad (29 October 2026): a client's documents against its plan (team/plan-usage.ts) and the check by Claude
// (team/overview-check.ts): what it is sent holds no name, and what it says that the data do not hold is left out.
import { check } from './check.mjs'
import { planUsage, overviewCheck, overviewModel, billing } from '../.wrangler/tmp/units-bundle.mjs'

const PLANS = [
  { id: 'start', name: 'Štart', docs: 20, monthlyCents: 8900 },
  { id: 'rast', name: 'Rast', docs: 60, monthlyCents: 16900 },
  { id: 'firma', name: 'Firma', docs: 150, monthlyCents: 32900 },
]
const tariff = (extra = {}) => ({ source: 'contract', plans: PLANS, payrollCents: 1500, closingCents: 24900, firstMonthFree: false, issuedInvoicesFree: false, ...extra })
const at = (day, hour = 12) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) / 1000

export function checkPlanUsageUnits() {
  const { usageOf, stateOf, monthShare } = planUsage
  check('usage: the limit is the plan\'s; 16 of 20 is near, 20 of 20 is still the plan, 21 is over', stateOf(15, 20, false) === 'ok' && stateOf(16, 20, false) === 'near' && stateOf(20, 20, false) === 'near' && stateOf(21, 20, false) === 'over' && stateOf(151, 150, true) === 'agree')
  check('usage: how far a month has run, by Bratislava\'s midnights', monthShare('2026-10', billing.monthStart('2026-10')) === 0 && monthShare('2026-10', billing.monthStart('2026-11')) === 1 && Math.abs(monthShare('2026-10', at('2026-10-16', 23)) - 0.5) < 0.02)
  const docs = new Map([['2026-10', 25], ['2026-09', 30], ['2026-08', 12], ['2026-07', 61]])
  let u = usageOf({ month: '2026-10', at: at('2026-10-15'), plan: 'start', tariff: tariff(), startOn: '2026-06-01', docs })
  check('usage: 25 of Štart\'s 20 is billed as Rast, 80 € more', u.state === 'over' && u.billedAs.id === 'rast' && u.extraCents === 8000 && u.docs === 25 && u.limit === 20)
  check('usage: projected at the month\'s pace once a fifth has passed', u.projected !== null && u.projected >= 50 && u.projected <= 54 && u.projectedAs.id === 'rast', String(u.projected))
  check('usage: two of three months over the plan offer the plan the largest of them needs', u.offer?.id === 'firma' && u.history.map((h) => `${h.month}:${h.docs}:${h.over}`).join(' ') === '2026-09:30:true 2026-08:12:false 2026-07:61:true', JSON.stringify(u.history))
  u = usageOf({ month: '2026-10', at: at('2026-10-02'), plan: 'start', tariff: tariff(), startOn: '2026-09-01', docs })
  check('usage: no projection on the second day; only the months of the contract count, so one month over offers nothing', u.projected === null && u.history.length === 1 && u.offer === null)
  u = usageOf({ month: '2026-10', at: at('2026-10-20'), plan: 'firma', tariff: tariff(), startOn: '2026-01-01', docs: new Map([['2026-10', 151]]) })
  check('usage: past the highest plan a price is to be agreed, the highest billed until then', u.state === 'agree' && u.billedAs.id === 'firma' && u.extraCents === 0)
  u = usageOf({ month: '2026-10', at: at('2026-10-20'), plan: 'start', tariff: tariff({ firstMonthFree: true }), startOn: '2026-10-01', docs: new Map([['2026-10', 30]]) })
  check('usage: the first month offered free is counted and said to be free, never billed as a larger plan nor rung', u.free === true && u.state === 'near' && u.docs === 30 && u.billedAs.id === 'start' && u.extraCents === 0)
  check('usage: a plan not among the prices has no usage', usageOf({ month: '2026-10', at: at('2026-10-20'), plan: 'nic', tariff: tariff(), startOn: '2026-01-01', docs }) === null)

  const { numbersIn, grounded, allowedNumbers, readAnswer, snapshotOf } = overviewCheck
  check('guard: numbers as Slovak writes them, firm keys not among them', numbersIn('K3 má 1 234 dokladov, 12,50 € a 80 %').join(',') === '1234,12.5,80' && numbersIn('K12').length === 0)
  const names = new Map([['K1', 'Alfa s. r. o.']])
  check('guard: a text whose numbers and firms are the data\'s passes, another number or firm does not',
    grounded('K1 má 22 dokladov', [22, 20], names) && !grounded('K1 má 23 dokladov', [22, 20], names) && !grounded('K2 má 22', [22], names) && grounded('Nič nehorí.', [], names))
  const data = { dnes: '2026-10-29', baliky: [{ firma: 'K1', doklady_tento_mesiac: 22, limit_dokladov: 20, stav: 'nad balíkom' }], sucty: { veci_hori: 0 } }
  const read = readAnswer(
    {
      zhrnutie: 'Horí 0 vecí.',
      body: [
        { uroven: 'pozor', nazov: 'K1 je nad balíkom', detail: '22 dokladov pri limite 20.', kde: 'baliky' },
        { uroven: 'hori', nazov: 'Vymyslené', detail: 'Klientov je 987654.', kde: 'objem' },
        { uroven: 'zle', nazov: 'Neznáma úroveň', detail: '', kde: 'objem' },
        { uroven: 'info', nazov: 'K7 nič', detail: '', kde: 'objem' },
        { uroven: 'dobre', nazov: 'Dnes 29. 10. 2026 ide všetko', detail: '', kde: 'nikde' },
      ],
    },
    data,
    names,
    ['plans'],
  )
  check('guard: the true points stay with the firm\'s name, the invented ones are counted out, an unknown place falls back',
    read.points.length === 2 && read.points[0].title === 'Alfa s. r. o. je nad balíkom' && read.points[1].where === 'objem' && read.dropped === 3 && read.summary === 'Horí 0 vecí.', JSON.stringify(read))
  check('guard: the date of the data may be said', allowedNumbers(data).includes(29) && allowedNumbers(data).includes(2026))
  const company = { id: 'secret-id-1', name: 'Tajná firma s. r. o.' }
  const plan = PLANS[0]
  const usage = { month: '2026-10', plan, docs: 22, limit: 20, share: 1.1, state: 'over', billedAs: PLANS[1], extraCents: 8000, projected: 40, projectedAs: PLANS[1], free: false, history: [], offer: null }
  const o = {
    at: at('2026-10-29'),
    today: '2026-10-29',
    hours: 24,
    alarms: [{ key: 'messagesLate', level: 'hori', n: 1, firms: [company], href: '/ucto/spravy', since: at('2026-10-27') }],
    fresh: [{ key: 'leads', n: 3 }],
    volumes: [{ key: 'clients', n: 4 }],
    plans: [{ company, usage, corrupt: false, tariff: 'contract' }],
    complaints: [{ firm: company, n: 2, last: at('2026-10-28') }],
  }
  const snap = snapshotOf(o)
  const text = JSON.stringify(snap.data)
  check('snapshot: a firm is one key wherever it stands, its name and id are not sent', !text.includes('Tajná') && !text.includes('secret-id') && text.split('"K1"').length - 1 === 3 && snap.names.get('K1') === 'Tajná firma s. r. o.')
  check('snapshot: the sums Claude may quote are in it', snap.data.sucty.klientov_nad_balikom === 1 && snap.data.sucty.priplatky_eur_spolu === 80 && snap.data.hori.length === 1)
  check('complaints: found without diacritics or capitals, ordinary thanks are not', overviewModel.complains('SŤAŽNOSŤ na faktúru') && overviewModel.complains('Prečo mi nikto neodpovedá?') && !overviewModel.complains('Ďakujem za rýchlu odpoveď.'))
  check('alarms: what burns comes first, then the larger', [{ level: 'pozor', n: 9 }, { level: 'hori', n: 1 }, { level: 'pozor', n: 12 }].sort(overviewModel.byLevel).map((a) => a.n).join() === '1,12,9')
}
