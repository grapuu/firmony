// How a document is booked: what it is for (a category), the account that category goes to in the Slovak chart of
// accounts, and the entry the accountant is offered. The client never sees any of this; the accountant always
// confirms it. The ledger itself is kept in her certified program: what she confirms here is exported to it.
import { nameWords } from './match'
import type { DocKind } from './match'

export type Category =
  | 'material'
  | 'fuel'
  | 'energy'
  | 'goods'
  | 'repairs'
  | 'travel'
  | 'representation'
  | 'services'
  | 'fees'
  | 'insurance'
  | 'bank'
  | 'asset'
  | 'sales'
  | 'sales_goods'

export interface CategoryInfo {
  /** As the accountant reads it. */
  name: string
  /** The synthetic account of the Slovak chart of accounts (rámcová účtová osnova). */
  account: string
  /** Whether VAT on it is deducted by default (a VAT payer): representation, fees, insurance and the bank's fees are not. */
  deduct: boolean
  /** What the reader is told about it. */
  hint: string
  /** For an issued invoice (revenue), not for a cost. */
  revenue?: boolean
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  material: { name: 'Materiál a kancelárske potreby', account: '501', deduct: true, hint: 'kancelárske potreby, drobný materiál, drobný majetok do 1 700 €' },
  fuel: { name: 'Pohonné látky', account: '501', deduct: true, hint: 'benzín, nafta, nabíjanie auta' },
  energy: { name: 'Energie', account: '502', deduct: true, hint: 'elektrina, plyn, voda, teplo' },
  goods: { name: 'Tovar na predaj', account: '504', deduct: true, hint: 'tovar kúpený na ďalší predaj' },
  repairs: { name: 'Opravy a údržba', account: '511', deduct: true, hint: 'opravy auta, techniky, priestorov' },
  travel: { name: 'Cestovné a ubytovanie', account: '512', deduct: true, hint: 'lístky, letenky, ubytovanie na služobnej ceste' },
  representation: { name: 'Reprezentácia', account: '513', deduct: false, hint: 'jedlo a nápoje s klientmi, dary, pohostenie' },
  services: { name: 'Služby', account: '518', deduct: true, hint: 'nájom, telefón, internet, softvér, hosting, reklama, poradenstvo, kuriér' },
  fees: { name: 'Dane a poplatky', account: '538', deduct: false, hint: 'správne poplatky, kolky, diaľničná známka, miestne dane' },
  insurance: { name: 'Poistenie', account: '548', deduct: false, hint: 'poistenie majetku, auta, zodpovednosti' },
  bank: { name: 'Bankové poplatky', account: '568', deduct: false, hint: 'poplatky banke, platobným bránam' },
  asset: { name: 'Dlhodobý majetok', account: '042', deduct: true, hint: 'počítač, auto, stroj nad 1 700 €' },
  sales: { name: 'Tržby za služby', account: '602', deduct: false, hint: 'faktúra, ktorú firma vystavila za svoju službu', revenue: true },
  sales_goods: { name: 'Tržby za tovar', account: '604', deduct: false, hint: 'faktúra, ktorú firma vystavila za predaný tovar', revenue: true },
}

export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[]

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && value in CATEGORIES
}

/** The categories that fit a kind of document: revenue for an issued invoice, costs for everything else. */
export function categoriesFor(kind: DocKind | null): Category[] {
  const revenue = kind === 'invoice_out'
  return CATEGORY_IDS.filter((id) => Boolean(CATEGORIES[id].revenue) === revenue)
}

/** How a document was paid, as far as we know: from the bank by card or transfer, by the owner, or not yet. */
export type PaidBy = 'bank' | 'private' | 'cash' | 'unpaid'

export interface EntryLine {
  /** Má dať (debit) and Dal (credit) accounts. */
  md: string
  d: string
  cents: number
  what: 'cost' | 'vat' | 'revenue' | 'payable' | 'receivable'
}

/**
 * The entry a document is booked with. A received invoice goes to suppliers (321) and is paid from the bank by its
 * own entry; a receipt is booked against what paid it: the bank (221), the owner's own money (365, a debt of the
 * company to its owner) or the cash box (211). An issued invoice goes to customers (311). VAT is split out (343)
 * only for a VAT payer who deducts it, or on an issued invoice of a VAT payer. VAT the company pays itself on what it
 * buys from abroad (§ 69, § 11) is owed to the state (343) and, deducted, is its own claim on the state (343 against
 * 343); not deducted, it is part of the cost. Nothing is proposed for a document without an amount or a category,
 * or of the kind "other".
 */
