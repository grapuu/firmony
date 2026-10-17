// Taking a client's books over from the program the accountant before kept them in (Pohoda, Omega, Money, KROS or any
// other): what each of its exports holds, read into what Firmony keeps. Pure; the page and the writes are in routes
// and takeover-store.ts. Every list is read all or none: a line that cannot be read is said with its number.
//
// - The trial balance (obratová predvaha) at the day before the books start: the closing balance of every balance-sheet
//   account (classes 0 to 4) becomes the opening balances; costs and revenues of a trial balance not yet closed make the
//   year's result, put on 431 (výsledok hospodárenia v schvaľovaní); classes 7 to 9 are left out. A synthetic account
//   listed with its analytic ones counts once, by them.
// - The open items (saldokonto): each invoice issued or received that was not paid, with what is left of it, becomes a
//   document dated before the books start, which the books leave out (the opening balances hold 311 and 321) and which
//   the payment that comes later pairs with.
// - The register of fixed assets: each asset with its entry price, the day put in use, its group and method, and what
//   was depreciated of it before (an asset of the opening balances, assets.ts).
// - The employees, for payroll.
// - The financial statements the accountant before filed (the eForm's XML from eDane, Úč MUJ or Úč POD): the year
//   before ours for the closing's second column and the size group, and the year before that from its own column.
// - Pohoda's XML export of invoices (dataPack, inv:invoice): the open items without a table.
import { XMLParser } from 'fast-xml-parser'
import { canonicalAccount, accountClass } from './ledger'
import { amountOf, dayOf, findColumns, plainHeading } from './table-read'
import { BALANCE_ROWS, PROFIT_ROWS } from './closing'
import { POD_ASSET_ROWS, POD_LIABILITY_ROWS, POD_PROFIT_ROWS } from './closing-pod'
import { isContract, type ContractKind } from './payroll'
import { GROUP_YEARS, isAssetAccount, type AssetAccount } from './assets'

/** A line that could not be read: its number in the file (1 is the first) and why. */
export interface LineIssue {
  line: number
  what: string
}

const cell = (row: readonly string[], index: number | undefined) => (index === undefined ? '' : (row[index] ?? '').trim())

// ---------------------------------------------------------------------------------------------------------------
// The trial balance
// ---------------------------------------------------------------------------------------------------------------

const TRIAL = {
  account: ['účet', 'ucet', 'číslo účtu', 'analytický účet', 'syntetický účet', 'účet číslo', 'analytika', 'ú'],
  ksMd: ['ks md', 'konečný stav md', 'konečný zostatok md', 'zostatok md', 'stav md', 'kz md', 'konečný stav má dať', 'ks má dať'],
  ksD: ['ks d', 'ks dal', 'konečný stav d', 'konečný stav dal', 'konečný zostatok d', 'zostatok d', 'zostatok dal', 'stav d', 'kz d', 'konečný stav dal'],
  ks: ['konečný stav', 'konečný zostatok', 'zostatok', 'zůstatek', 'konečný zůstatek', 'ks', 'stav'],
  psMd: ['ps md', 'počiatočný stav md', 'počáteční stav md'],
  psD: ['ps d', 'ps dal', 'počiatočný stav d', 'počiatočný stav dal', 'počáteční stav d', 'počáteční stav dal'],
  ps: ['počiatočný stav', 'počáteční stav', 'ps'],
  obMd: ['obrat md', 'obraty md', 'md obrat', 'obrat má dať', 'obraty má dať', 'md'],
  obD: ['obrat d', 'obraty d', 'obrat dal', 'obraty dal', 'd obrat', 'dal', 'd'],
} as const

export interface OpeningLine {
  account: string
  md: number
  d: number
}

export interface TrialBalance {
  lines: OpeningLine[]
  /** The result of the year made of the costs and revenues listed (put on 431): plus a profit. */
  result: number
  md: number
  d: number
  issues: LineIssue[]
  /** No heading row was found. */
  noColumns: boolean
}

