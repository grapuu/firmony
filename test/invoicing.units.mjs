// Invoicing for everyone (26 October 2026): which pages a workspace reaches, and an invoice from one sentence checked
// as the form checks what is typed.
import { check } from './check.mjs'

export function checkInvoicingUnits({ invoiceAi, invoicing }) {
  const reach = invoicing.invoicingPath
  check(
    'a workspace reaches its invoices, customers, settings, logo and the switch',
    ['/app/faktury', '/app/faktury/nova', '/app/faktury/nova/veta', '/app/faktury/abc/pdf', '/app/odberatelia', '/app/fakturacia', '/app/fakturacia/zrusit', '/app/logo', '/app/firma/prepnut'].every(reach),
  )
  check(
    'and nothing of the books, the bank, the messages, the export or the reminders by email',
    !['/app', '/app/platby', '/app/doklady', '/app/banka', '/app/spravy', '/app/firma', '/app/export', '/app/faktury/upomienky', '/app/faktury/abc/zaloha', '/app/asistent', '/app/vyhlasenie', '/app/fakturacia/x/y'].some(reach),
  )
  const draft = invoiceAi.draftOf(
    {
      customer_name: '  Zelený   dvor ',
      customer_ico: '55 012 345',
      lines: [
        { description: 'Konzultácie', quantity: 3, unit: 'HOD', unit_price: 50 },
        { description: 'Licencia', quantity: 1, unit_price: 123, price_includes_vat: true, vat_rate: 23 },
        { description: '', quantity: 1, unit_price: 5 },
        { description: 'Záporná', quantity: -1, unit_price: 5 },
        { description: 'Obrovská', quantity: 1, unit_price: 1e12 },
      ],
      due_days: 14,
      note: 'Ďakujeme',
    },
    true,
  )
  check(
    'a draft keeps only what the form would take',
    draft?.customerName === 'Zelený dvor' && draft.customerIco === '55012345' && draft.lines.length === 2 && draft.dueDays === 14 && draft.note === 'Ďakujeme',
    JSON.stringify(draft),
  )
  check('a price with VAT is taken back to the price without it', draft?.lines[1].unitCents === 10000 && draft.lines[1].vatRate === 23 && draft.lines[0].unitCents === 5000 && draft.lines[0].unit === 'hod' && draft.lines[0].quantityMilli === 3000)
  check('a company that is no VAT payer keeps the price as said', invoiceAi.draftOf({ lines: [{ description: 'x', quantity: 1, unit_price: 123, price_includes_vat: true, vat_rate: 23 }] }, false)?.lines[0].unitCents === 12300)
  check('no line, no draft; nonsense is none', invoiceAi.draftOf({ lines: [] }, true) === null && invoiceAi.draftOf('text', true) === null && invoiceAi.draftOf({ lines: [{ description: 'x', quantity: 'tri', unit_price: 5 }] }, true) === null)
  check('an IČO and a due day out of bounds are left out', invoiceAi.draftOf({ customer_ico: 'abc', due_days: 999, lines: [{ description: 'x', quantity: 1, unit_price: 1 }] }, false)?.customerIco === null)
  const values = { customerName: '', customerAddress: '', customerIco: '', customerDic: '', customerIcdph: '', customerEmail: '', issued: '1. 10. 2026', delivered: '1. 10. 2026', due: '15. 10. 2026', iban: '', note: '', lines: [] }
  const filled = invoiceAi.fillValues(values, draft, true, (d) => `+${d}`)
  check(
    'the draft fills the form as typed, with an empty line to go on',
    filled.customerName === 'Zelený dvor' && filled.due === '+14' && filled.lines.length === 3 && filled.lines[0].price === '50,00' && filled.lines[0].quantity === '3' && filled.lines[1].price === '100,00' && filled.lines[2].description === '',
    JSON.stringify(filled.lines),
  )
}
