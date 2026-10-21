import { check } from './check.mjs'
import { overview, bank } from '../.wrangler/tmp/units-bundle.mjs'

export function checkOverview() {
  const today = '2026-10-21'
  const base = { today, closed: false, owner: true, missing: 0, deadlines: [], unread: 0, approval: null, confirmAccount: null, statementDue: null, bankNotice: null, bankReady: true, steps: null }
  const pending = (extra) => overview.overviewActions({ ...base, ...extra })
  const ids = (actions) => actions.map((a) => a.id)
  const steps = { declaration: true, poa: true, payments: true, upload: true, email: false, people: false, switching: false }
  const bill = { day: today, label: 'TEST Firmony faktúra', state: 'Zaplaťte 89 €', tone: 'amber', href: '/app/firma#faktury-firmony' }
  const tax = { day: '2026-10-25', label: 'TEST DPH', state: 'Zaplaťte 230 €', tone: 'amber', href: '/app/dane' }
  const documents = { day: '2026-10-10', label: 'TEST Doklady', state: 'Chýba doklad', tone: 'amber' }
  const both = pending({ deadlines: [tax, bill], unread: 1, approval: { dueOn: null } })
  check('overview: a due bill leads even with no missing document, and the tax, message and approval remain visible', both[0]?.href === '/app/firma#faktury-firmony' && both.length === 4 && both.some((a) => a.href === '/app/dane') && ids(both).includes('message') && ids(both).includes('approval'))
  check('overview: two obligations with the same target remain distinct', pending({ deadlines: [tax, { ...tax, label: 'TEST Preddavok', day: today }] }).length === 2)
  check('overview: blue work and already paid obligations are not presented as client payments', pending({ deadlines: [{ ...tax, tone: 'blue' }, { ...bill, tone: 'ok' }] }).length === 0)
  check('overview: a missing statement does not disappear behind matched payments', pending({ statementDue: '2026-09' })[0]?.href === '/app/banka#pridat')
  const combination = pending({ missing: 812, statementDue: '2026-09', deadlines: [documents], unread: 2 })
  check('overview: overdue missing documents lead, with the full count and the other known steps preserved', combination[0]?.id === 'documents' && combination[0].title.includes('812') && ids(combination).includes('statement') && ids(combination).includes('message'))
  check('overview: an unread message gets a reading action, never an inferred obligation to reply', pending({ unread: 1 })[0]?.href === '/app/spravy' && pending({ unread: 1 })[0]?.button === 'Prečítať správu')
  check('overview: optional onboarding settings alone do not create work', pending({ steps }).length === 0)
  check('overview: a required first step remains after payments have arrived', pending({ steps: { ...steps, poa: false } })[0]?.href === '/app/plna-moc')
  check('overview: no payments cannot hide a due tax', pending({ deadlines: [{ ...tax, day: today }], steps: { ...steps, payments: false } })[0]?.href === '/app/dane')
  check('overview: a colleague is not told to complete an owner-only declaration or bank consent', !ids(pending({ owner: false, steps: { ...steps, declaration: false, payments: false } })).some((id) => ['declaration', 'setup-bank'].includes(id)))
  check('overview: a pending account confirmation replaces another bank setup request', ids(pending({ confirmAccount: 'test-account', steps: { ...steps, payments: false } })).join() === 'account')
  check('overview: only an owner receives the account confirmation action', pending({ owner: false, confirmAccount: 'test-account' }).length === 0)
  const notice = { kind: 'ended', bank: 'TEST banka', fio: false }
  check('overview: an expired bank is visible without any missing payment', pending({ bankNotice: notice })[0]?.id === 'bank')
  check('overview: a colleague receives no owner-only renewal action', pending({ owner: false, bankNotice: notice }).length === 0)
  check('overview: a disabled aggregator leads to the bank page, not an unavailable connection endpoint', overview.bankRenewHref(notice, false) === '/app/banka')
  check('overview: a Fio renewal leads to its token instructions', overview.bankRenewHref({ ...notice, fio: true }, false) === '/app/banka?banka=fio#postup-banka')
  check('overview: a bank name is safely encoded in the existing connection route', overview.bankRenewHref({ ...notice, bank: 'TEST banka & iná' }, true) === '/app/banka/pripojit?banka=TEST%20banka%20%26%20in%C3%A1')
  const all = { deadlines: [bill], unread: 1, missing: 1, approval: { dueOn: today }, statementDue: '2026-09', bankNotice: notice, confirmAccount: 'test-account', steps: { ...steps, poa: false } }
  check('overview: closed intake never asks for active work', pending({ ...all, closed: true }).length === 0)
  const immutable = Object.freeze({ ...base, deadlines: Object.freeze([Object.freeze(tax)]) })
  check('overview: selection is deterministic and does not mutate its inputs', JSON.stringify(overview.overviewActions(immutable)) === JSON.stringify(overview.overviewActions(immutable)) && immutable.deadlines[0] === tax)

  const at = 1_792_612_800
  const fresh = { id: 'test-link', kind: 'eb', bank: 'TEST banka', status: 'active', createdAt: at - 100, validUntil: at + 30 * 86400, syncedAt: at - 60, error: null, accounts: [] }
  check('overview bank: a recent successful read has no warning', overview.bankHealthOf([fresh], at) === null)
  check('overview bank: a missing first read is explicitly unknown', overview.bankHealthOf([{ ...fresh, syncedAt: null }], at)?.kind === 'waiting')
  check('overview bank: future or non-finite timestamps are not accepted as a successful read', [at + 1, NaN, Infinity].every((syncedAt) => overview.bankHealthOf([{ ...fresh, syncedAt }], at)?.syncedAt === null))
  check('overview bank: the operational delay boundary is exact', overview.bankHealthOf([{ ...fresh, syncedAt: at - overview.BANK_DELAY_SECONDS + 1 }], at) === null && overview.bankHealthOf([{ ...fresh, syncedAt: at - overview.BANK_DELAY_SECONDS }], at)?.kind === 'delayed')
  check('overview bank: a failure remains visible despite another healthy bank', overview.bankHealthOf([fresh, { ...fresh, bank: 'TEST problém', error: 'TEST-ONLY internal code' }], at)?.bank === 'TEST problém')
  check('overview bank: raw internal errors are not part of the presentation data', !JSON.stringify(overview.bankHealthOf([{ ...fresh, error: 'TEST-ONLY private diagnostic' }], at)).includes('private diagnostic'))
  check('overview bank: inactive and expired links do not masquerade as pending synchronisation', ['expired', 'revoked', 'replaced'].every((status) => overview.bankHealthOf([{ ...fresh, status, syncedAt: null }], at) === null) && overview.bankHealthOf([{ ...fresh, validUntil: at, syncedAt: null }], at) === null)
  check('overview bank: an elapsed consent is expired even before the scheduler updates its row', bank.noticeOf([{ ...fresh, validUntil: at }], at)?.kind === 'ended')
}