/** A balance by the columns the table has: the closing balance (MD and D, or one signed), else the opening one with the turnover. */
function balanceOf(row: readonly string[], cols: Partial<Record<keyof typeof TRIAL, number>>): number | null {
  const a = (k: keyof typeof TRIAL) => amountOf(cell(row, cols[k]))
  if (cols.ksMd !== undefined || cols.ksD !== undefined) {
    const md = a('ksMd')
    const d = a('ksD')
    if (Number.isNaN(md) || Number.isNaN(d)) return Number.NaN
    return (md ?? 0) - (d ?? 0)
  }
  if (cols.ks !== undefined) {
    const raw = cell(row, cols.ks)
    // "1 234,56 D" or "1 234,56 Dal": the side written after the amount.
    const side = /\s*(md|d|dal)\.?$/i.exec(raw)
    const v = amountOf(side ? raw.slice(0, side.index) : raw)
    if (v === null || Number.isNaN(v)) return v
    return side && side[1]!.toLowerCase() !== 'md' ? -Math.abs(v) : v
  }
  const ps = cols.psMd !== undefined || cols.psD !== undefined ? (a('psMd') ?? 0) - (a('psD') ?? 0) : (a('ps') ?? 0)
  const md = a('obMd')
  const d = a('obD')
  if ([ps, md, d].some((x) => Number.isNaN(x))) return Number.NaN
  return ps + (md ?? 0) - (d ?? 0)
}

