import { CLOSING_PRICE, OFFLINE_TERMS, OPERATOR, PAYROLL_PRICE, PLANS, TERMS_VERSION, type PlanId } from './config'
import { TERMS, TERMS_SUBTITLE, TERMS_TITLE, termsText, type TermsSection } from './content/terms'
import archive20261013 from './content/terms-archive/2026-10-13.json'
import { now, sha256Hex } from './db'
import type { Order } from './order'

export interface ContractTerms {
  version: string
  title: string
  subtitle: string
  sections: readonly TermsSection[]
  text: string
}
export interface ContractRelease {
  catalogueHash: string
  legalReview: string
  insuranceReview: string
  /** Unix seconds. An expired approval cannot authorize another contract. */
  validUntil: number
}
export interface ContractBindings {
  CONTRACT_RELEASE?: string
}
export interface OrderReview {
  id: number
  order_id: string
  reviewed_at: number
  reviewed_by: string
  decision: 'standard' | 'bespoke' | 'hold'
  offer_hash: string
  plan: string
  evidence: string
  accountant_id: string | null
  expires_at: number
}
export interface ContractApproval {
  release: ContractRelease
  review: OrderReview
  offerHash: string
}
export interface ContractGate {
  ready: boolean
  reason: 'release' | 'review' | 'bespoke' | 'hold' | 'ready'
  offerHash: string
  approval: ContractApproval | null
}

/** Include every offered tariff and the operator, so a wording, price or supplier change invalidates approval. */
export function contractCatalogue() {
  return {
    terms: { version: TERMS_VERSION, title: TERMS_TITLE, subtitle: TERMS_SUBTITLE, sections: TERMS, text: termsText() },
    operator: OPERATOR,
    plans: PLANS.map((p) => ({ id: p.id, name: p.name, docs: p.docs, monthlyCents: Math.round(p.price * 100), vatPayer: p.vatPayer })),
    payrollCents: Math.round(PAYROLL_PRICE * 100),
    closingCents: Math.round(CLOSING_PRICE * 100),
    scope: 'reviewed-micro-v1',
  }
}
export const contractCatalogueHash = () => sha256Hex(JSON.stringify(contractCatalogue()))

export function approvedRelease(raw: string | undefined, hash: string, at = now()): ContractRelease | null {
  try {
    if (!raw || raw.length > 2048) return null
    const r = JSON.parse(raw) as ContractRelease
    const reference = (s: unknown) => typeof s === 'string' && s.trim().length >= 5 && s.length <= 240
    return /^[a-f0-9]{64}$/.test(hash) &&
      r.catalogueHash === hash &&
      reference(r.legalReview) &&
      reference(r.insuranceReview) &&
      Number.isSafeInteger(r.validUntil) &&
      r.validUntil > at
      ? r
      : null
  } catch {
    return null
  }
}

/** Bind the review and the browser's proposal to the same company facts, not just the version label. */
export async function orderOfferHash(order: Order, catalogueHash = ''): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      catalogue: catalogueHash || (await contractCatalogueHash()),
      id: order.id,
      ico: order.ico,
      company: order.company,
      address: order.address,
      registerLine: order.registerLine,
      directors: order.directors,
    }),
  )
}
/** What the approval set on the Worker says about today's terms and prices, for the page that prepares a new one. */
export type ReleaseState =
  | { state: 'valid' | 'expired'; until: number }
  | { state: 'missing' | 'unreadable' | 'other' }
export function releaseState(raw: string | undefined, hash: string, at = now()): ReleaseState {
  if (!raw || raw.trim() === '') return { state: 'missing' }
  let r: unknown
  try {
    r = JSON.parse(raw)
  } catch {
    return { state: 'unreadable' }
  }
  if (!r || typeof r !== 'object') return { state: 'unreadable' }
  const release = r as Partial<ContractRelease>
  if (typeof release.catalogueHash !== 'string' || !Number.isSafeInteger(release.validUntil)) return { state: 'unreadable' }
  if (release.catalogueHash !== hash) return { state: 'other' }
  if (approvedRelease(raw, hash, at)) return { state: 'valid', until: release.validUntil as number }
  if ((release.validUntil as number) <= at) return { state: 'expired', until: release.validUntil as number }
  return { state: 'unreadable' }
}

/** The value of CONTRACT_RELEASE for today's terms and prices, valid through the given day in Bratislava: until the
 * midnight that ends it (an hour or two before midnight UTC, by the season). */
export function releaseValue(hash: string, legalReview: string, insuranceReview: string, day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  const local = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(ms))
  const midnight = [1, 2, 0].map((hours) => Date.UTC(y, m - 1, d + 1) - hours * 3600_000).find((ms) => local(ms) !== day && local(ms - 1000) === day)
  const release: ContractRelease = { catalogueHash: hash, legalReview, insuranceReview, validUntil: Math.floor((midnight ?? Date.UTC(y, m - 1, d, 22)) / 1000) }
  return JSON.stringify(release)
}

export async function latestOrderReview(db: D1Database, orderId: string): Promise<OrderReview | null> {
  return db.prepare('SELECT * FROM order_reviews WHERE order_id = ? ORDER BY id DESC LIMIT 1').bind(orderId).first<OrderReview>()
}
export async function contractGate(db: D1Database, env: ContractBindings, order: Order): Promise<ContractGate> {
  const hash = await contractCatalogueHash()
  const offerHash = await orderOfferHash(order, hash)
  const release = approvedRelease(env.CONTRACT_RELEASE, hash)
  if (!release) return { ready: false, reason: 'release', offerHash, approval: null }
  const review = await latestOrderReview(db, order.id)
  if (!review || review.offer_hash !== offerHash || review.expires_at <= now()) return { ready: false, reason: 'review', offerHash, approval: null }
  if (review.decision !== 'standard') return { ready: false, reason: review.decision, offerHash, approval: null }
  const accountant =
    review.accountant_id && (await db.prepare("SELECT 1 AS x FROM users WHERE id = ? AND team IN ('admin', 'accountant')").bind(review.accountant_id).first())
  if (!accountant) return { ready: false, reason: 'review', offerHash, approval: null }
  return { ready: true, reason: 'ready', offerHash, approval: { release, review, offerHash } }
}

