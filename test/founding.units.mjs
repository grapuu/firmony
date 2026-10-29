// The s. r. o. for 1 € (src/founding/): the application's rules, the contract's words, the deposit and the exit fee.
import { check } from './check.mjs'
import { foundingModel as m, formationContract as fc, foundingPdf, billing, creditOf, depositDue, approveBy, aml } from '../.wrangler/tmp/units-bundle.mjs'

/** A valid ten-digit birth number for a day (the check digit making it divisible by 11). */
function birthNumber(yy, mm, dd) {
  const head = `${String(yy).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(dd).padStart(2, '0')}`
  for (let tail = 100; tail < 1000; tail++) {
    for (let last = 0; last < 10; last++) {
      const rc = `${head}${tail}${last}`
      if (Number(rc) % 11 === 0) return rc
    }
  }
  return null
}

export function checkFoundingUnits() {
  const today = '2026-10-28'
  const rc = birthNumber(94, 3, 7)
  const valid = {
    meno: 'Ing. Ján Novák', rc, narodeny: '7. 3. 1994', adresa: 'Hlavná 12, 040 01 Košice', obcianstvo: 'slovenské', doklad: 'op', cislo: 'EA123456', platnost: '12. 5. 2031',
    pep: 'nie', zdroj: 'úspory zo zamestnania', obrat: 'do-50', hotovost: 'nie', zahranicie: '', vlastne: 'ano',
    firma: 'Nova Studio s. r. o.', firma2: '', sidlo: 'Hlavná 12, 040 01 Košice', sidlo_typ: 'rent', cinnosti: 'Poskytovanie softvéru\nReklamné služby', imanie: '5000', telefon: '',
  }
  const ok = m.checkFounding(valid, today)
  check('founding: a complete application gives the founder and the company', 'founder' in ok && ok.founder.born === '1994-03-07' && ok.company.activities.length === 2 && ok.company.capitalCents === 500_000 && ok.founder.turnover === 'do-50')
  const err = (patch) => m.checkFounding({ ...valid, ...patch }, today).errors
  check('founding: a birth number of another day than the date of birth is refused', Boolean(err({ narodeny: '8. 3. 1994' }).narodeny))
  check('founding: a founder under eighteen is refused', Boolean(err({ narodeny: '1. 1. 2010', rc: birthNumber(10, 1, 1) }).narodeny))
  check('founding: an expired identity document is refused', Boolean(err({ platnost: '1. 1. 2026' }).platnost))
  check('founding: a capital below 5 000 € is refused', Boolean(err({ imanie: '4999' }).imanie))
  check('founding: a name without the form of an s. r. o. is refused', Boolean(err({ firma: 'Nova Studio' }).firma) && !err({ firma: 'Nova Studio, spol. s r. o.' }).firma)
  check('founding: a founder acting for somebody else is refused', Boolean(err({ vlastne: '' }).vlastne))
  check('founding: the turnover and cash are asked', Boolean(err({ obrat: '' }).obrat) && Boolean(err({ hotovost: '' }).hotovost))
  check('founding: a wrong Slovak birth number is refused', Boolean(err({ rc: '9403071234' }).rc) === !aml.birthNumberValid('9403071234'))
  check('founding: a birth number says its day, a woman’s and a later number’s month too', m.bornOfNumber('530101123') === '1953-01-01' && m.bornOfNumber('535101123') === '1953-01-01' && m.bornOfNumber('9473071230') === '1994-03-07')

  check('founding: the payment symbol is 7, the year and five digits, never an invoice’s', m.foundingVs(2026, 7) === '7202600007' && m.foundingVs(2026, 7).length === 10)
  check('founding: a bank’s name of the payer is the founder without accents, titles or order', m.sameName('Ing. Ján Novák', 'NOVAK JAN') && !m.sameName('Ján Novák', 'Peter Novák') && !m.sameName('', 'Novák'))
  check('founding: whole words only, a middle name on one side, and a surname alone names nobody', !m.sameName('Ana Novak', 'Jana Nováková') && !m.sameName('Novák', 'Ján Novák') && m.sameName('Ján Peter Novák', 'NOVAK JAN'))

  const base = { founder: ok.founder, company: ok.company, idFrontKey: 'a', idBackKey: 'b', signedKey: 's', contractHash: 'h1', signedContractHash: 'h1', paidCents: m.FOUNDING_TOTAL, signedKind: 'qes' }
  check('founding: every step done counts all', m.stepsOf(base).all)
  check('founding: a signature on an earlier text of the contract does not count', !m.stepsOf({ ...base, contractHash: 'h2' }).signed && !m.stepsOf({ ...base, contractHash: null }).signed)
  check('founding: less than the whole amount is not paid', !m.stepsOf({ ...base, paidCents: m.FOUNDING_TOTAL - 1 }).paid && m.FOUNDING_TOTAL === 55_000)
  check('founding: the original is asked only of a paper signature, the debtors always', !m.checksNeeded({ signedKind: 'qes' }).includes('original') && m.checksNeeded({ signedKind: 'paper' }).includes('original') && m.checksNeeded({ signedKind: 'qes' }).includes('debts'))
  const clear = (way) => ({ result: 'clear', note: `${m.IDENTITY_NOTE[way]} TEST-ONLY` })
  check(
    'founding: a paper signature is verified only in person, a qualified one either way',
    m.identityWaysOf({ signedKind: 'paper' }).join() === 'person' && m.identityWaysOf({ signedKind: 'qes' }).join() === 'qes,person' && m.identityWaysOf({ signedKind: null }).join() === 'person',
  )
  check(
    'founding: an identity verified by the signature does not stand once the founder signed again on paper',
    m.identityStands({ signedKind: 'qes' }, clear('qes')) && !m.identityStands({ signedKind: 'paper' }, clear('qes')) && m.identityStands({ signedKind: 'paper' }, clear('person')) &&
      !m.identityStands({ signedKind: 'qes' }, { result: 'clear', note: 'TEST-ONLY bez spôsobu' }) && !m.identityStands({ signedKind: 'qes' }, { ...clear('qes'), result: 'problem' }) && !m.identityStands({ signedKind: 'qes' }, undefined),
  )
  check(
    'founding: the founder’s risk group is proposed by the program’s factors',
    m.suggestedRisk(ok.founder) === 'low' && m.suggestedRisk({ ...ok.founder, pep: true }) === 'high' && m.suggestedRisk({ ...ok.founder, cash: true }) === 'standard' &&
      m.suggestedRisk({ ...ok.founder, cash: true, abroad: 'Čína' }) === 'high' && m.suggestedRisk({ ...ok.founder, abroad: 'Irán' }) === 'high',
  )
  check('founding: an application moves only where the rules let it', m.mayMove('verifying', 'verified') && !m.mayMove('open', 'verified') && !m.mayMove('open', 'ordered') && m.MOVES.registered.length === 0 && !m.mayMove('filed', 'withdrawn') === false)
  check('founding: a politically exposed founder, cash and partners outside the EU are said to the designated person', m.riskHints({ ...ok.founder, pep: true, cash: true, abroad: 'Čína' }).length === 3 && m.riskHints(ok.founder).length === 0)

  // The deposit is held: no bill takes it before the commitment's 31st month, unless the contract ends sooner.
  const company = { startOn: '2027-01-15', endsOn: null }
  check('deposit: held until the 31st month of the commitment', !depositDue(company, '2027-02') && !depositDue(company, '2029-06') && depositDue(company, '2029-07'))
  check('deposit: an end of the contract releases it once the contract has ended, not while the notice can be taken back', depositDue({ ...company, endsOn: '2027-03-31' }, '2027-04') && !depositDue({ ...company, endsOn: '2027-03-31' }, '2027-03'))
  check('deposit: a bill takes it up to its own total, and what is left after', creditOf({ prepaidCents: 54_900, draft: { totalCents: 8_900 } }) === 8_900 && creditOf({ prepaidCents: 1_000, draft: { totalCents: 8_900 } }) === 1_000 && creditOf({ prepaidCents: 0, draft: { totalCents: 8_900 } }) === 0)

  check('exit fee: the months left after the last month, at most twelve', billing.exitMonths('2027-01-15', '2027-02-28', 36, 12) === 12 && billing.exitMonths('2027-01-01', '2029-09-30', 36, 12) === 3 && billing.exitMonths('2027-01-01', '2029-12-31', 36, 12) === 0)
  const tariff = { source: 'paper', plans: [{ id: 'start', name: 'Štart', docs: 20, monthlyCents: 8_900, vatPayer: false }], payrollCents: 1_500, closingCents: 24_900, firstMonthFree: false, issuedInvoicesFree: true }
  const facts = { month: '2027-03', startOn: '2027-01-15', endsOn: '2027-02-28', plan: 'start', tariff, docs: new Map(), people: new Map(), closings: [], billed: new Set(), commitment: { months: 36, maxMonths: 12, charge: true } }
  const exit = billing.draftOf(facts).lines.find((l) => l.key === 'exit:2027-02')
  check('exit fee: a formed company leaving after two months is billed twelve months of its plan, once', exit?.cents === 106_800 && exit.quantityMilli === 12_000 && !billing.draftOf({ ...facts, billed: new Set(['exit:2027-02']) }).lines.some((l) => l.key.startsWith('exit:')))
  check('exit fee: none when it is not charged, before the contract has ended, or for any other client', !billing.draftOf({ ...facts, commitment: { ...facts.commitment, charge: false } }).lines.some((l) => l.key.startsWith('exit:')) && !billing.draftOf({ ...facts, month: '2027-01' }).lines.some((l) => l.key.startsWith('exit:')) && !billing.draftOf({ ...facts, month: '2027-02' }).lines.some((l) => l.key.startsWith('exit:')) && !billing.draftOf({ ...facts, commitment: null }).lines.some((l) => l.key.startsWith('exit:')))
  check('exit fee: the plan is billed from the first month, never free', billing.draftOf({ ...facts, endsOn: null }).lines.some((l) => l.key === 'plan:2027-01'))

  const parties = { founder: { name: 'Ján Novák', born: '7. 3. 1994', address: 'Hlavná 12, Košice' }, company: { name: 'Nova Studio s. r. o.', seat: 'Hlavná 12, Košice', capitalCents: 500_000, activities: ['Poskytovanie softvéru'] }, plan: { name: 'Štart', priceCents: 8_900 }, payment: { iban: 'SK3112000000198742637541', vs: '7202600007' } }
  const text = fc.formationContractText(parties, '2026-10-28', 'Príloha: Vyhlásenie zakladateľa\nTEST')
  const plain = text.replace(/ /g, ' ')
  check('contract: the deposit is held and credited to the last months', plain.includes('zábezpeku (kauciu) 549') && plain.includes('Od 31. mesiaca') && plain.includes('mesačne vopred od prvého mesiaca'))
  check('contract: a founder who stops cooperating keeps nothing of the payment', plain.includes('si v tom prípade ponecháme') && plain.includes('nevraciame ich'))
  check('contract: the exit fee is the months left, at most twelve, with no floor', plain.includes('najviac však 12 mesačných odplát') && !/najmenej 520/.test(plain))
  check('contract: non-payment ends it with interest and the flat compensation', plain.includes('§ 369c'))
  check('contract: the founder’s declaration is signed with it, before the signature', plain.indexOf('Príloha: Vyhlásenie zakladateľa') > 0 && plain.indexOf('Príloha: Vyhlásenie zakladateľa') < plain.indexOf('Podpis zakladateľa'))
  check('contract: no long dashes', !/[–—]/.test(text))
  check('contract: a paper signature means meeting in person, no certified signature asked', plain.includes('vlastnoručne na papieri') && plain.includes('pri osobnom stretnutí, na ktorom Vám overíme totožnosť') && !/osvedčen|notár|poštou/.test(plain))
  const pdf = foundingPdf.foundingContractPdf(text, 'a'.repeat(64), '7202600007')
  check('contract: the PDF to sign carries the text’s fingerprint', pdf.startsWith('%PDF-') && pdf.includes('a'.repeat(64)))
  check('approval: three months from the day the company arose, kept to the month’s end', approveBy('2027-01-15') === '2027-04-15' && approveBy('2027-11-30') === '2028-02-29')
}
