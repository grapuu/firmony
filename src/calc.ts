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

/** A deterministic numeric example for checks, never displayed as a visitor's costs. */
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

/** A standard year's base plan alone: twelve unchanged months, no payroll, no closing, no first-month promo. */
export const standardYearPlanCents = (plan: Plan) => plan.price * 1200

/** A new client's first twelve months of the base plan: the first month is free, so eleven are paid. */
export const firstYearPlanCents = (plan: Plan) => plan.price * 1100

/** A standard subsequent year: twelve months plus the annual closing and payroll. */
export const annualPlanCents = (plan: Plan, people = 0) => (plan.price + people * PAYROLL_PRICE) * 1200 + CLOSING_PRICE * 100

/** A new client's first twelve months: eleven paid months (the first is free) plus the annual closing and payroll. */
export const firstYearCents = (plan: Plan, people = 0) => (plan.price + people * PAYROLL_PRICE) * 1100 + CLOSING_PRICE * 100

export function compare(input: CalcInput): CalcResult {
  const todayYear = (input.monthly + input.docs * input.perDoc) * 12 + input.closing
  if (todayYear <= 0) return { kind: 'empty' }
  const plan = planFor(input.docs, input.vatPayer)
  if (!plan) return { kind: 'custom', todayYear }
  // A prospective client's first year: one month free, then eleven paid, plus the closing and payroll.
  const usYear = firstYearCents(plan, input.people)
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