export interface ContractSnapshot {
  format: 'firmony-contract'
  version: 1
  companyId: string
  orderId: string
  acceptedAt: number
  client: { name: string; ico: string; address: string | null; registerLine: string | null }
  signedBy: string
  startOn: string
  plan: ReturnType<typeof contractCatalogue>['plans'][number]
  catalogue: ReturnType<typeof contractCatalogue>
  approval: { catalogueHash: string; releaseValidUntil: number; reviewId: number; accountantId: string | null }
}
export async function contractSnapshot(
  order: Order,
  a: { plan: PlanId; signedBy: string; startOn: string },
  companyId: string,
  acceptedAt: number,
  approval: ContractApproval,
) {
  const catalogue = contractCatalogue()
  const plan = catalogue.plans.find((p) => p.id === a.plan)
  if (
    !plan ||
    approval.review.plan !== a.plan ||
    approval.offerHash !== (await orderOfferHash(order)) ||
    !approvedRelease(JSON.stringify(approval.release), await contractCatalogueHash(), acceptedAt)
  )
    throw new Error('Contract approval is stale')
  const snapshot: ContractSnapshot = {
    format: 'firmony-contract',
    version: 1,
    companyId,
    orderId: order.id,
    acceptedAt,
    client: { name: order.company, ico: order.ico, address: order.address, registerLine: order.registerLine },
    signedBy: a.signedBy,
    startOn: a.startOn,
    plan,
    catalogue,
    approval: {
      catalogueHash: approval.release.catalogueHash,
      releaseValidUntil: approval.release.validUntil,
      reviewId: approval.review.id,
      accountantId: approval.review.accountant_id,
    },
  }
  const data = JSON.stringify(snapshot)
  return { snapshot, data, sha256: await sha256Hex(data) }
}

export interface ResolvedContract {
  status: 'snapshot' | 'archive' | 'missing' | 'corrupt'
  terms: ContractTerms | null
  snapshot: ContractSnapshot | null
  data: string | null
  sha256: string | null
  notice: string
}
export async function resolveContract(db: D1Database, companyId: string, termsVersion: string | null): Promise<ResolvedContract> {
  const row = await db
    .prepare('SELECT * FROM contract_snapshots WHERE company_id = ?')
    .bind(companyId)
    .first<{ company_id: string; order_id: string; accepted_at: number; terms_version: string; sha256: string; data: string }>()
  if (row) {
    try {
      const s = JSON.parse(row.data) as ContractSnapshot
      const t = s.catalogue.terms
      if (
        (await sha256Hex(row.data)) !== row.sha256 ||
        s.format !== 'firmony-contract' ||
        s.version !== 1 ||
        s.companyId !== companyId ||
        s.orderId !== row.order_id ||
        s.acceptedAt !== row.accepted_at ||
        t.version !== row.terms_version ||
        typeof s.client.name !== 'string' ||
        typeof s.signedBy !== 'string' ||
        !s.startOn ||
        !Number.isSafeInteger(s.plan.monthlyCents) ||
        !Number.isSafeInteger(s.catalogue.payrollCents) ||
        !Number.isSafeInteger(s.catalogue.closingCents) ||
        typeof t.title !== 'string' ||
        typeof t.subtitle !== 'string' ||
        typeof t.text !== 'string' ||
        !Array.isArray(t.sections) ||
        !t.sections.every((v) => typeof v.title === 'string' && Array.isArray(v.points) && v.points.every((p: unknown) => typeof p === 'string'))
      )
        throw new Error('Invalid contract snapshot')
      return { status: 'snapshot', terms: t, snapshot: s, data: row.data, sha256: row.sha256, notice: 'Znenie a ceny uložené pri uzavretí zmluvy.' }
    } catch {
      return {
        status: 'corrupt',
        terms: null,
        snapshot: null,
        data: null,
        sha256: null,
        notice: 'Uloženú zmluvu sa nepodarilo overiť. Napíšte nám; preveríme pôvodný záznam.',
      }
    }
  }
  if (termsVersion === OFFLINE_TERMS)
    return {
      status: 'missing',
      terms: null,
      snapshot: null,
      data: null,
      sha256: null,
      notice: 'Zmluvu sme s Vami uzavreli písomne mimo aplikácie. Jej podpísané znenie máte u seba; ak ho potrebujete, napíšte nám a pošleme kópiu.',
    }
  if (termsVersion === archive20261013.version)
    return {
      status: 'archive',
      terms: archive20261013,
      snapshot: null,
      data: null,
      sha256: null,
      notice:
        'Archívne znenie z repozitára. Pri tejto staršej zmluve sa presný text ani celý cenník pri podpise neukladali; toto nie je dôkaz vtedy prijatého znenia. Pôvodné dojednanie treba overiť.',
    }
  return {
    status: 'missing',
    terms: null,
    snapshot: null,
    data: null,
    sha256: null,
    notice: 'Presné prijaté znenie tejto zmluvy nemáme uložené. Vyžiadajte si pôvodnú zmluvu; aktuálne podmienky ju nenahrádzajú.',
  }
}
