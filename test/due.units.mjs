// What is left to pay of a document apart from its total (29 October 2026, europio as client zero): a subscription
// invoice whose balance was set off, read by the reader (read.ts readingFrom) or from an e-invoice (xml.ts readInvoice),
// and paired with the payment of what was left (match.ts score). Every value invented.
import { readFileSync } from 'node:fs'
import { check } from './check.mjs'
import { xml, match, reader } from '../.wrangler/tmp/units-bundle.mjs'

export function checkDueUnits() {
  const read = (input) => reader.readingFrom({ je_doklad: true, typ: 'faktura_prijata', ...input })
  const partly = read({ suma_celkom: '90.00', suma_na_uhradu: '14.19', dph_celkom: '0', dph_podla_sadzieb: [{ sadzba: 0, zaklad: '90.00', dph: '0.00' }] })
  check('due: the total is the document\'s and what is left to pay is apart', partly?.totalCents === 9000 && partly.dueCents === 1419 && partly.vatCents === 0)
  check('due: all of it set off is nothing left to pay', read({ suma_celkom: '44.90', suma_na_uhradu: '0' })?.dueCents === 0)
  check(
    'due: the total itself, more than it, a minus or no total say nothing of the kind',
    read({ suma_celkom: '90.00', suma_na_uhradu: '90.00' })?.dueCents === undefined &&
      read({ suma_celkom: '90.00', suma_na_uhradu: '120.00' })?.dueCents === undefined &&
      read({ suma_celkom: '90.00', suma_na_uhradu: '-14.19' })?.dueCents === undefined &&
      read({ suma_na_uhradu: '14.19' })?.dueCents === undefined,
  )
  check('due: never on a document that corrects an invoice', read({ suma_celkom: '-15.87', suma_na_uhradu: '5.00', opravuje_fakturu: 'FA1' })?.dueCents === undefined)

  const ubl = readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url), 'utf8')
  const whole = xml.readInvoice(ubl, '57442452')
  const setOff = xml.readInvoice(
    ubl.replace('<cbc:PayableAmount currencyID="EUR">59.90</cbc:PayableAmount>', '<cbc:PrepaidAmount currencyID="EUR">50.00</cbc:PrepaidAmount><cbc:PayableAmount currencyID="EUR">9.90</cbc:PayableAmount>'),
    '57442452',
  )
  check('due: an e-invoice is worth its total with VAT, and an amount paid before leaves its payable apart', whole?.totalCents === 5990 && whole.dueCents === undefined && setOff?.totalCents === 5990 && setOff.dueCents === 990)

  const doc = { id: 'd', kind: 'invoice_in', issuedOn: '2026-10-22', dueOn: '2026-10-22', totalCents: 9000, dueCents: 1419, party: 'TEST Cloud Services Ltd.', partyIban: null, vs: null }
  const pay = (amountCents) => ({ id: 'p', bookedOn: '2026-10-23', amountCents, party: 'TEST CLOUD SERVICES', partyIban: null, vs: null })
  check(
    'due: the payment of what was left pairs with the document, as the payment of its whole total would',
    match.score(pay(-1419), doc) >= match.AUTO_SCORE && match.score(pay(-9000), doc) >= match.AUTO_SCORE && match.score(pay(-1418), doc) === 0,
  )
  check('due: nothing left to pay pairs with no payment of nought', match.score(pay(0), { ...doc, dueCents: 0 }) === 0 && match.score(pay(-1419), { ...doc, dueCents: null }) === 0)
}
