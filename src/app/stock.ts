// Stock (17 October 2026): a company's inventories item by item, what comes in and goes out, their value and the
// entries they give the books. Pure: stock-store.ts keeps them, views/stock.tsx shows them, test/units.test.mjs checks
// every rule and test/stock.runtime.mjs the pages.
//
// What it leans on (read on 17 October 2026): Act No. 431/2002 Z. z. on Accounting, § 25(1)(a) purchased inventories
// at their acquisition cost and own ones at own cost, § 25(5) what leaves the stock valued at the weighted arithmetic
// average or first in, first out (FIFO), § 29 and § 30 the inventory count and its differences; the measure
// MF/23054/2002-92 on accounting procedures for entrepreneurs (as in force on 1 January 2026), § 11 the differences
// of a count (a surplus of purchased inventories to 648 unless an error is shown, of own ones to the change of
// inventories; a shortage to costs: here 549, Manká a škody na majetku) and § 17 what inventories are (material,
// own production, goods). Two ways of keeping it, as the accounting procedures allow: continuously (method A: what
// comes in to 112, 123 or 132 against 111, 613 or 131, what goes out to 501, 613 or 504) or by counts (method B: what
// is bought goes to costs, and each count puts the stock on its account, taken back the next day).
//
// Quantities are in thousandths of a unit, values in cents; an issue's value is the stock's at that moment by the
// valuation chosen, so the stock left always holds what came in less what went out, to the cent.

export type StockMethod = 'A' | 'B'
export type Valuation = 'average' | 'fifo'
export type StockKind = 'goods' | 'material' | 'products'
export type MoveKind = 'in' | 'out' | 'count'

export const STOCK_KINDS: readonly StockKind[] = ['goods', 'material', 'products']
export const VALUATIONS: readonly Valuation[] = ['average', 'fifo']

/**
 * The accounts of each kind: where it stands, what a receipt comes from (method A: the acquisition, or the change of
 * own inventories for products), what an issue and method B's count go against, and where a surplus goes.
 */
export const STOCK_ACCOUNTS: Readonly<Record<StockKind, { stock: string; from: string; to: string; surplus: string }>> = {
  goods: { stock: '132', from: '131', to: '504', surplus: '648' },
  material: { stock: '112', from: '111', to: '501', surplus: '648' },
  products: { stock: '123', from: '613', to: '613', surplus: '613' },
}
/** A shortage found by a count (§ 11 of the accounting procedures, § 30(7) of the Act). */
export const SHORTAGE_ACCOUNT = '549'

export interface StockSettings {
  method: StockMethod
  valuation: Valuation
}

export interface StockItem {
  id: string
  code: string
  name: string
  unit: string
  kind: StockKind
}

export interface StockMove {
  id: string
  itemId: string
  /** P-2026-001 (príjemka), V-2026-001 (výdajka), I-2026-001 (inventúra). */
  number: string
  kind: MoveKind
  on: string
  /** Thousandths of a unit: what came in or went out, or what a count found. */
  quantity: number
  /** Cents: a receipt's value; a count's value under method B; a surplus's value under method A when she gives it. */
  value: number | null
  documentId: string | null
  note: string | null
  createdAt: number
}

/** A move valued: the stock after it, an issue's value, a count's difference (a shortage minus) and its value. */
export interface ValuedMove extends StockMove {
  after: { quantity: number; value: number }
  /** The value that left (an issue) or a count's difference's value, signed as the difference. */
  cost: number
  difference: number
  /** More went out than there was. */
  short: boolean
}

/** Moves in the order they happen: by day; in a day what comes in, then what goes out, then the count of its end. */
export function moveOrder(a: StockMove, b: StockMove): number {
  const rank: Record<MoveKind, number> = { in: 0, out: 1, count: 2 }
  return a.on.localeCompare(b.on) || rank[a.kind] - rank[b.kind] || a.createdAt - b.createdAt || a.number.localeCompare(b.number)
}

