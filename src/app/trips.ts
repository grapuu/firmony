// Business trips at home (18 October 2026): what an employee (or a director) is owed for a trip in Slovakia under Act
// No. 283/2002 Z. z. on travel compensation, worked out from its times, the meals given free and the private car used,
// and kept as a document of the company owed to that person (512 Cestovné against 333 Ostatné záväzky voči
// zamestnancom, category 'allowance'), which the payment to the person then settles.
//
// What it leans on (read on 18 October 2026 in podnikajte.sk's "Cestovné náhrady v roku 2026", updated 27 July 2026,
// which names the measures, and its "Konateľ s.r.o. a cestovné náhrady"):
// - The meal allowance for each calendar day of the trip by the time spent on it that day: 5 to 12 hours 9,30 €, over
//   12 to 18 hours 13,80 €, over 18 hours 20,60 € (measure of the ministry of labour No. 280/2025 Z. z., from
//   1 December 2025); under 5 hours of a day nothing.
// - A meal given free lowers that day's allowance by a share of the over-18-hours amount: breakfast 25 % (5,15 €),
//   lunch 40 % (8,24 €), dinner 35 % (7,21 €); never below nothing.
// - A private car: the basic compensation 0,313 € for each started kilometre (measure No. 340/2025 Z. z., from
//   1 January 2026) and the fuel: the kilometres times the consumption per 100 km (the vehicle's document) times the
//   price of a litre (the purchase receipt, else the Statistical Office's average price on the day of departure), each
//   part rounded to the cent.
// - A director who is not employed is owed the same for a trip in that office (§ 1(1) and (2) of the Act).
// - The employer settles within 10 working days of getting the papers (§ 36): the document is due then.
// Not worked out here: trips abroad (allowances by country, set by the ministry of finance), costs proven by documents
// (tickets, accommodation, parking: documents of their own), an advance before the trip, a company car (its fuel is
// the company's own purchase), the hour summer time adds or takes on its night.

/** The meal allowances of a day by its hours (5 to 12, over 12 to 18, over 18), in cents, from the day each measure holds. */
export const MEAL_RATES: readonly { from: string; bands: readonly [number, number, number]; measure: string }[] = [{ from: '2025-12-01', bands: [930, 1380, 2060], measure: '280/2025 Z. z.' }]

/** The basic compensation of a private car for each started kilometre, in thousandths of a euro. */
export const CAR_RATES: readonly { from: string; milliPerKm: number; measure: string }[] = [{ from: '2026-01-01', milliPerKm: 313, measure: '340/2025 Z. z.' }]

/** A free meal's cut, as a share of the over-18-hours allowance. */
export const MEAL_CUTS = { breakfast: 25, lunch: 40, dinner: 35 } as const

/** The first day a trip may start: both measures hold from it. */
export const TRIPS_FROM = '2026-01-01'

/** The longest trip worked out at once. */
export const TRIP_MAX_DAYS = 31

export type Transport = 'car' | 'company' | 'public' | 'other'
export const TRANSPORTS: readonly Transport[] = ['car', 'company', 'public', 'other']

export interface Meals {
  breakfast?: boolean
  lunch?: boolean
  dinner?: boolean
}

export interface TripCar {
  /** Started kilometres driven. */
  km: number
  /** Consumption in hundredths of a litre per 100 km (650 is 6,5 l). */
  consumption: number
  /** The price of a litre in thousandths of a euro (1539 is 1,539 €). */
  priceMilli: number
}

export interface TripInput {
  /** Departure and return, local time: YYYY-MM-DDTHH:MM. */
  start: string
  end: string
  /** The meals given free, by day (YYYY-MM-DD). */
  meals: Record<string, Meals>
  car: TripCar | null
}

export interface TripDayResult {
  day: string
  /** Minutes of the trip on that calendar day. */
  minutes: number
  breakfast: boolean
  lunch: boolean
  dinner: boolean
  allowance: number
  cut: number
  owed: number
}

export interface TripResult {
  days: TripDayResult[]
  meals: number
  carBasic: number
  carFuel: number
  total: number
}

const minutesOf = (at: string) => Date.parse(`${at}:00Z`) / 60000
const dayAfter = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** The rates of a day: the newest measure that holds on it, or null before the first. */
export function mealRatesOn(day: string): readonly [number, number, number] | null {
  return [...MEAL_RATES].reverse().find((r) => r.from <= day)?.bands ?? null
}
export function carRateOn(day: string): number | null {
  return [...CAR_RATES].reverse().find((r) => r.from <= day)?.milliPerKm ?? null
}

