// Tatra banka's XML of movements (xml.ts readOfx), as a real export of europio's account of 1 October 2026 showed it, in
// test/fixtures/tatra-pohyby.xml with every value invented; and the transaction tax that no document stands behind
// (match.ts autoExempt, ledger.ts reasonAccount).
import { readFileSync } from 'node:fs'
import { check } from './check.mjs'
import { xml, match, ledger } from '../.wrangler/tmp/units-bundle.mjs'

export function checkTatraUnits() {
  const file = readFileSync(new URL('./fixtures/tatra-pohyby.xml', import.meta.url), 'utf8')
  const read = xml.readStatement(file)
  const s = read?.[0]
  check('tatra: the export is one statement of its account, its days from the file, without balances', read?.length === 1 && s.iban === 'SK2411000000002612345678' && s.from === '2026-08-01' && s.to === '2026-09-30' && s.opening === null && s.closing === null && s.entries.length === 9, JSON.stringify(s && { ...s, entries: s.entries.length }))
  const e = s?.entries ?? []
  check('tatra: money in is plus, money out minus, by the type of each movement', e[0]?.amountCents === 10000 && e[3]?.amountCents === -1218 && e[8]?.amountCents === -200)
  check('tatra: a card payment is one, named by its merchant', e[3]?.card === true && e[3].party === 'WWW.TESTHOSTING.SK' && e[6]?.card === true && e[6].party === 'BOLT.EU/B/2609010001' && e[0]?.card === false)
  check('tatra: the other side\'s IBAN, none for a card; the variable symbol from its own field or the end-to-end reference', e[1]?.partyIban === 'LT601010012345678901' && e[3]?.partyIban === null && e[4]?.vs === '1100022026' && e[2]?.vs === '20260001')
  check('tatra: two equal movements of a day are two payments, and the same file read again gives the same references', e[6]?.ref !== e[7]?.ref && JSON.stringify(xml.readStatement(file)?.[0]?.entries.map((x) => x.ref)) === JSON.stringify(e.map((x) => x.ref)))
  check('tatra: the export is kept as movements, a source of its own beside the bank\'s statements', s?.kind === 'movements')
  const tx = (day, amount, name, memo) => `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>${day}</DTPOSTED><TRNAMT>${amount}</TRNAMT><NAME>${name}</NAME><BANKACCTTO><ACCTID>0</ACCTID><IBAN>SK3112000000198742637541</IBAN></BANKACCTTO><MEMO>${memo}</MEMO><CURRENCY>EUR</CURRENCY></STMTTRN>`
  const sept = xml.readStatement(`<OFX><STMTRS><BANKACCTFROM><IBAN>SK2411000000002612345678</IBAN></BANKACCTFROM><BANKTRANLIST><DTSTART>20260901</DTSTART><DTEND>20261001</DTEND>${tx('20260926', '150.00', 'Dodavatel s.r.o.', 'Nakup materialu')}</BANKTRANLIST></STMTRS></OFX>`)?.[0]
  check('tatra: an export ending 20261001 covers September whole, also the days after its last movement', sept?.from === '2026-09-01' && sept.to === '2026-09-30', JSON.stringify(sept && { from: sept.from, to: sept.to }))
  check('tatra: a transfer whose message says "nákup" is no card payment and keeps its payee', sept?.entries[0]?.card === false && sept.entries[0].party === 'Dodavatel s.r.o.')
  check('tatra: a camt.053 is still read as one, and a file that is neither is none', xml.readStatement('<OFX></OFX>') === null && xml.readStatement('<Invoice/>') === null)
  const own = []
  check('tatra: the transaction tax the bank withholds needs no document', match.autoExempt({ amountCents: -200, party: null, partyIban: null, note: 'Transakcna dan 06.08.2026' }, own) === 'state')
  check('tatra: it is booked to taxes, 538, whether withheld or paid by notice to its own account',
    ledger.reasonAccount({ amountCents: -200, vs: null, note: 'Transakcna dan 06.08.2026', exempt: 'state', exemptNote: null, partyIban: null }) === '538' &&
      ledger.reasonAccount({ amountCents: -23, vs: '1700082026', note: null, exempt: 'state', exemptNote: null, partyIban: 'SK1781805014031234567890' }) === '538' &&
      ledger.reasonAccount({ amountCents: -1165, vs: '1100022026', note: null, exempt: 'state', exemptNote: null, partyIban: 'SK5281805002401234567890' }) !== '538')
  // A payer who typed the invoice's number as its name, with no symbol (europio's statement of September 2026).
  check('tatra: a payment without a symbol carries an invoice number written alone in the name or the message',
    match.carriesVs({ vs: null, party: '22026004', note: 'Platba PO2' }, '22026004') &&
      match.carriesVs({ vs: '', party: 'Jana Nová', note: 'faktura 0022026004' }, '22026004') &&
      !match.carriesVs({ vs: null, party: '220260042', note: null }, '22026004') &&
      !match.carriesVs({ vs: '9999', party: '22026004', note: null }, '22026004') &&
      !match.carriesVs({ vs: null, party: 'platba 2026', note: null }, '2026'))
  const paid = { id: 'p', bookedOn: '2026-09-28', amountCents: 5000, party: '22026004', partyIban: 'LT000000000000000000', vs: null, note: 'Platba PO1' }
  const invoice = (id, vs) => ({ id, kind: 'invoice_out', issuedOn: '2026-09-20', dueOn: '2026-10-04', totalCents: 5000, party: 'Odberateľ s. r. o.', partyIban: null, vs })
  check('tatra: so of two invoices of the same amount, the payment pairs with the one whose number it carries',
    JSON.stringify(match.decide([paid], [invoice('a', '22026004'), invoice('b', '22026005')]).auto) === '[["p","a"]]' &&
      match.decide([{ ...paid, party: 'Odberateľ' }], [invoice('a', '22026004'), invoice('b', '22026005')]).auto.length === 0)
}