/** Value of a part of a stock: its share of the value, to the cent. */
const share = (value: number, part: number, whole: number): number => (whole <= 0 ? 0 : Math.round((value * part) / whole))

/**
 * One item's moves valued in their order. Method A: receipts add, issues and shortages take the value the valuation
 * gives (the weighted average of what is there, or the oldest layers first), a surplus adds at the value she gave or
 * at the stock's average. Method B: each count sets the stock to what was counted at the value she gave.
 */
export function valueItem(moves: readonly StockMove[], settings: StockSettings): ValuedMove[] {
  let quantity = 0
  let value = 0
  let layers: { quantity: number; value: number }[] = []
  let lastUnit = 0
  const take = (wanted: number): { cost: number; short: boolean } => {
    const short = wanted > quantity
    if (settings.valuation === 'average') {
      const cost = wanted >= quantity ? value : share(value, wanted, quantity)
      return { cost, short }
    }
    let left = wanted
    let cost = 0
    const kept: typeof layers = []
    for (const layer of layers) {
      if (left <= 0) {
        kept.push(layer)
        continue
      }
      if (layer.quantity <= left) {
        cost += layer.value
        left -= layer.quantity
      } else {
        const part = share(layer.value, left, layer.quantity)
        cost += part
        kept.push({ quantity: layer.quantity - left, value: layer.value - part })
        left = 0
      }
    }
    layers = kept
    return { cost, short }
  }
  return [...moves].sort(moveOrder).map((m) => {
    let cost = 0
    let difference = 0
    let short = false
    if (settings.method === 'B') {
      // A count is the stock: what was found, at its value.
      if (m.kind === 'count') {
        quantity = m.quantity
        value = m.value ?? 0
        layers = quantity > 0 ? [{ quantity, value }] : []
      }
    } else if (m.kind === 'in') {
      const v = m.value ?? 0
      quantity += m.quantity
      value += v
      layers.push({ quantity: m.quantity, value: v })
      if (m.quantity > 0) lastUnit = v / m.quantity
    } else if (m.kind === 'out') {
      ;({ cost, short } = take(m.quantity))
      quantity -= m.quantity
      value -= cost
      if (quantity <= 0) {
        quantity = Math.min(quantity, 0)
        value = 0
        layers = []
      }
    } else {
      difference = m.quantity - quantity
      if (difference < 0) {
        const taken = take(-difference)
        cost = -taken.cost
        quantity += difference
        value += cost
      } else if (difference > 0) {
        cost = m.value ?? (quantity > 0 ? share(value, difference, quantity) : Math.round(lastUnit * difference))
        quantity += difference
        value += cost
        layers.push({ quantity: difference, value: cost })
      }
      if (quantity <= 0) {
        value = 0
        layers = []
      }
    }
    return { ...m, after: { quantity, value }, cost, difference, short }
  })
}

/** An item's stock at the end of a day: its quantity and value. */
export function stockAt(valued: readonly ValuedMove[], day: string): { quantity: number; value: number } {
  let state = { quantity: 0, value: 0 }
  for (const m of valued) {
    if (m.on > day) break
    state = m.after
  }
  return state
}

/** What a move would do that the stock does not allow: more out than there is, now or by a later move. */
export function shortOf(valued: readonly ValuedMove[]): ValuedMove | null {
  return valued.find((m) => m.short || m.after.quantity < 0) ?? null
}

/** Moves by their item, each list in the order given. */
function groupByItem(moves: readonly StockMove[]): Map<string, StockMove[]> {
  const out = new Map<string, StockMove[]>()
  for (const m of moves) {
    const list = out.get(m.itemId)
    if (list) list.push(m)
    else out.set(m.itemId, [m])
  }
  return out
}

/** An entry the stock gives the books. */
export interface StockEntry {
  key: string
  on: string
  number: string
  text: string
  lines: { md: string; d: string; cents: number }[]
}