/** The opening balances from a trial balance's rows. */
export function trialBalance(rows: readonly string[][]): TrialBalance {
  const found = findColumns(rows, TRIAL, ['account'])
  const out: TrialBalance = { lines: [], result: 0, md: 0, d: 0, issues: [], noColumns: false }
  if (!found || !['ksMd', 'ksD', 'ks', 'obMd', 'obD'].some((k) => found.cols[k as keyof typeof TRIAL] !== undefined)) return { ...out, noColumns: true }
  const balances = new Map<string, number>()
  for (let i = found.header + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const raw = cell(row, found.cols.account)
    // The account as the cell begins ("311100", "311.100", "311 100 Odberatelia"); a heading, a class total or a
    // line of class 8 or 9 has none.
    const token = /^([0-9][0-9 .-]*)/.exec(raw)?.[1]?.replace(/[\s.-]+$/, '') ?? ''
    const account = canonicalAccount(token.replace(/\s/g, ''))
    const balance = account || /^[0-7]\d{3,}/.test(token.replace(/[\s.-]/g, '')) ? balanceOf(row, found.cols) : null
    if (!account) {
      // An analytic number longer than three digits: said, never left out quietly.
      if (balance !== null && balance !== 0) out.issues.push({ line: i + 1, what: `${raw}: analytický účet najviac s tromi číslicami` })
      continue
    }
    if (balance === null) continue
    if (Number.isNaN(balance)) {
      out.issues.push({ line: i + 1, what: raw })
      continue
    }
    balances.set(account, (balances.get(account) ?? 0) + balance)
  }
  // A synthetic account listed with its analytic ones: by them.
  for (const account of [...balances.keys()]) if (!account.includes('.') && [...balances.keys()].some((a) => a.startsWith(`${account}.`))) balances.delete(account)
  let result = 0
  for (const [account, balance] of [...balances.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cls = accountClass(account)
    if (cls === 5 || cls === 6) {
      result -= balance
      continue
    }
    if (cls > 4 || balance === 0) continue
    out.lines.push({ account, md: balance > 0 ? balance : 0, d: balance < 0 ? -balance : 0 })
  }
  if (result !== 0) {
    const i = out.lines.findIndex((l) => l.account === '431')
    const line = i >= 0 ? out.lines[i]! : { account: '431', md: 0, d: 0 }
    const net = line.md - line.d - result
    const merged = { account: '431', md: net > 0 ? net : 0, d: net < 0 ? -net : 0 }
    if (i >= 0) out.lines[i] = merged
    else out.lines.push(merged)
  }
  out.lines = out.lines.filter((l) => l.md !== 0 || l.d !== 0)
  out.result = result
  out.md = out.lines.reduce((s, l) => s + l.md, 0)
  out.d = out.lines.reduce((s, l) => s + l.d, 0)
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The open items
// ---------------------------------------------------------------------------------------------------------------

const OPEN = {
  kind: ['druh', 'typ', 'typ dokladu', 'druh dokladu', 'agenda', 'typ faktúry'],
  account: ['účet', 'saldokontný účet', 'účet md', 'účet d'],
  number: ['číslo dokladu', 'číslo faktúry', 'číslo', 'doklad', 'faktúra', 'evidenčné číslo', 'číslo dokladu dodávateľa'],
  vs: ['vs', 'var symbol', 'variabilný symbol', 'v symbol', 'symbol'],
  party: ['partner', 'odberateľ', 'dodávateľ', 'firma', 'názov firmy', 'obchodné meno', 'názov partnera', 'odberateľ dodávateľ', 'meno', 'názov'],
  ico: ['ičo', 'ico', 'ič'],
  issued: ['dátum vystavenia', 'vystavené', 'vystavená', 'dátum dokladu', 'dátum'],
  due: ['dátum splatnosti', 'splatnosť', 'splatné', 'splatná'],
  total: ['suma celkom', 'celkom', 'suma', 'k úhrade', 'spolu', 'celková suma', 'suma s dph'],
  left: ['zostáva uhradiť', 'zostáva', 'zostatok', 'neuhradené', 'na úhradu', 'nedoplatok', 'zostatok na úhradu', 'neuhradená suma'],
} as const

export type OpenSide = 'issued' | 'received'

export interface OpenItem {
  side: OpenSide
  number: string
  vs: string | null
  party: string | null
  ico: string | null
  issuedOn: string | null
  dueOn: string | null
  /** What is left to pay. */
  cents: number
  /** Its line in the file (its order in an XML). */
  line: number
}

/** The side of an item from its kind or account: issued (a receivable, 311) or received (a payable, 321). */
function sideOf(kind: string, account: string): OpenSide | null {
  const k = plainHeading(kind)
  if (/^31[1-5]/.test(account) || /vydan|odberat|pohladav|^fv\b|^ofv\b/.test(k)) return 'issued'
  if (/^32[1-5]/.test(account) || /prijat|dodavat|zavaz|^fp\b|^dfp\b/.test(k)) return 'received'
  return null
}

/** The open items of a list; a side the list does not say is `fallback` (the accountant's choice). */
export function openItems(rows: readonly string[][], fallback: OpenSide | null): { items: OpenItem[]; issues: LineIssue[]; noColumns: boolean } {
  const found = findColumns(rows, OPEN, ['number'])
  if (!found || (found.cols.total === undefined && found.cols.left === undefined)) return { items: [], issues: [], noColumns: true }
  const items: OpenItem[] = []
  const issues: LineIssue[] = []
  const seen = new Set<string>()
  for (let i = found.header + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const number = cell(row, found.cols.number)
    if (number === '' || /^(spolu|celkom|súčet|sucet)/i.test(number)) continue
    const leftText = cell(row, found.cols.left)
    const amount = found.cols.left !== undefined && leftText !== '' ? amountOf(leftText) : amountOf(cell(row, found.cols.total))
    const side = sideOf(cell(row, found.cols.kind), cell(row, found.cols.account)) ?? fallback
    const issuedText = cell(row, found.cols.issued)
    const dueText = cell(row, found.cols.due)
    const issuedOn = dayOf(issuedText)
    const dueOn = dayOf(dueText)
    const why =
      amount === null || Number.isNaN(amount)
        ? 'suma'
        : amount < 0
          ? 'záporná suma (dobropis zapíšte ručne)'
          : !side
            ? 'nevieme, či je vydaná alebo prijatá'
            : issuedText && !issuedOn
              ? 'dátum vystavenia'
              : dueText && !dueOn
                ? 'dátum splatnosti'
                : seen.has(`${side}:${number}`)
                  ? 'číslo dokladu sa opakuje'
                  : null
    if (why) {
      issues.push({ line: i + 1, what: `${number}: ${why}` })
      continue
    }
    if (amount === 0) continue
    seen.add(`${side}:${number}`)
    const vs = cell(row, found.cols.vs).replace(/\s/g, '')
    const ico = cell(row, found.cols.ico).replace(/\s/g, '')
    items.push({
      side: side!,
      number: number.slice(0, 32),
      vs: /^\d{1,10}$/.test(vs) ? vs : /^\d{1,10}$/.test(number) ? number : null,
      party: cell(row, found.cols.party).slice(0, 120) || null,
      ico: /^\d{6,8}$/.test(ico) ? ico.padStart(8, '0') : null,
      issuedOn,
      dueOn,
      cents: amount!,
      line: i + 1,
    })
  }
  return { items, issues, noColumns: false }
}

/** Pohoda's XML export of invoices (dataPack of inv:invoice): each invoice issued or received with what is left of it (its sum when the export says nothing of payments). */
export function pohodaInvoices(xml: string): { items: OpenItem[]; issues: LineIssue[] } | null {
  let doc: Record<string, unknown>
  try {
    doc = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, isArray: (name) => ['dataPackItem', 'responsePackItem', 'invoice'].includes(name) }).parse(xml) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
  const pack = (doc.dataPack ?? doc.responsePack) as Record<string, unknown> | undefined
  if (!pack) return null
  const packItems = ((pack.dataPackItem ?? pack.responsePackItem) as Record<string, unknown>[] | undefined) ?? []
  const invoices = packItems.flatMap((p) => {
    const lst = p.listInvoice as Record<string, unknown> | undefined
    return ((lst?.invoice ?? p.invoice) as Record<string, unknown>[] | undefined) ?? []
  })
  if (invoices.length === 0) return null
  const items: OpenItem[] = []
  const issues: LineIssue[] = []
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
  invoices.forEach((inv, i) => {
    const h = (inv.invoiceHeader ?? {}) as Record<string, unknown>
    const type = text(h.invoiceType)
    const side: OpenSide | null = /^issued(Invoice|CreditNotice|DebitNote)?$/.test(type) ? 'issued' : /^received(Invoice|CreditNotice|DebitNote)?$/.test(type) ? 'received' : null
    const numberNode = h.number as Record<string, unknown> | string | undefined
    const number = typeof numberNode === 'object' && numberNode ? text(numberNode.numberRequested) || text(numberNode.number) : text(numberNode)
    const partner = ((h.partnerIdentity as Record<string, unknown> | undefined)?.address ?? {}) as Record<string, unknown>
    const summary = ((inv.invoiceSummary as Record<string, unknown> | undefined)?.homeCurrency ?? {}) as Record<string, unknown>
    // The sum: what the summary's rates come to with their VAT, or the priceSum when the export has it.
    const parts = ['priceNone', 'priceLowSum', 'priceHighSum', 'price3Sum'].map((k) => amountOf(text(summary[k])))
    const fallbackParts = ['priceNone', 'priceLow', 'priceLowVAT', 'priceHigh', 'priceHighVAT', 'price3', 'price3VAT'].map((k) => amountOf(text(summary[k])))
    const sum =
      parts.some((p) => p !== null) && (amountOf(text(summary.priceLowSum)) !== null || amountOf(text(summary.priceHighSum)) !== null)
        ? parts.reduce<number>((s, p) => s + (p !== null && !Number.isNaN(p) ? p : 0), 0)
        : fallbackParts.reduce<number>((s, p) => s + (p !== null && !Number.isNaN(p) ? p : 0), 0)
    const round = amountOf(text((summary.round as Record<string, unknown> | undefined)?.priceRound))
    const total = sum + (round !== null && !Number.isNaN(round) ? round : 0)
    const paid = amountOf(text((inv.liquidation as Record<string, unknown> | undefined)?.amountHome))
    const left = paid !== null && !Number.isNaN(paid) ? total - paid : total
    if (!side || !number || left < 0) {
      issues.push({ line: i + 1, what: `${number || 'faktúra bez čísla'}: ${!side ? 'druh faktúry' : !number ? 'číslo' : 'záporná suma'}` })
      return
    }
    if (left === 0) return
    const ico = text(partner.ico).replace(/\s/g, '')
    const vs = text(h.symVar).replace(/\s/g, '')
    items.push({
      side,
      number: number.slice(0, 32),
      vs: /^\d{1,10}$/.test(vs) ? vs : null,
      party: (text(partner.company) || text(partner.name)).slice(0, 120) || null,
      ico: /^\d{6,8}$/.test(ico) ? ico.padStart(8, '0') : null,
      issuedOn: dayOf(text(h.date)),
      dueOn: dayOf(text(h.dateDue)),
      cents: left,
      line: i + 1,
    })
  })
  return { items, issues }
}

// ---------------------------------------------------------------------------------------------------------------
// Fixed assets
// ---------------------------------------------------------------------------------------------------------------

const ASSETS = {
  name: ['názov', 'názov majetku', 'popis', 'predmet', 'majetok'],
  number: ['inventárne číslo', 'inv číslo', 'inv č', 'evidenčné číslo', 'číslo'],
  inUse: ['dátum zaradenia', 'dátum zaradenia do užívania', 'zaradené', 'zaradenie', 'uvedenie do užívania', 'dátum obstarania'],
  cost: ['vstupná cena', 'obstarávacia cena', 'vstupná cena daňová', 'daňová vstupná cena', 'cena', 'ocenenie'],
  group: ['odpisová skupina', 'skupina', 'odp skupina', 'os'],
  method: ['spôsob odpisovania', 'metóda odpisovania', 'metóda', 'spôsob', 'odpisovanie'],
  taxDone: ['daňové oprávky', 'oprávky daňové', 'uplatnené daňové odpisy', 'daňové odpisy spolu', 'oprávky'],
  bookDone: ['účtovné oprávky', 'oprávky účtovné', 'účtovné odpisy spolu'],
  years: ['počet rokov odpisovania', 'roky odpisovania', 'odpisované rokov', 'počet odpisov', 'rokov'],
  account: ['účet', 'syntetický účet', 'účet majetku'],
} as const

export interface AssetRow {
  name: string
  account: AssetAccount
  inUseOn: string
  costCents: number
  taxGroup: number | null
  accelerated: boolean
  priorTaxCents: number
  priorBookCents: number
  priorTaxYears: number
  note: string | null
  /** Its line in the file. */
  line: number
}

/** The fixed assets of a register's list, each as one of the opening balances (assets.ts). */
export function assetRows(rows: readonly string[][]): { assets: AssetRow[]; issues: LineIssue[]; noColumns: boolean } {
  const found = findColumns(rows, ASSETS, ['name', 'inUse', 'cost'])
  if (!found) return { assets: [], issues: [], noColumns: true }
  const assets: AssetRow[] = []
  const issues: LineIssue[] = []
  for (let i = found.header + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const name = cell(row, found.cols.name)
    if (name === '' || /^(spolu|celkom)/i.test(name)) continue
    const inUseOn = dayOf(cell(row, found.cols.inUse))
    const cost = amountOf(cell(row, found.cols.cost))
    const groupText = cell(row, found.cols.group).replace(/[^\d]/g, '')
    const group = groupText === '' ? null : Number(groupText)
    const account = canonicalAccount(cell(row, found.cols.account))?.slice(0, 3) ?? (group === null ? '013' : '022')
    const taxDone = amountOf(cell(row, found.cols.taxDone))
    const bookDone = amountOf(cell(row, found.cols.bookDone))
    const yearsText = cell(row, found.cols.years).replace(/[^\d]/g, '')
    const method = plainHeading(cell(row, found.cols.method))
    const why = !inUseOn
      ? 'dátum zaradenia'
      : cost === null || Number.isNaN(cost) || cost <= 0
        ? 'vstupná cena'
        : group !== null && !(group in GROUP_YEARS)
          ? 'odpisová skupina'
          : !isAssetAccount(account)
            ? `účet ${account}`
            : Number.isNaN(taxDone) || Number.isNaN(bookDone)
              ? 'oprávky'
              : null
    if (why) {
      issues.push({ line: i + 1, what: `${name}: ${why}` })
      continue
    }
    const number = cell(row, found.cols.number)
    assets.push({
      name: name.slice(0, 120),
      account: account as AssetAccount,
      inUseOn: inUseOn!,
      costCents: cost!,
      taxGroup: group,
      accelerated: /zrychl|akceler/.test(method),
      priorTaxCents: Math.max(0, taxDone ?? 0),
      priorBookCents: Math.max(0, bookDone ?? taxDone ?? 0),
      priorTaxYears: yearsText === '' ? 0 : Math.min(40, Number(yearsText)),
      note: number ? `Inventárne číslo u predchodcu: ${number.slice(0, 40)}` : null,
      line: i + 1,
    })
  }
  return { assets, issues, noColumns: false }
}

// ---------------------------------------------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------------------------------------------

const PEOPLE = {
  name: ['meno a priezvisko', 'priezvisko a meno', 'zamestnanec', 'celé meno', 'meno'],
  born: ['dátum narodenia', 'narodený', 'narodená', 'narodenie'],
  insurer: ['zdravotná poisťovňa', 'zp', 'poisťovňa', 'kód zp', 'zdravotna poistovna'],
  started: ['dátum nástupu', 'nástup', 'vznik pomeru', 'začiatok pomeru', 'od'],
  ended: ['dátum skončenia', 'skončenie', 'ukončenie', 'koniec pomeru', 'do'],
  wage: ['mesačná mzda', 'základná mzda', 'tarifná mzda', 'mzda', 'hodinová mzda', 'sadzba', 'odmena'],
  kind: ['druh pomeru', 'typ pomeru', 'druh vzťahu', 'vzťah', 'pracovný pomer', 'pomer'],
  iban: ['iban', 'číslo účtu', 'účet'],
  hours: ['týždenný úväzok', 'úväzok', 'hodín týždenne', 'týždenný pracovný čas'],
} as const

export interface PersonRow {
  name: string
  bornOn: string | null
  insurer: '24' | '25' | '27'
  startedOn: string
  endedOn: string | null
  wage: number
  contract: ContractKind
  hourly: boolean
  iban: string | null
  weeklyHours: number
}

const insurerOf = (text: string): '24' | '25' | '27' | null => {
  const t = plainHeading(text)
  if (/^24\b|dovera/.test(t)) return '24'
  if (/^25\b|vszp|vseobecna/.test(t)) return '25'
  if (/^27\b|union/.test(t)) return '27'
  return null
}

const contractOf = (text: string): ContractKind => {
  const t = plainHeading(text)
  if (/dovp|vykonani prace/.test(t)) return 'dovp'
  if (/dopc|pracovnej cinnosti/.test(t)) return 'dopc'
  if (/dobps|brigad/.test(t)) return 'dobps'
  if (/konatel|statutar/.test(t)) return 'director'
  return 'employment'
}

/** The employees of a list. */
export function personRows(rows: readonly string[][]): { people: PersonRow[]; issues: LineIssue[]; noColumns: boolean } {
  const found = findColumns(rows, PEOPLE, ['name', 'started'])
  if (!found) return { people: [], issues: [], noColumns: true }
  const people: PersonRow[] = []
  const issues: LineIssue[] = []
  for (let i = found.header + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const name = cell(row, found.cols.name)
    if (name === '') continue
    const startedOn = dayOf(cell(row, found.cols.started))
    const endedText = cell(row, found.cols.ended)
    const endedOn = dayOf(endedText)
    const bornText = cell(row, found.cols.born)
    const bornOn = dayOf(bornText)
    const insurer = insurerOf(cell(row, found.cols.insurer))
    const wage = amountOf(cell(row, found.cols.wage))
    const hoursText = cell(row, found.cols.hours)
    const hours = hoursText === '' ? 40 : Number(hoursText.replace(',', '.').replace(/[^\d.]/g, ''))
    const wageHeading = found.cols.wage === undefined ? '' : plainHeading(rows[found.header]?.[found.cols.wage] ?? '')
    const why = !startedOn
      ? 'dátum nástupu'
      : endedText && !endedOn
        ? 'dátum skončenia'
        : bornText && !bornOn
          ? 'dátum narodenia'
          : !insurer
            ? 'zdravotná poisťovňa (24 Dôvera, 25 VšZP, 27 Union)'
            : wage !== null && (Number.isNaN(wage) || wage < 0)
              ? 'mzda'
              : !Number.isFinite(hours) || hours <= 0 || hours > 48
                ? 'úväzok'
                : null
    if (why) {
      issues.push({ line: i + 1, what: `${name}: ${why}` })
      continue
    }
    const iban = cell(row, found.cols.iban).replace(/\s/g, '').toUpperCase()
    const contract = contractOf(cell(row, found.cols.kind))
    people.push({
      name: name.slice(0, 80),
      bornOn,
      insurer: insurer!,
      startedOn: startedOn!,
      endedOn,
      wage: wage ?? 0,
      contract: isContract(contract) ? contract : 'employment',
      hourly: /hodin/.test(wageHeading),
      iban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : null,
      weeklyHours: Math.round(hours * 100),
    })
  }
  return { people, issues, noColumns: false }
}

// ---------------------------------------------------------------------------------------------------------------
// The financial statements filed before
// ---------------------------------------------------------------------------------------------------------------

export interface PriorStatements {
  year: number
  form: 'muj' | 'pod'
  ico: string
  /** In whole euros, as filed: each balance-sheet row (Úč POD: the net), each row of the profit and loss account; Úč POD's gross and correction. */
  balanceEur: Record<string, number>
  profitEur: Record<string, number>
  grossEur: Record<string, number>
  fixEur: Record<string, number>
  /** The size group's figures (in cents, for the closing): the net turnover, the total assets net and gross. */
  turnover: number
  assetsNet: number
  assetsGross: number
}

/**
 * The statements of an eForm's XML (UZMUJv14 or UZPODv14, as eDane gives it back): the year filed from its own column,
 * and the year before it from the column of the period before when it is filled.
 */
export function priorStatements(xml: string): PriorStatements[] | null {
  let doc: Record<string, unknown>
  try {
    doc = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml) as Record<string, unknown>
  } catch {
    return null
  }
  const root = doc.dokument as Record<string, unknown> | undefined
  const head = root?.hlavicka as Record<string, unknown> | undefined
  const body = root?.telo as Record<string, unknown> | undefined
  if (!head || !body) return null
  const year = Number((head.datumK as Record<string, unknown> | undefined)?.rok)
  const ico = String(head.ico ?? '').replace(/\s/g, '')
  if (!Number.isInteger(year) || year < 2000) return null
  const num = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return null
    const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
    return Number.isFinite(n) ? Math.round(n) : null
  }
  const pick = (group: unknown, rows: readonly string[], col: string) => {
    const g = (group ?? {}) as Record<string, Record<string, unknown>>
    const out: Record<string, number> = {}
    let any = false
    for (const row of rows) {
      const v = num(g[row]?.[col])
      if (v !== null) {
        any = true
        if (v !== 0) out[row] = v
      }
    }
    return { out, any }
  }
  const pod = body.ucPod1Suvaha !== undefined
  if (!pod && body.ucMuj1Suvaha === undefined) return null
  const make = (y: number, cols: { asset: string; liability: string; profit: string; gross?: string; fix?: string }): PriorStatements | null => {
    const assets = pick(pod ? body.ucPod1Suvaha : body.ucMuj1Suvaha, pod ? POD_ASSET_ROWS : BALANCE_ROWS, cols.asset)
    const liabilities = pod ? pick(body.ucPod1Suvaha, POD_LIABILITY_ROWS, cols.liability) : { out: {}, any: false }
    const profit = pick(pod ? body.ucPod2VykazZS : body.ucMuj2VykazZS, pod ? POD_PROFIT_ROWS : PROFIT_ROWS, cols.profit)
    if (!assets.any && !profit.any) return null
    const gross = pod && cols.gross ? pick(body.ucPod1Suvaha, POD_ASSET_ROWS, cols.gross).out : {}
    const fix = pod && cols.fix ? pick(body.ucPod1Suvaha, POD_ASSET_ROWS, cols.fix).out : {}
    const balanceEur = { ...assets.out, ...liabilities.out }
    return {
      year: y,
      form: pod ? 'pod' : 'muj',
      ico,
      balanceEur,
      profitEur: profit.out,
      grossEur: gross,
      fixEur: fix,
      turnover: (profit.out.r01 ?? 0) * 100,
      assetsNet: (pod ? (balanceEur.r001 ?? 0) : (balanceEur.r01 ?? 0)) * 100,
      assetsGross: (pod ? (gross.r001 ?? balanceEur.r001 ?? 0) : (balanceEur.r01 ?? 0)) * 100,
    }
  }
  const out = [
    make(year, pod ? { asset: 's3', liability: 's5', profit: 's1', gross: 's1', fix: 's2' } : { asset: 's1', liability: 's1', profit: 's1' }),
    make(year - 1, pod ? { asset: 's4', liability: 's6', profit: 's2' } : { asset: 's2', liability: 's2', profit: 's2' }),
  ]
  const found = out.filter((s): s is PriorStatements => s !== null)
  return found.length ? found : null
}