/** A local time as the form writes it ("2026-10-14T07:30") or as Slovak types it ("14. 10. 2026 7:30"); null when it is none. */
export function tripTime(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})$/.exec(t)
  const sk = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2})[:.](\d{2})$/.exec(t)
  const parts = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5]] : sk ? [sk[3], sk[2], sk[1], sk[4], sk[5]] : null
  if (!parts) return null
  const [y, mo, d, h, mi] = parts.map(Number) as [number, number, number, number, number]
  if (h > 23 || mi > 59 || y < 2000 || y > 2100) return null
  const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const check = new Date(`${day}T12:00:00Z`)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) return null
  return `${day}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** The calendar days of a trip with the minutes spent on each. */
export function tripDays(start: string, end: string): { day: string; minutes: number }[] {
  const from = minutesOf(start)
  const to = minutesOf(end)
  if (!(to > from)) return []
  const out: { day: string; minutes: number }[] = []
  for (let day = start.slice(0, 10), i = 0; i <= TRIP_MAX_DAYS + 1 && day <= end.slice(0, 10); i++, day = dayAfter(day)) {
    const dayStart = Math.max(from, minutesOf(`${day}T00:00`))
    const dayEnd = Math.min(to, minutesOf(`${dayAfter(day)}T00:00`))
    if (dayEnd > dayStart) out.push({ day, minutes: dayEnd - dayStart })
  }
  return out
}

/** The allowance of a day by its minutes: 5 to 12 hours, over 12 to 18, over 18; nothing under 5 hours. */
export function allowanceOf(minutes: number, bands: readonly [number, number, number]): number {
  if (minutes > 18 * 60) return bands[2]
  if (minutes > 12 * 60) return bands[1]
  return minutes >= 5 * 60 ? bands[0] : 0
}

/** What a trip is owed, day by day, and for the car; null when a day of it has no measure. */
export function tripOf(input: TripInput): TripResult | null {
  const days: TripDayResult[] = []
  for (const { day, minutes } of tripDays(input.start, input.end)) {
    const bands = mealRatesOn(day)
    if (!bands) return null
    const m = input.meals[day] ?? {}
    const allowance = allowanceOf(minutes, bands)
    const cutOf = (share: number) => Math.round((bands[2] * share) / 100)
    const cut = (m.breakfast ? cutOf(MEAL_CUTS.breakfast) : 0) + (m.lunch ? cutOf(MEAL_CUTS.lunch) : 0) + (m.dinner ? cutOf(MEAL_CUTS.dinner) : 0)
    days.push({ day, minutes, breakfast: Boolean(m.breakfast), lunch: Boolean(m.lunch), dinner: Boolean(m.dinner), allowance, cut, owed: Math.max(0, allowance - cut) })
  }
  const meals = days.reduce((sum, d) => sum + d.owed, 0)
  const car = input.car
  const perKm = car ? carRateOn(input.start.slice(0, 10)) : 0
  if (perKm === null) return null
  const carBasic = car ? Math.round((car.km * perKm) / 10) : 0
  // km × (litres per 100 km) / 100 × € a litre, in cents: consumption is in hundredths of a litre and the price in
  // thousandths of a euro, so km × consumption × price / (100 × 100 × 1000) euros, × 100 cents.
  const carFuel = car ? Math.round((car.km * car.consumption * car.priceMilli) / 100_000) : 0
  return { days, meals, carBasic, carFuel, total: meals + carBasic + carFuel }
}

/** A day plus `n` working days (the employer's 10 working days to settle, § 36). */
export function workingDaysAfter(day: string, n: number, isWorkingDay: (day: string) => boolean): string {
  let at = day
  for (let left = n, i = 0; left > 0 && i < 60; i++) {
    at = dayAfter(at)
    if (isWorkingDay(at)) left--
  }
  return at
}

// ---------------------------------------------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------------------------------------------

export interface TripValues {
  traveller: string
  employee: string
  iban: string
  purpose: string
  from: string
  to: string
  start: string
  end: string
  transport: Transport
  plate: string
  km: string
  consumption: string
  price: string
  /** Whether any meal was given free on the trip; only then is it asked day by day. */
  free: boolean
  meals: Record<string, Meals>
  /** The days the meals were shown for, as the page carried them. */
  shown: string
}

export type TripErrors = Partial<Record<'traveller' | 'purpose' | 'places' | 'start' | 'end' | 'car' | 'iban' | 'meals', string>>

export interface TripCopy {
  traveller: string
  purpose: string
  places: string
  start: string
  end: string
  before: (day: string) => string
  long: (days: number) => string
  future: string
  car: string
  iban: string
  meals: string
}

/** A decimal typed the Slovak way ("6,5", "1,539"), in units of 1/`scale`; null when empty, NaN when it is no number. */
export function scaled(text: string, scale: number): number | null {
  const t = text.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN
  return Math.round(Number(t) * scale)
}

/** What a trip's form posted, checked: the values to show again, what is wrong, and what to work out. */
export function readTrip(field: (name: string) => unknown, copy: TripCopy, now: string, checkIban: (iban: string) => boolean): { values: TripValues; errors: TripErrors; input: TripInput | null } {
  const text = (name: string, max = 200) => {
    const v = field(name)
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  const transport = TRANSPORTS.includes(text('doprava') as Transport) ? (text('doprava') as Transport) : 'car'
  const values: TripValues = {
    traveller: text('kto', 120),
    employee: text('zamestnanec', 64),
    iban: text('iban', 42),
    purpose: text('ucel', 300),
    from: text('odkial', 120),
    to: text('kam', 200),
    start: text('odchod', 20),
    end: text('navrat', 20),
    transport,
    plate: text('spz', 12),
    km: text('km', 8),
    consumption: text('spotreba', 8),
    price: text('cena', 8),
    free: text('jedlo') === 'ano',
    meals: {},
    shown: text('dni', 400),
  }
  const errors: TripErrors = {}
  if (!values.traveller && !values.employee) errors.traveller = copy.traveller
  if (!values.purpose) errors.purpose = copy.purpose
  if (!values.from || !values.to) errors.places = copy.places
  const start = tripTime(values.start)
  const end = tripTime(values.end)
  if (!start) errors.start = copy.start
  else if (start.slice(0, 10) < TRIPS_FROM) errors.start = copy.before(TRIPS_FROM)
  if (!end || (start && end <= start)) errors.end = copy.end
  else if (end > now) errors.end = copy.future
  const days = start && end && end > start ? tripDays(start, end) : []
  if (days.length > TRIP_MAX_DAYS) errors.end = copy.long(TRIP_MAX_DAYS)
  for (const { day } of values.free ? days : []) {
    const m: Meals = { breakfast: field(`r-${day}`) === '1', lunch: field(`o-${day}`) === '1', dinner: field(`v-${day}`) === '1' }
    if (m.breakfast || m.lunch || m.dinner) values.meals[day] = m
  }
  let car: TripCar | null = null
  if (transport === 'car') {
    const km = values.km.replace(/\s/g, '') === '' ? null : /^\d{1,5}$/.test(values.km.replace(/\s/g, '')) ? Number(values.km.replace(/\s/g, '')) : Number.NaN
    const consumption = scaled(values.consumption, 100)
    const price = scaled(values.price, 1000)
    const ok = (n: number | null, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max
    if (!ok(km, 20000) || !ok(consumption, 3000) || !ok(price, 10000)) errors.car = copy.car
    else car = { km, consumption, priceMilli: price }
  }
  if (values.iban && !checkIban(values.iban.replace(/\s/g, '').toUpperCase())) errors.iban = copy.iban
  // The meals are asked for each day of the trip: a form that showed other days (the times changed) shows them again.
  if (values.free && days.length > 0 && values.shown !== days.map((d) => d.day).join(',')) errors.meals = copy.meals
  const input = Object.keys(errors).length === 0 && start && end ? { start, end, meals: values.meals, car } : null
  return { values, errors, input }
}

/** The days of a trip as the form shows them for its meals, from what was typed (none while the times are not right). */
export function formDays(values: Pick<TripValues, 'start' | 'end'>): string[] {
  const start = tripTime(values.start)
  const end = tripTime(values.end)
  if (!start || !end || end <= start) return []
  const days = tripDays(start, end)
  return days.length > TRIP_MAX_DAYS ? [] : days.map((d) => d.day)
}