const monthName = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`
const nextDay = (day: string): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The entries of a company's stock. Method A: each month's receipts in one entry and its issues in another (each
 * kind its own line, on the day of the month's last move), each count's differences in an entry of its own. Method
 * B: each count puts the stock on its account against the costs (or the change of own inventories) and takes it back
 * the next day, so that the year's purchases and the counted stock make the costs.
 */
export function stockEntries(settings: StockSettings | null, items: readonly StockItem[], moves: readonly StockMove[]): StockEntry[] {
  if (!settings) return []
  const kindOf = new Map(items.map((i) => [i.id, i.kind]))
  const byItem = groupByItem(moves.filter((m) => kindOf.has(m.itemId)))
  const out: StockEntry[] = []
  if (settings.method === 'B') {
    // Each count's day: the counted value of each kind, all items together.
    const counts = new Map<string, Map<StockKind, number>>()
    for (const [itemId, list] of byItem) {
      const kind = kindOf.get(itemId) as StockKind
      for (const m of valueItem(list, settings)) {
        if (m.kind !== 'count') continue
        const day = counts.get(m.on) ?? new Map<StockKind, number>()
        day.set(kind, (day.get(kind) ?? 0) + m.after.value)
        counts.set(m.on, day)
      }
    }
    for (const [day, kinds] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
      const set = STOCK_KINDS.filter((k) => (kinds.get(k) ?? 0) > 0).map((k) => ({ md: STOCK_ACCOUNTS[k].stock, d: STOCK_ACCOUNTS[k].to, cents: kinds.get(k) ?? 0 }))
      if (set.length === 0) continue
      out.push({ key: `s:b:${day}`, on: day, number: `INV ${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`, text: 'Inventúra: stav zásob podľa inventúry', lines: set })
      out.push({ key: `s:b:${day}:spat`, on: nextDay(day), number: `INV ${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`, text: 'Zúčtovanie stavu zásob z inventúry do nákladov', lines: set.map((l) => ({ md: l.d, d: l.md, cents: l.cents })) })
    }
    return out
  }
  type Bucket = { on: string; lines: Map<string, number> }
  const months = new Map<string, Bucket>()
  const bucket = (key: string, on: string) => {
    const b = months.get(key) ?? { on, lines: new Map<string, number>() }
    if (on > b.on) b.on = on
    months.set(key, b)
    return b
  }
  const add = (b: Bucket, md: string, d: string, cents: number) => {
    if (cents === 0) return
    const [from, to, c] = cents > 0 ? [md, d, cents] : [d, md, -cents]
    b.lines.set(`${from}|${to}`, (b.lines.get(`${from}|${to}`) ?? 0) + c)
  }
  for (const [itemId, list] of byItem) {
    const a = STOCK_ACCOUNTS[kindOf.get(itemId) as StockKind]
    for (const m of valueItem(list, settings)) {
      const month = m.on.slice(0, 7)
      if (m.kind === 'in') add(bucket(`in:${month}`, m.on), a.stock, a.from, m.value ?? 0)
      else if (m.kind === 'out') add(bucket(`out:${month}`, m.on), a.to, a.stock, m.cost)
      else if (m.cost < 0) add(bucket(`count:${m.id}`, m.on), SHORTAGE_ACCOUNT, a.stock, -m.cost)
      else if (m.cost > 0) add(bucket(`count:${m.id}`, m.on), a.stock, a.surplus, m.cost)
    }
  }
  const countNumbers = new Map(moves.filter((m) => m.kind === 'count').map((m) => [m.id, m.number]))
  for (const [key, b] of [...months].sort(([, x], [, y]) => x.on.localeCompare(y.on))) {
    const lines = [...b.lines].map(([pair, cents]) => {
      const [md, d] = pair.split('|') as [string, string]
      return { md, d, cents }
    })
    if (lines.length === 0) continue
    const [what, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    if (what === 'count') out.push({ key: `s:i:${rest}`, on: b.on, number: countNumbers.get(rest) ?? 'INV', text: 'Inventúra: rozdiely zásob (manko na 549, prebytok)', lines })
    else out.push({ key: `s:${what}:${rest}`, on: b.on, number: `SKL ${monthName(rest)}`, text: what === 'in' ? `Príjem na sklad za ${monthName(rest)}` : `Výdaj zo skladu za ${monthName(rest)}`, lines })
  }
  return out
}

/** The stock of each item and of each kind at a day, with the accounts' value the books should hold. */
export function stockSummary(settings: StockSettings, items: readonly StockItem[], moves: readonly StockMove[], day: string): { items: { item: StockItem; quantity: number; value: number }[]; kinds: Record<StockKind, number> } {
  const byItem = groupByItem(moves)
  const kinds: Record<StockKind, number> = { goods: 0, material: 0, products: 0 }
  const rows = items.map((item) => {
    const state = stockAt(valueItem(byItem.get(item.id) ?? [], settings), day)
    kinds[item.kind] += state.value
    return { item, ...state }
  })
  return { items: rows, kinds }
}

/** Thousandths of a unit as a quantity is written: "12", "0,5", "1 250,125". */
export function quantityText(milli: number): string {
  const sign = milli < 0 ? '−' : ''
  const whole = Math.trunc(Math.abs(milli) / 1000)
  const part = Math.abs(milli) % 1000
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${grouped}${part ? `,${String(part).padStart(3, '0').replace(/0+$/, '')}` : ''}`
}

/** A quantity as typed ("12", "0,5", "1 250.125") in thousandths; null when it is none, or below nought. */
export function quantityOf(text: string): number | null {
  const plain = text.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,3})?$/.test(plain)) return null
  return Math.round(Number(plain) * 1000)
}

