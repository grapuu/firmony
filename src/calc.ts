// The comparison on the home page: what a company pays its accountant today against what it would pay us.
// Everything is in cents, so that no sum is off by a rounding.
import { CLOSING_PRICE, PAYROLL_PRICE, PLANS, type Plan } from './config'

export interface CalcInput {
  /** The monthly fee today, in cents. */
  monthly: number
  /** The fee per document today, in cents. */
  perDoc: number
  /** Documents a month. */
  docs: number
  /** The annual closing and tax return today, in cents. */
  closing: number
  vatPayer: boolean
  /** People on the payroll. */
  people: number
}

/** The example the comparison shows before anything is typed: 60 € a month, 20 documents at 5,20 €, closing 160 €. */
export const EXAMPLE: CalcInput = { monthly: 6000, perDoc: 520, docs: 20, closing: 16000, vatPayer: false, people: 0 }

export type CalcResult =
  | { kind: 'empty' }
  | { kind: 'custom'; todayYear: number }
  | { kind: 'compared'; plan: Plan; todayYear: number; usYear: number; difference: number }

/** The plan a company with these numbers belongs in, or null when it is beyond the largest one. */
export function planFor(docs: number, vatPayer: boolean): Plan | null {
  for (const plan of PLANS) {
    if (docs <= plan.docs && (!vatPayer || plan.vatPayer)) return plan
  }
  return null
}

export function compare(input: CalcInput): CalcResult {
  const todayYear = (input.monthly + input.docs * input.perDoc) * 12 + input.closing
  if (todayYear <= 0) return { kind: 'empty' }
  const plan = planFor(input.docs, input.vatPayer)
  if (!plan) return { kind: 'custom', todayYear }
  const usYear = (plan.price + input.people * PAYROLL_PRICE) * 100 * 12 + CLOSING_PRICE * 100
  return { kind: 'compared', plan, todayYear, usYear, difference: todayYear - usYear }
}

/** An amount of money as people type it ("60", "5,20", "1 200 €") in cents; null when it is not one. */
export function readMoney(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/[\s €]/g, '').replace(',', '.')
  if (text === '') return 0
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

/** A count as people type it ("25"); null when it is not one. */
export function readCount(value: unknown, max: number): number | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/[\s ]/g, '')
  if (text === '') return 0
  if (!/^\d{1,5}$/.test(text)) return null
  const n = Number(text)
  return n > max ? null : n
}