export function entryFor(args: {
  kind: DocKind | null
  category: Category | null
  totalCents: number | null
  vatCents: number | null
  vatPayer: boolean
  vatDeduct: boolean
  paidBy: PaidBy
  /** An account the accountant chose instead of the category's. */
  account?: string | null
  /** VAT the company pays itself on what it bought from abroad, and whether it deducts it. */
  selfVat?: { cents: number; deduct: boolean } | null
}): EntryLine[] {
  const { kind, category, totalCents, vatPayer, paidBy } = args
  if (!kind || kind === 'other' || !category || totalCents === null || totalCents <= 0) return []
  const info = { ...CATEGORIES[category], ...(args.account && /^\d{3,6}$/.test(args.account) ? { account: args.account } : {}) }
  const vat = Math.max(0, Math.min(args.vatCents ?? 0, totalCents))
  if (kind === 'invoice_out') {
    if (!info.revenue) return []
    const split = vatPayer && vat > 0
    return split
      ? [
          { md: '311', d: info.account, cents: totalCents - vat, what: 'revenue' },
          { md: '311', d: '343', cents: vat, what: 'vat' },
        ]
      : [{ md: '311', d: info.account, cents: totalCents, what: 'revenue' }]
  }
  if (info.revenue) return []
  const contra = kind === 'invoice_in' ? '321' : paidBy === 'private' ? '365' : paidBy === 'cash' ? '211' : '221'
  const split = vatPayer && args.vatDeduct && vat > 0
  const lines: EntryLine[] = split
    ? [
        { md: info.account, d: contra, cents: totalCents - vat, what: 'cost' },
        { md: '343', d: contra, cents: vat, what: 'vat' },
      ]
    : [{ md: info.account, d: contra, cents: totalCents, what: 'cost' }]
  const self = args.selfVat
  if (self && self.cents > 0) lines.push(self.deduct ? { md: '343', d: '343', cents: self.cents, what: 'vat' } : { md: info.account, d: '343', cents: self.cents, what: 'cost' })
  return lines
}

/**
 * What a supplier is known by, for a rule the accountant made once: its IČO, or else the words of its name that
 * tell it apart. Null when there is nothing to know it by.
 */
export function supplierKey(ico: string | null | undefined, name: string | null | undefined): string | null {
  const id = (ico ?? '').replace(/\s/g, '')
  if (/^\d{8}$/.test(id)) return `ico:${id}`
  const words = nameWords(name).sort()
  return words.length > 0 ? `name:${words.join(' ')}` : null
}

/** A suspected duplicate: the same kind and amount, and the same number, or the same supplier on the same day. */
export function sameDocument(
  a: { kind: string | null; totalCents: number | null; number: string | null; party: string | null; partyIco: string | null; issuedOn: string | null },
  b: { kind: string | null; totalCents: number | null; number: string | null; party: string | null; partyIco: string | null; issuedOn: string | null },
): boolean {
  if (a.totalCents === null || a.totalCents !== b.totalCents || a.kind !== b.kind) return false
  const plain = (n: string | null) => (n ?? '').replace(/[\s/-]/g, '').toUpperCase()
  if (plain(a.number) !== '' && plain(a.number) === plain(b.number)) return true
  const sameSupplier = supplierKey(a.partyIco, a.party) !== null && supplierKey(a.partyIco, a.party) === supplierKey(b.partyIco, b.party)
  return sameSupplier && a.issuedOn !== null && a.issuedOn === b.issuedOn && plain(a.number) === plain(b.number)
}

/** A day as an accountant types it: 11. 10. 2026. */
export const textDay = (day: string): string => `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}`

/** "11. 10. 2026", "11.10.2026" or "2026-10-11" as 2026-10-11; '' when empty; null when it is no day. */
export function dayOfText(text: string): string | null {
  const plain = text.replace(/\s/g, '')
  if (plain === '') return ''
  const sk = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(plain)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plain)
  const [y, m, d] = sk ? [Number(sk[3]), Number(sk[2]), Number(sk[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0]
  if (y < 2000 || y > 2100) return null
  const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const check = new Date(`${day}T12:00:00Z`)
  return check.getUTCFullYear() === y && check.getUTCMonth() + 1 === m && check.getUTCDate() === d ? day : null
}
