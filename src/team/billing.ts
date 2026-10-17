// What Firmony bills its clients, as article 4 of the terms says it: the plan's monthly price in advance (4.1, 4.3),
// a month in which more documents came than the plan is for as the nearest higher plan (4.2), payroll for each
// person employed in a month (4.1), and the closing with the corporate income tax return once it is filed (4.3).
//
// Nothing of it is typed: every line is worked out from what the app holds (the contract's prices, the documents
// that came, the employees, the closings filed), and what was billed is kept by its key (plan:2027-01,
// extra:2026-12, payroll:2026-12, closing:2026), so a month is never billed twice and none is left out, however
// late the administrator issues the invoices. Pure: the database is billing-store.ts.

export interface TariffPlan {
  id: string
  name: string
  docs: number
  monthlyCents: number
}

/** The prices a client is billed by: those saved with its contract, else today's price list (to be checked). */
export interface Tariff {
  /** contract: saved when the contract was concluded online; paper: saved when a client with a paper contract was
   * made; pricelist: neither exists (an older client), so today's price list stands in and the administrator checks it. */
  source: 'contract' | 'paper' | 'pricelist'
  plans: TariffPlan[]
  payrollCents: number
  closingCents: number
}

export interface BillingFacts {
  /** The month the invoice is issued in (YYYY-MM). */
  month: string
  /** The contract's first day, and its last day once notice was given. */
  startOn: string | null
  endsOn: string | null
  plan: string
  tariff: Tariff
  /** Documents that came in, by the month they came (YYYY-MM). Our own invoices are not among them. */
  docs: ReadonlyMap<string, number>
  /** People employed, by month. */
  people: ReadonlyMap<string, number>
  /** Years whose closing and income tax return were filed. */
  closings: readonly number[]
  /** Keys already billed. */
  billed: ReadonlySet<string>
}

export interface BillingLine {
  key: string
  description: string
  /** How many, in thousandths, as an invoice line counts them. */
  quantityMilli: number
  unit: 'mes' | 'ks'
  unitCents: number
  cents: number
}

/**
 * What keeps a line from being billed as it stands, or asks the administrator to look:
 * pricelist: no saved prices (check them against the client's contract);
 * agree: a month with more documents than the highest plan is for (4.2: a price is to be agreed; the highest plan is billed until then);
 * plan: the client's plan is not in its tariff (nothing of the plan can be billed).
 */
export type BillingFlag = 'pricelist' | 'agree' | 'plan'

export interface BillingDraft {
  lines: BillingLine[]
  flags: BillingFlag[]
  totalCents: number
}

/** How far back an unbilled month is still billed. Older ones are the administrator's to settle by hand. */
export const BILLING_BACK_MONTHS = 12

const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
const monthText = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`

/** The month n months after a YYYY-MM (n may be negative). */
export function addMonths(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Every month from one to another, both included; none when the first is later. */
export function monthsFrom(first: string, last: string): string[] {
  const months: string[] = []
  for (let m = first; m <= last && months.length < 600; m = addMonths(m, 1)) months.push(m)
  return months
}

/** The plan a month is billed as: the client's own, or the nearest higher one its documents need (4.2). */
export function planForMonth(own: TariffPlan, plans: readonly TariffPlan[], docs: number): { plan: TariffPlan; agree: boolean } {
  if (docs <= own.docs) return { plan: own, agree: false }
  const larger = [...plans].filter((p) => p.monthlyCents >= own.monthlyCents).sort((a, b) => a.docs - b.docs)
  const fits = larger.find((p) => p.docs >= docs)
  if (fits) return { plan: fits, agree: false }
  // More than the highest plan is for: a price is to be agreed, and until it is, the highest plan is billed.
  return { plan: larger[larger.length - 1] ?? own, agree: true }
}

export function draftOf(f: BillingFacts): BillingDraft {
  const flags = new Set<BillingFlag>()
  const lines: BillingLine[] = []
  if (f.tariff.source === 'pricelist') flags.add('pricelist')
  const own = f.tariff.plans.find((p) => p.id === f.plan)
  if (!f.startOn) return { lines, flags: [...flags], totalCents: 0 }
  const first = f.startOn.slice(0, 7)
  const last = f.endsOn ? f.endsOn.slice(0, 7) : null
  const earliest = addMonths(f.month, -BILLING_BACK_MONTHS)
  const from = first > earliest ? first : earliest
  const line = (key: string, description: string, quantityMilli: number, unit: BillingLine['unit'], unitCents: number) => {
    const cents = Math.round((quantityMilli * unitCents) / 1000)
    if (cents > 0 && !f.billed.has(key)) lines.push({ key, description, quantityMilli, unit, unitCents, cents })
  }
  if (!own) flags.add('plan')
  else {
    // The plan of each month in advance, the month of the invoice included, and none after the contract's last month.
    const until = last && last < f.month ? last : f.month
    for (const m of monthsFrom(from, until)) line(`plan:${m}`, `Balík ${own.name}, ${monthText(m)}`, 1000, 'mes', own.monthlyCents)
  }
  // What a month used, once it has ended: more documents than the plan is for, and payroll.
  const usedUntil = last && last < addMonths(f.month, -1) ? last : addMonths(f.month, -1)
  for (const m of monthsFrom(from, usedUntil)) {
    const docs = f.docs.get(m) ?? 0
    if (own) {
      const { plan, agree } = planForMonth(own, f.tariff.plans, docs)
      // Only the month that has just ended asks for an agreed price; earlier ones were seen on earlier invoices.
      if (agree && m === addMonths(f.month, -1)) flags.add('agree')
      if (plan.id !== own.id)
        line(`extra:${m}`, `Doklady za ${monthText(m)}: ${docs}, vyúčtované ako balík ${plan.name}`, 1000, 'mes', plan.monthlyCents - own.monthlyCents)
    }
    const people = f.people.get(m) ?? 0
    if (people > 0) line(`payroll:${m}`, `Mzdy za ${monthText(m)}`, people * 1000, 'ks', f.tariff.payrollCents)
  }
  // The closing of a year we kept the books for, once it is filed (4.3), also after the contract ended.
  for (const year of [...f.closings].sort((a, b) => a - b))
    if (String(year) >= first.slice(0, 4)) line(`closing:${year}`, `Účtovná závierka a daňové priznanie za rok ${year}`, 1000, 'ks', f.tariff.closingCents)
  return { lines, flags: [...flags], totalCents: lines.reduce((sum, l) => sum + l.cents, 0) }
}

/** How many people were employed in a month, from their first and last days. */
export function peopleIn(month: string, employees: readonly { startedOn: string; endedOn: string | null }[]): number {
  const firstDay = `${month}-01`
  const lastDay = `${month}-31`
  return employees.filter((e) => e.startedOn <= lastDay && (!e.endedOn || e.endedOn >= firstDay)).length
}

/** The unix second a Bratislava month begins: 00:00 on its first day, in summer or in winter time. */
export function monthStart(month: string): number {
  const utcMidnight = Date.parse(`${month}-01T00:00:00Z`) / 1000
  // 22:00 UTC the day before is midnight in summer time (UTC+2), 23:00 UTC in winter time (UTC+1).
  const summer = utcMidnight - 7200
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(summer * 1000))
  return day === `${month}-01` ? summer : utcMidnight - 3600
}
