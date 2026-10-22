export function checkFreeInvoiceUnits({ invoice: f, check }) {
  const valid = () => ({ ...f.blankInvoice('2026-10-22'),
    supplier: { name: 'TEST Dodávateľ s. r. o.', address: 'Testovacia 1, 040 01 Košice', ico: '57442452', dic: '2123456789', registry: 'TEST register, oddiel Sro, vložka TEST' },
    customer: { name: 'TEST Odberateľ s. r. o.', address: 'Skúšobná 2, 811 01 Bratislava', ico: '31333532', dic: '', registry: '' },
    number: 'TEST-2026/001', due: '2026-11-05', nonVat: true, domestic: true,
    lines: [{ description: 'TEST účtovná služba', quantity: '1,5', unit: 'hod', price: '10,01' }] })
  check('free invoice: empty scope is never an approved invoice or a PDF', f.checkInvoice(f.blankInvoice('2026-10-22')).errors.length > 0 && f.invoicePdf(f.blankInvoice('2026-10-22')) === null)
  check('free invoice: a supported invoice makes a real PDF with half-cent rounding', f.checkInvoice(valid()).errors.length === 0 && f.checkInvoice(valid()).total === 1502 && new TextDecoder().decode(f.invoicePdf(valid())).startsWith('%PDF-1.4'))
  check('free invoice: fixed-point arithmetic preserves 0.1 + 0.2 at the cent', f.lineCents({ quantity: '3', price: '0,10' }) === 30 && f.lineCents({ quantity: '1,001', price: '100' }) === 10010)
  check('free invoice: exact thousandth quantity, grouped money and half-cent rounding', f.lineCents({ quantity: '0.005', price: '1' }) === 1 && f.lineCents({ quantity: '2', price: '1 234,56' }) === 246912 && f.lineCents({ quantity: '0,004', price: '1' }) === 0)
  check('free invoice: ambiguous grouping, excess precision, negative and exponential amounts are refused', ['1,234.56','1.234,56','1e4','-1','NaN','1,001','1 23'].every((price) => f.lineCents({ quantity:'1', price }) === null) && f.lineCents({quantity:'0',price:'1'}) === null && f.lineCents({quantity:'0.0001',price:'1'}) === null)
  check('free invoice: huge products cannot silently overflow', f.lineCents({quantity:'1000000',price:'10000000'}) === null && f.decimalUnits('9'.repeat(10000),2) === null)
  check('free invoice: dates reject non-existent days and due dates before issue', f.validInvoiceDay('2028-02-29') && !f.validInvoiceDay('2026-02-29') && !f.validInvoiceDay('2026-04-31') && !f.validInvoiceDay('22.10.2026') && f.checkInvoice({...valid(),due:'2026-10-21'}).errors.some(e=>e.field==='due'))
  check('free invoice: SK IBAN checksum is checked, never just its shape', f.validSlovakIban('SK31 1200 0000 1987 4263 7541') && !f.validSlovakIban('SK30 1200 0000 1987 4263 7541') && !f.validSlovakIban('DE89370400440532013000'))
  check('free invoice: VAT and foreign scope require a fresh explicit confirmation', f.invoicePdf({...valid(),nonVat:false}) === null && f.invoicePdf({...valid(),domestic:false}) === null)
  check('free invoice: unprintable characters and directional controls do not become a misleading PDF', f.invoicePdf({...valid(),note:'Emoji 😀'}) === null && f.invoicePdf({...valid(),number:'TEST-1\u202e'}) === null)
  check('free invoice: a zero total is not a positive payment request', f.invoicePdf({...valid(),lines:[{description:'TEST',quantity:'1',price:'0',unit:'ks'}]}) === null)
  check('free invoice: each item is rounded once before the invoice sum', f.checkInvoice({...valid(),lines:Array.from({length:3},()=>({description:'TEST',quantity:'0,005',price:'1',unit:'ks'}))}).total === 3)
  check('free invoice: bounded line count is enforced before export', f.invoicePdf({...valid(),lines:Array.from({length:51},()=>valid().lines[0])}) === null)
  const restored = f.importInvoice(JSON.parse(JSON.stringify({format:'firmony-invoice',version:1,invoice:valid()})))
  check('free invoice: draft round trip retains figures but clears all scope assertions', restored?.number === valid().number && restored?.lines[0].price === '10,01' && restored.nonVat === false && restored.domestic === false && f.invoicePdf(restored) === null)
  check('free invoice: unknown, broken and oversized draft structures are refused', [null,[],{}, {format:'firmony-invoice',version:2,invoice:valid()}, {format:'firmony-invoice',version:1,invoice:{...valid(),lines:[]}}, {format:'firmony-invoice',version:1,invoice:{...valid(),note:'x'.repeat(1001)}}].every(v=>f.importInvoice(v)===null))
  const hostile = JSON.parse(JSON.stringify({format:'firmony-invoice',version:1,invoice:valid()}).replace('"number":', '"__proto__":{"polluted":true},"number":'))
  check('free invoice: import copies whitelisted own data without prototype mutation', f.importInvoice(hostile)?.number === valid().number && ({}).polluted === undefined)
  check('free invoice: download names cannot contain path separators or markup', f.invoiceFileName('../../TEST/<script>') === 'faktura-______TEST__script_')
}