// ---------------------------------------------------------------------------------------------------------------
// What the accountant types: an item, a move, many of either at once (CSV pasted from another program)
// ---------------------------------------------------------------------------------------------------------------

export const STOCK_KIND_NAMES: Readonly<Record<StockKind, string>> = { goods: 'tovar (132)', material: 'materiál (112)', products: 'výrobky (123)' }
export const MOVE_NAMES: Readonly<Record<MoveKind, string>> = { in: 'príjemka', out: 'výdajka', count: 'inventúra' }
/** The units offered; another of up to eight letters may be typed. */
export const STOCK_UNITS = ['ks', 'kg', 'l', 'm', 'm²', 'm³', 't', 'bal'] as const

/** Euros as typed ("1 250,50") in cents; null when it is none, or below nought. */
export function eurosOf(text: string): number | null {
  const plain = text.replace(/[\s €]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null
  return Math.round(Number(plain) * 100)
}

const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s

export interface ItemValues {
  code: string
  name: string
  unit: string
  kind: string
}
export type ItemErrors = Partial<Record<keyof ItemValues | 'form', string>>

/** An item as typed: a code of its own among the company's, a name, a unit, a kind. */
export function readItem(get: (name: string) => unknown, codes: ReadonlySet<string>): { values: ItemValues; item: Omit<StockItem, 'id'> | null; errors: ItemErrors } {
  const text = (name: string, max: number) => (typeof get(name) === 'string' ? (get(name) as string).trim().slice(0, max) : '')
  const values: ItemValues = { code: text('kod', 40), name: text('nazov', 160), unit: text('jednotka', 8) || 'ks', kind: text('druh', 10) }
  const errors: ItemErrors = {}
  if (!/^[\p{L}\p{N}._\-/]{1,40}$/u.test(values.code)) errors.code = 'Kód položky: písmená, číslice, bodka, pomlčka alebo lomka, najviac 40 znakov.'
  else if (codes.has(values.code.toLowerCase())) errors.code = 'Položka s týmto kódom už je.'
  if (values.name === '') errors.name = 'Napíšte názov položky.'
  if (!/^[\p{L}²³.]{1,8}$/u.test(values.unit)) errors.unit = 'Jednotka: ks, kg, l, m alebo iná do ôsmich písmen.'
  if (!(STOCK_KINDS as readonly string[]).includes(values.kind)) errors.kind = 'Vyberte, či ide o tovar, materiál alebo výrobky.'
  if (Object.keys(errors).length > 0) return { values, item: null, errors }
  return { values, item: { code: values.code, name: values.name, unit: values.unit, kind: values.kind as StockKind }, errors }
}

export interface MoveValues {
  kind: string
  item: string
  on: string
  quantity: string
  value: string
  document: string
  note: string
}
export type MoveErrors = Partial<Record<keyof MoveValues | 'form', string>>

/** A move as typed. Method B keeps only counts; a receipt and a count under method B have a value; a count may find nought. */
export function readMove(
  get: (name: string) => unknown,
  settings: StockSettings,
  items: readonly StockItem[],
  documents: ReadonlySet<string>,
): { values: MoveValues; move: Omit<StockMove, 'id' | 'number' | 'createdAt'> | null; errors: MoveErrors } {
  const text = (name: string, max: number) => (typeof get(name) === 'string' ? (get(name) as string).trim().slice(0, max) : '')
  const values: MoveValues = { kind: text('pohyb', 5), item: text('polozka', 40), on: text('den', 10), quantity: text('mnozstvo', 20), value: text('hodnota', 20), document: text('doklad', 40), note: text('poznamka', 300) }
  const errors: MoveErrors = {}
  const kind = values.kind === 'out' || values.kind === 'count' || values.kind === 'in' ? values.kind : null
  if (!kind || (settings.method === 'B' && kind !== 'count')) errors.kind = settings.method === 'B' ? 'Pri spôsobe B sa zapisuje len inventúra.' : 'Vyberte príjemku, výdajku alebo inventúru.'
  if (!items.some((i) => i.id === values.item)) errors.item = 'Vyberte položku.'
  if (!isDay(values.on)) errors.on = 'Zadajte deň pohybu.'
  const quantity = quantityOf(values.quantity)
  if (quantity === null || (quantity === 0 && kind !== 'count')) errors.quantity = 'Množstvo napíšte číslom, najviac s tromi desatinnými miestami.'
  const value = values.value === '' ? null : eurosOf(values.value)
  if (values.value !== '' && value === null) errors.value = 'Hodnotu napíšte v eurách, napríklad 120,50.'
  else if (value === null && (kind === 'in' || (kind === 'count' && settings.method === 'B'))) errors.value = kind === 'in' ? 'Príjemka potrebuje hodnotu (obstarávaciu cenu alebo vlastné náklady).' : 'Inventúra pri spôsobe B potrebuje hodnotu zásob.'
  if (values.document !== '' && !documents.has(values.document)) errors.document = 'Doklad nie je medzi dokladmi firmy.'
  if (Object.keys(errors).length > 0 || !kind || quantity === null) return { values, move: null, errors }
  return {
    values,
    move: { itemId: values.item, kind, on: values.on, quantity, value: kind === 'out' ? null : value, documentId: values.document || null, note: values.note || null },
    errors,
  }
}

const CSV_KINDS: Readonly<Record<string, MoveKind>> = { prijem: 'in', 'príjem': 'in', prijemka: 'in', 'príjemka': 'in', in: 'in', vydaj: 'out', 'výdaj': 'out', vydajka: 'out', 'výdajka': 'out', out: 'out', inventura: 'count', 'inventúra': 'count', count: 'count' }

/** The cells of a CSV line, by semicolon or tab (as a spreadsheet saves it), quotes taken off. */
const cells = (line: string): string[] => line.split(line.includes('\t') ? '\t' : ';').map((c) => c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'))

/** At most this many lines of one paste: what a Worker reads and writes at once. */
export const IMPORT_LINES = 2000

/**
 * Moves pasted from another program, one a line: day; item's code; kind (príjem, výdaj, inventúra); quantity; value in
 * euros (a receipt's, a count's under method B); note. A first line of headings is skipped. Every line right, or none
 * is taken: what is wrong is said by its line.
 */
export function parseMovesCsv(text: string, settings: StockSettings, items: readonly StockItem[]): { moves: Omit<StockMove, 'id' | 'number' | 'createdAt'>[]; errors: string[] } {
  const byCode = new Map(items.map((i) => [i.code.toLowerCase(), i]))
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const errors: string[] = []
  const moves: Omit<StockMove, 'id' | 'number' | 'createdAt'>[] = []
  if (lines.length > IMPORT_LINES) return { moves: [], errors: [`Naraz najviac ${IMPORT_LINES} riadkov; rozdeľte ich.`] }
  lines.forEach((line, i) => {
    const [dayText = '', code = '', kindText = '', qtyText = '', valueText = '', note = ''] = cells(line)
    if (i === 0 && !/\d/.test(dayText)) return
    const n = i + 1
    const day = /^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(dayText) ? (() => { const [d, m, y] = dayText.split('.').map((x) => x.trim()); return `${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}` })() : dayText
    const item = byCode.get(code.toLowerCase())
    const kind = CSV_KINDS[kindText.toLowerCase()]
    const quantity = quantityOf(qtyText)
    const value = valueText === '' ? null : eurosOf(valueText)
    const wrong: string[] = []
    if (!isDay(day)) wrong.push('deň')
    if (!item) wrong.push(`neznámy kód ${code || '(prázdny)'}`)
    if (!kind || (settings.method === 'B' && kind !== 'count')) wrong.push(settings.method === 'B' ? 'pri spôsobe B len inventúra' : 'druh (príjem, výdaj, inventúra)')
    if (quantity === null || (quantity === 0 && kind !== 'count')) wrong.push('množstvo')
    if (valueText !== '' && value === null) wrong.push('hodnota')
    else if (value === null && (kind === 'in' || (kind === 'count' && settings.method === 'B'))) wrong.push('chýba hodnota')
    if (wrong.length > 0 || !item || !kind || quantity === null) {
      errors.push(`Riadok ${n}: ${wrong.join(', ')}.`)
      return
    }
    moves.push({ itemId: item.id, kind, on: day, quantity, value: kind === 'out' ? null : value, documentId: null, note: note.slice(0, 300) || null })
  })
  if (moves.length === 0 && errors.length === 0) errors.push('Nie je tu žiadny riadok.')
  return { moves: errors.length > 0 ? [] : moves, errors: errors.slice(0, 50) }
}

/** Items pasted, one a line: code; name; unit; kind (tovar, materiál, výrobky). Every line right, or none is taken. */
export function parseItemsCsv(text: string, codes: ReadonlySet<string>): { items: Omit<StockItem, 'id'>[]; errors: string[] } {
  const kinds: Record<string, StockKind> = { tovar: 'goods', goods: 'goods', '132': 'goods', 'materiál': 'material', material: 'material', '112': 'material', 'výrobky': 'products', vyrobky: 'products', products: 'products', '123': 'products' }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const errors: string[] = []
  const items: Omit<StockItem, 'id'>[] = []
  const seen = new Set(codes)
  if (lines.length > IMPORT_LINES) return { items: [], errors: [`Naraz najviac ${IMPORT_LINES} riadkov; rozdeľte ich.`] }
  lines.forEach((line, i) => {
    const [code = '', name = '', unit = '', kindText = ''] = cells(line)
    if (i === 0 && /^k[óo]d$/i.test(code)) return
    const read = readItem((f) => ({ kod: code, nazov: name, jednotka: unit, druh: kinds[kindText.toLowerCase()] ?? '' })[f], seen)
    if (!read.item) {
      errors.push(`Riadok ${i + 1}: ${Object.values(read.errors).join(' ')}`)
      return
    }
    seen.add(read.item.code.toLowerCase())
    items.push(read.item)
  })
  if (items.length === 0 && errors.length === 0) errors.push('Nie je tu žiadny riadok.')
  return { items: errors.length > 0 ? [] : items, errors: errors.slice(0, 50) }
}
