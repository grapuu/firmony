// The invoice as a PDF (26 October 2026): a valid file whose cross-reference points at every object, every text of the
// sheet in it, pages that go on with the table's head, letters the font lacks folded and never a question mark, the QR
// code only where the sheet has it, the logo as JPEG or PNG with its alpha; and the messages the client sends with it.
import { check } from './check.mjs'
import { appCopy, invoicePdf as pdfs, invoiceSend as send, invoiceSheet as sheets, invoices, pdf as pdfWriter } from '../.wrangler/tmp/units-bundle.mjs'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

const JPEG_RGB =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyivoD9lH/AJmn/t1/9rV8/wBfQH7KP/M0/wDbr/7Wr9W4l/5FtX/t3/0pHlYb+Kj6Aooor8pPVP/Z'
const JPEG_GREY =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAGAAoBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACiv/9k='

/** A PNG made here: its rows filtered as asked (0 to 4), the palette and tRNS when given. */
function png({ width, height, color, depth = 8, rows, filters = [], palette = null, trns = null, interlace = 0, idat = null }) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'latin1')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0)
    return Buffer.concat([head, data, tail])
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color]
  const bpp = Math.max(1, (channels * depth) >> 3)
  const raw = []
  rows.forEach((row, y) => {
    const f = filters[y] ?? 0
    const prev = rows[y - 1] ?? row.map(() => 0)
    const out = row.map((v, x) => {
      const left = x >= bpp ? row[x - bpp] : 0
      const up = y > 0 ? prev[x] : 0
      const corner = x >= bpp && y > 0 ? prev[x - bpp] : 0
      const p = left + up - corner
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - corner) ? left : Math.abs(p - up) <= Math.abs(p - corner) ? up : corner
      const pred = [0, left, up, (left + up) >> 1, paeth][f]
      return (v - pred + 256) & 0xff
    })
    raw.push(f, ...out)
  })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = color
  ihdr[12] = interlace
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      ...(palette ? [chunk('PLTE', Buffer.from(palette))] : []),
      ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
      chunk('IDAT', idat ?? deflateSync(Buffer.from(raw))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

/** The texts a PDF draws, in their order: its strings decoded by the font's own codes. */
function textsOf(bytes) {
  const src = Buffer.from(bytes).toString('latin1')
  const decode = new Map()
  for (const ch of 'áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽěřůĚŘŮöüÖÜ€§°×·„“”‘’…–—•©«»±´÷') {
    const m = /^\(\\(\d{3})\)$/.exec(pdfWriter.pdfString(ch))
    if (m) decode.set(Number.parseInt(m[1], 8), ch)
  }
  const out = []
  for (const m of src.matchAll(/\(((?:\\.|\\\d{3}|[^\\)])*)\) Tj/g)) {
    out.push(m[1].replace(/\\(\d{3})|\\(.)/g, (_, oct, esc) => (oct ? (decode.get(Number.parseInt(oct, 8)) ?? '\u0000') : esc)))
  }
  return out
}
const flat = (texts) => texts.join(' ').replace(/\s+/g, ' ')
const norm = (text) => text.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim()

/** The file's structure: the header, each object where the cross-reference says, the end. */
function structure(bytes) {
  const src = Buffer.from(bytes).toString('latin1')
  const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(src)?.[1])
  const table = src.slice(xref).split('\n').slice(2).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)))
  const size = Number(/\/Size (\d+)/.exec(src)?.[1])
  return {
    src,
    ok: src.startsWith('%PDF-1.4\n') && src.endsWith('%%EOF\n') && src.slice(xref).startsWith('xref\n') && table.length === size - 1 && table.every((o, i) => src.slice(o).startsWith(`${i + 1} 0 obj`)),
    pages: Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(src)?.[1]),
  }
}

export async function checkInvoicePdfUnits() {
  const s = appCopy.app.invoices.sheet
  const seller = (over = {}) => ({
    id: 'co',
    name: 'TEST-ONLY Nordia s. r. o.',
    ico: '57442452',
    dic: '2122722633',
    icdph: 'SK2122722633',
    address: 'Hlavná 1, 040 01 Košice',
    registerLine: 'Obchodný register Okresného súdu Košice I, oddiel Sro, vložka č. 56789/V',
    vatPayer: true,
    logoKey: null,
    logoType: null,
    ...over,
  })
  const invoice = (over = {}) => ({
    id: 'inv', number: '20260001', status: 'issued', customerName: 'TEST-ONLY Zelený dvor s. r. o.', customerIco: '55012345', customerDic: '2121234567', customerIcdph: 'SK2121234567',
    customerAddress: 'Mlynská 12, 040 01 Košice', customerEmail: 'uctaren@example.sk', issuedOn: '2026-10-26', deliveredOn: '2026-10-26', dueOn: '2026-11-09', note: 'Ďakujeme za spoluprácu.',
    baseCents: 0, vatCents: 0, totalCents: 0, token: 'T'.repeat(43), documentId: 'doc', iban: 'SK3112000000198742637541', sentAt: null, remindedAt: null, createdAt: 0, createdByName: 'Christian Juhás',
    createdBy: 'u', paidOn: null, kind: 'invoice', vs: '20260001', relates: null, relatesNumber: null, paidCents: 0, mode: 'domestic', reverse: null, corrects: null, correctsNumber: null,
    correctsIssuedOn: null, reason: null, repeatId: null, reminders: 0, interestOf: null, customerCountry: null, currency: 'EUR', fxRate: null, fxDay: null, ...over,
  })
  const line = (position, description, quantityMilli, unit, unitCents, vatRate, extra = {}) => ({ position, description, quantityMilli, unit, unitCents, vatRate, baseCents: Math.round((quantityMilli * unitCents) / 1000), ...extra })
  const three = [line(1, 'Návrh webovej stránky', 1000, 'ks', 240000, 23), line(2, 'Konzultácie', 6500, 'hod', 6000, 23), line(3, 'Potraviny', 2000, 'bal', 1250, 19), line(4, 'Knihy', 3000, 'ks', 2490, 5)]
  const make = async (inv, lines, sel, { pay = true, logo = null } = {}) => {
    const sheet = sheets.sheetOf(inv, lines, sel, pay)
    const bytes = pdfs.invoicePdf({ sheet, number: inv.number, logo: logo ? await pdfs.logoImage(logo) : null })
    return { sheet, bytes, ...structure(bytes), texts: textsOf(bytes) }
  }

  // A VAT payer's invoice at three rates.
  const vatInv = invoice({ totalCents: invoices.totalsOf(three, true).total })
  const a = await make(vatInv, three, seller())
  const all = flat(a.texts)
  check('an invoice as a PDF: one A4 page whose cross-reference points at every object, from %PDF-1.4 to %%EOF', a.ok && a.pages === 1 && a.src.includes('/MediaBox [0 0 595.28 841.89]'), a.src.slice(0, 200))
  const model = a.sheet
  const sheetTexts = [
    model.kind, model.number, model.supplierLabel, model.customerLabel, model.seller.name, model.customer.name, ...model.seller.lines, ...model.customer.lines,
    ...[...model.seller.ids, ...model.customer.ids].flatMap((id) => [id.label, id.value]), ...model.dates.flatMap((d) => [d.label, d.value]),
    model.head.description, model.head.quantity, model.head.unitPrice, model.head.vat, model.head.amount,
    ...model.rows.flatMap((r) => [r.description, r.quantity.trim(), r.unitPrice, r.vat, r.amount]),
    ...(model.pay ?? []).flatMap((p) => [p.label, p.value]), ...model.totals.flatMap((p) => [p.label, p.value]), model.total.label, model.total.value,
    model.qrCaption.text, model.qrCaption.brand, model.note, ...model.foot,
  ].filter(Boolean)
  const missing = sheetTexts.filter((text) => !all.includes(norm(text)))
  check('every text of the sheet is in the PDF: parties, dates, lines, VAT by rate, the total, how to pay, the note, the register, who issued it', missing.length === 0 && sheetTexts.length > 50, missing.join(' | '))
  check(
    'the number, the customer, "Spolu na úhradu" and the IBAN in groups, the VAT of each rate',
    all.includes('č. 20260001') && all.includes('TEST-ONLY Zelený dvor s. r. o.') && all.includes(`Spolu na úhradu ${norm(model.total.value)}`) && all.includes('SK31 1200 0000 1987 4263 7541') && ['DPH 23 %', 'DPH 19 %', 'DPH 5 %'].every((t) => all.includes(t)),
  )
  check('the quiet line of Firmony at the foot, no page number on a single page', all.includes('Vystavené v aplikácii Firmony · firmony.io') && !/\b1 \/ 1\b/.test(all))
  check('the QR code a bank pays from, drawn as rectangles, where the sheet shows it', model.qr !== null && a.src.includes('/PayBySquare BMC') && (a.src.match(/ re /g) ?? []).length > 60)
  const title = Buffer.from(/\/Title <FEFF([0-9A-F]+)>/.exec(a.src)?.[1] ?? '', 'hex').swap16().toString('utf16le')
  check('its title in the reader is the document, its number and the seller, every letter kept, no long dash', title === 'Faktúra 20260001 · TEST-ONLY Nordia s. r. o.' && a.src.includes('/DisplayDocTitle true'), title)
  check('the same invoice gives the same bytes', Buffer.compare(Buffer.from(a.bytes), Buffer.from((await make(vatInv, three, seller())).bytes)) === 0)

  // No QR code where the sheet has none: paid, a credit note, another currency.
  const paid = await make(vatInv, three, seller(), { pay: false })
  const credit = await make(
    invoice({ kind: 'credit', number: '20260012', corrects: 'x', correctsNumber: '20260001', correctsIssuedOn: '2026-10-01', reason: 'Vrátený tovar: dve balenia boli poškodené.', totalCents: -2975 }),
    [line(1, 'Potraviny (vrátené)', 2000, 'bal', -1250, 19)],
    seller(),
  )
  const creditText = flat(credit.texts)
  check(
    'a paid invoice and a credit note carry no QR code; a credit note says what it corrects, why, and "Spolu na vrátenie", with no way to pay',
    !paid.src.includes('/PayBySquare') &&
      !credit.src.includes('/PayBySquare') &&
      creditText.includes('Dobropis') &&
      creditText.includes(norm(s.corrects('20260001', appCopy.dayName('2026-10-01')))) &&
      creditText.includes('Dôvod opravy Vrátený tovar: dve balenia boli poškodené.') &&
      creditText.includes('Spolu na vrátenie') &&
      !creditText.includes(s.method),
    creditText.slice(0, 400),
  )
  const usd = await make(
    invoice({ number: '20260021', vs: '20260021', mode: 'export', currency: 'USD', fxRate: '1,0845', fxDay: '2026-10-25', customerIco: null, customerDic: null, customerIcdph: null, customerCountry: 'US', customerAddress: '350 Fifth Avenue, New York' }),
    [line(1, 'Senzory', 15000, 'ks', 10190, 0)],
    seller(),
  )
  const usdText = flat(usd.texts)
  check(
    "an invoice in dollars: no QR code, the export's sentence of § 47, the customer's state, the ECB's rate and the VAT in euros",
    !usd.src.includes('/PayBySquare') &&
      usdText.includes(norm(invoices.MODE_TERMS.export.text)) &&
      usdText.includes('Spojené štáty') &&
      usdText.includes(norm(s.fx('USD', '1,0845', appCopy.dayName('2026-10-25')))) &&
      usdText.includes('DPH spolu v eurách') &&
      usdText.includes('1 528,50 USD'),
    usdText.slice(0, 500),
  )
  const nonPayer = await make(invoice({ customerIcdph: null }), [line(1, 'Oprava strechy', 1000, 'ks', 85000, 0), line(2, 'Materiál', 12500, 'm²', 1840, 0)], seller({ vatPayer: false, icdph: null }))
  const npText = flat(nonPayer.texts)
  check(
    'a company that is no VAT payer: its sentence at the foot, no VAT column, a QR code, and m² printed as m2',
    npText.includes('Dodávateľ nie je platiteľom DPH.') && !nonPayer.texts.includes('DPH') && nonPayer.src.includes('/PayBySquare BMC') && npText.includes('12,5 m2') && !npText.includes('?'),
    npText.slice(0, 300),
  )
  const proforma = await make(invoice({ kind: 'proforma', number: 'ZF20260003', vs: '9202600003' }), three.slice(0, 2), seller())
  const interest = await make(invoice({ number: '20260050', vs: '20260050', interestOf: 'x', mode: 'outside' }), [line(1, 'Úrok z omeškania', 1000, 'ks', 1234, 0)], seller())
  const advance = await make(invoice({ kind: 'advance', number: '20260030', vs: null, relatesNumber: 'ZF20260003', deliveredOn: '2026-10-20' }), [line(1, 'Prijatá záloha', 1000, null, 81301, 23, { vatCents: 18699 })], seller())
  check(
    'a request for an advance says it is no tax document; late interest why it has no VAT; an advance received its request, the day received and "Prijatá platba", no due day, no QR code',
    flat(proforma.texts).includes(norm(s.proformaNote)) &&
      flat(proforma.texts).includes('Zálohová faktúra') &&
      flat(interest.texts).includes(norm(invoices.INTEREST_NOTE)) &&
      flat(advance.texts).includes(norm(s.relates('ZF20260003'))) &&
      flat(advance.texts).includes(s.received) &&
      flat(advance.texts).includes('Prijatá platba') &&
      !advance.texts.includes(s.due) &&
      !advance.src.includes('/PayBySquare'),
  )

  // Sixty lines: further pages, the table's head on each, the totals and the payment once, on the last.
  const many = Array.from({ length: 60 }, (_, i) => line(i + 1, i % 9 === 4 ? `Položka ${i + 1}: ${'veľmi dlhý popis služby '.repeat(6)}` : `Položka ${i + 1}`, 1000, 'hod', 4500 + i, 23))
  const long = await make(invoice({ totalCents: invoices.totalsOf(many, true).total }), many, seller())
  const heads = long.texts.filter((t) => t === 'Popis').length
  const numbers = long.texts.filter((t) => /^\d+ \/ \d+$/.test(t))
  check(
    'sixty lines go on further pages, each with the table head and its number "1 / n", the total once, every line drawn once',
    long.ok && long.pages >= 2 && heads >= 2 && numbers.length === long.pages && numbers.at(-1) === `${long.pages} / ${long.pages}` && long.texts.filter((t) => t === 'Spolu na úhradu').length === 1 && many.every((l) => long.texts.filter((t) => t.startsWith(`Položka ${l.position}`) && (t === `Položka ${l.position}` || t.startsWith(`Položka ${l.position}:`))).length === 1),
    `${long.pages} pages, ${heads} heads, ${numbers.join(',')}`,
  )
  const one = await make(invoice({ totalCents: 100 }), [line(1, 'Jedna', 1000, 'ks', 100, 23)], seller())
  const twelve = await make(invoice({ totalCents: 100 }), Array.from({ length: 12 }, (_, i) => line(i + 1, `Položka ${i + 1}`, 1000, 'hod', 4500, 23)), seller())
  check('one line and twelve fit one page', one.pages === 1 && twelve.pages === 1)

  // Nothing wider than its column: every line of a long description, name and address within its width.
  const wrapped = pdfs.wrapText(`Dlhé slovo ${'x'.repeat(200)} a https://example.sk/${'cesta/'.repeat(30)} koniec`, 200, 9)
  check('a text wraps at spaces, and a word wider than the line breaks inside it', wrapped.length > 3 && wrapped.every((l) => pdfWriter.textWidth(l, 9) <= 200.01) && wrapped.join('').replace(/\s/g, '').length === `Dlhéslovo${'x'.repeat(200)}ahttps://example.sk/${'cesta/'.repeat(30)}koniec`.length)
  check('"s. r. o." and a one-letter word stay with what follows', pdfs.wrapText('Spoločnosť pre rozvoj a výstavbu infraštruktúry, s. r. o.', 150, 10.5, true).every((l) => !/(^| )(s\.|r\.|a)$/.test(l.replace(/ /g, ' ').trimEnd()) || / s\. r\. o\.$/.test(l.replace(/ /g, ' '))))

  // Letters the font lacks: folded, written in Latin letters, never a question mark.
  check(
    'Polish, Hungarian, Romanian, German, Cyrillic and signs folded for the file; an emoji left out; Slovak letters kept',
    pdfs.pdfSafe('Łódź Ő ő ș Ț ß Москва Жилина Щ ² ™ ľťď 🙂') === 'Lódz O o s T ss Moskva Žilina Šč 2 TM ľťď ',
    pdfs.pdfSafe('Łódź Ő ő ș Ț ß Москва Жилина Щ ² ™ ľťď 🙂'),
  )
  const foreign = await make(invoice({ customerName: 'Łukasz Wiśniewski, Nagy Ödön Kft., Ștefan Ionescu, ООО Москва 🙂', note: 'Zľava ½ — špeciálne™' }), three, seller())
  const strings = Buffer.from(foreign.bytes).toString('latin1').match(/\((?:\\.|[^\\)])*\) Tj/g) ?? []
  check(
    'a customer of another alphabet is printed in its letters folded, and no text of the file has a question mark',
    flat(foreign.texts).includes('Lukasz Wisniewski, Nagy Ödön Kft., Stefan Ionescu, OOO Moskva') && strings.every((t) => !t.includes('?')) && flat(foreign.texts).includes('Zľava 1/2 — špeciálneTM'),
    flat(foreign.texts).slice(0, 300),
  )

  // The logo: JPEG as it is, PNG decoded with its alpha as a soft mask, anything else none.
  const jpeg = new Uint8Array(Buffer.from(JPEG_RGB, 'base64'))
  const jpegImage = await pdfs.logoImage(jpeg)
  const withJpeg = await make(vatInv, three, seller(), { logo: jpeg })
  check(
    'a JPEG logo is embedded as it is (DCTDecode), its size and colours from its frame, drawn on the first page',
    jpegImage?.filter === 'DCTDecode' && jpegImage.width === 24 && jpegImage.height === 12 && jpegImage.colorSpace === 'DeviceRGB' && withJpeg.ok && withJpeg.src.includes('/Filter /DCTDecode') && withJpeg.src.includes('/Im1 Do') && Buffer.from(withJpeg.bytes).includes(Buffer.from(jpeg)),
  )
  check('a grey JPEG is DeviceGray', (await pdfs.logoImage(new Uint8Array(Buffer.from(JPEG_GREY, 'base64'))))?.colorSpace === 'DeviceGray')
  // RGBA 3 × 3 with each filter, one pixel half transparent.
  const rgba = [
    [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
    [10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255],
    [200, 150, 100, 255, 1, 2, 3, 255, 250, 251, 252, 255],
  ]
  const rgbaImage = await pdfs.logoImage(png({ width: 3, height: 3, color: 6, rows: rgba, filters: [1, 2, 4] }))
  const rgbOut = rgbaImage ? [...inflateSync(Buffer.from(rgbaImage.data))] : []
  const alphaOut = rgbaImage?.alpha ? [...inflateSync(Buffer.from(rgbaImage.alpha))] : []
  check(
    'an RGBA PNG: its rows unfiltered (Sub, Up, Paeth), the colour as RGB and the alpha apart',
    rgbaImage?.filter === 'FlateDecode' && rgbaImage.colorSpace === 'DeviceRGB' && JSON.stringify(rgbOut) === JSON.stringify(rgba.flatMap((r) => r.filter((_, i) => i % 4 !== 3))) && JSON.stringify(alphaOut) === JSON.stringify([255, 255, 255, 255, 128, 255, 255, 255, 255]),
    JSON.stringify([rgbOut, alphaOut]),
  )
  const withPng = await make(vatInv, three, seller(), { logo: png({ width: 3, height: 3, color: 6, rows: rgba, filters: [3, 0, 2] }) })
  check('a PNG with alpha is drawn with its soft mask, and the file stays valid', withPng.ok && /\/SMask \d+ 0 R/.test(withPng.src) && withPng.src.includes('/Filter /FlateDecode'))
  const opaque = await pdfs.logoImage(png({ width: 2, height: 1, color: 2, rows: [[1, 2, 3, 4, 5, 6]] }))
  const palette = await pdfs.logoImage(png({ width: 4, height: 1, color: 3, depth: 2, rows: [[0b00011011]], palette: [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255], trns: [0] }))
  const grey = await pdfs.logoImage(png({ width: 2, height: 2, color: 0, rows: [[0, 255], [128, 64]], filters: [0, 4] }))
  const greyAlpha = await pdfs.logoImage(png({ width: 2, height: 1, color: 4, rows: [[9, 0, 99, 255]] }))
  check(
    'an opaque PNG has no mask; a palette of 2 bits with tRNS is RGB with its transparent index; grey and grey with alpha are DeviceGray',
    opaque?.alpha === null &&
      JSON.stringify([...inflateSync(Buffer.from(opaque.data))]) === '[1,2,3,4,5,6]' &&
      palette?.colorSpace === 'DeviceRGB' &&
      JSON.stringify([...inflateSync(Buffer.from(palette.data))]) === '[0,0,0,255,0,0,0,255,0,0,0,255]' &&
      JSON.stringify([...inflateSync(Buffer.from(palette.alpha))]) === '[0,255,255,255]' &&
      grey?.colorSpace === 'DeviceGray' &&
      JSON.stringify([...inflateSync(Buffer.from(grey.data))]) === '[0,255,128,64]' &&
      greyAlpha?.colorSpace === 'DeviceGray' &&
      JSON.stringify([...inflateSync(Buffer.from(greyAlpha.alpha))]) === '[0,255]',
  )
  const big = await pdfs.logoImage(png({ width: 1800, height: 30, color: 2, rows: Array.from({ length: 30 }, () => Array.from({ length: 5400 }, (_, i) => i % 256)) }))
  check('a large logo is brought down to its box at about 300 dpi', big?.width === 600 && big.height === 10, JSON.stringify([big?.width, big?.height]))
  const started = Date.now()
  const bomb = await pdfs.logoImage(png({ width: 1, height: 1, color: 2, rows: [[7, 8, 9]], idat: deflateSync(Buffer.concat([Buffer.from([0, 7, 8, 9]), Buffer.alloc(50_000_000)])) }))
  check('a PNG whose data would inflate to far more than its rows is read only as far as its rows', bomb?.width === 1 && JSON.stringify([...inflateSync(Buffer.from(bomb.data))]) === '[7,8,9]' && Date.now() - started < 3000, String(Date.now() - started))
  check('a picture of more than 4 million pixels is no logo', (await pdfs.logoImage(png({ width: 2001, height: 2000, color: 0, rows: [], idat: deflateSync(Buffer.alloc(10)) }))) === null)
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')])
  check(
    'a WebP, a PNG of 16 bits, an interlaced one or broken bytes: no logo, and the invoice is still made',
    (await pdfs.logoImage(webp)) === null &&
      (await pdfs.logoImage(png({ width: 1, height: 1, color: 0, depth: 16, rows: [[0, 0]] }))) === null &&
      (await pdfs.logoImage(png({ width: 1, height: 1, color: 2, rows: [[1, 2, 3]], interlace: 1 }))) === null &&
      (await pdfs.logoImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))) === null &&
      (await make(vatInv, three, seller(), { logo: webp })).ok,
  )

  // The file's name.
  check(
    "the file's name in plain letters, the number's marks made safe",
    pdfs.invoicePdfName('Faktúra', '20260001') === 'Faktura-20260001.pdf' &&
      pdfs.invoicePdfName('Dobropis', 'FA2026/0007') === 'Dobropis-FA2026-0007.pdf' &&
      pdfs.invoicePdfName('Zálohová faktúra', 'ZF20260003') === 'Zalohova-faktura-ZF20260003.pdf' &&
      pdfs.invoicePdfName('Daňový doklad k prijatej platbe', '20260030') === 'Danovy-doklad-k-prijatej-platbe-20260030.pdf',
  )

  // The messages the client sends: by email from his own program, from the phone's share sheet, a reminder.
  const link = 'https://firmony.io/f/TTTT'
  const opts = { asked: vatInv.totalCents, payable: true, qr: true }
  const msg = send.invoiceMessage(vatInv, seller(), link, opts)
  const total = model.total.value.replace(/ /g, ' ')
  check(
    'the email says what it is, its number, the amount, the due day, the account and the symbol, the link, signed by the company; no non-breaking space',
    msg.subject === 'Faktúra 20260001 od TEST-ONLY Nordia s. r. o.' &&
      msg.body.includes(`faktúru č. 20260001 na sumu ${total} so splatnosťou 9. novembra 2026.`) &&
      msg.body.includes('Úhrada prevodom na účet SK31 1200 0000 1987 4263 7541, variabilný symbol 20260001.') &&
      msg.body.includes('QR kód') &&
      msg.body.includes(link) &&
      msg.body.endsWith('S pozdravom\nTEST-ONLY Nordia s. r. o.') &&
      !/[  —–]/.test(msg.body + msg.subject + msg.short) &&
      msg.short.includes(link),
    msg.body,
  )
  const href = send.invoiceMailto(vatInv, seller(), link, opts)
  check(
    'its mailto: link goes to the customer, every character encoded, lines broken by CRLF',
    href.startsWith('mailto:uctaren@example.sk?subject=Fakt%C3%BAra%2020260001%20od%20') && href.includes('&body=Dobr%C3%BD%20de%C5%88%2C%0D%0A%0D%0A') && decodeURIComponent(href.split('&body=')[1]).replace(/\r\n/g, '\n') === msg.body,
  )
  const longCredit = invoice({ kind: 'credit', number: '20260099', correctsNumber: '20260001', reason: 'Dôvod ťažký '.repeat(45), totalCents: -1000, customerEmail: `${'a'.repeat(60)}@example.sk` })
  const longHref = send.invoiceMailto(longCredit, seller({ name: 'Spoločnosť s veľmi dlhým názvom, ktorý sa nezmestí '.repeat(4) }), link, { asked: -1000, payable: false, qr: false })
  check('a long reason and a long name are shortened so that the mailto: link stays within 1 800 characters', longHref.length <= 1800 && longHref.includes(encodeURIComponent(link)), String(longHref.length))
  const paidMsg = send.invoiceMessage(vatInv, seller(), link, { ...opts, payable: false, qr: false })
  check('a paid invoice is sent without the account to pay to', !paidMsg.body.includes('Úhrada prevodom') && !paidMsg.body.includes('QR'))
  const reminder = send.invoiceMessage(vatInv, seller(), link, { ...opts, asked: 61500, reminder: true })
  check(
    'a reminder asks for what is left after the credit notes, its due day, says it was not paid yet, and that it can be ignored if it was',
    reminder.subject === 'Pripomienka úhrady faktúry 20260001 od TEST-ONLY Nordia s. r. o.' &&
      reminder.body.includes('pripomíname Vám úhradu faktúry č. 20260001, po dobropise na sumu 615,00 €, so splatnosťou 9. novembra 2026. Platbu sme zatiaľ nedostali.') &&
      reminder.body.includes('Ak ste už zaplatili') &&
      reminder.short.startsWith('Pripomíname úhradu faktúry č. 20260001 na sumu 615,00 €'),
    reminder.body,
  )
  const creditMsg = send.invoiceMessage(longCredit, seller(), link, { asked: -1000, payable: false, qr: false })
  const advanceMsg = send.invoiceMessage(invoice({ kind: 'advance', number: '20260030', relatesNumber: 'ZF20260003', deliveredOn: '2026-10-20', totalCents: 100000 }), seller(), link, { asked: 100000, payable: false, qr: false })
  check(
    'a credit note is sent as one, its amount without the minus; an advance received thanks for the payment',
    creditMsg.subject.startsWith('Dobropis 20260099') && creditMsg.body.includes('dobropis č. 20260099 k faktúre č. 20260001 na sumu 10,00 €') && advanceMsg.body.includes('ďakujeme za platbu 1 000,00 € prijatú 20. októbra 2026 k zálohovej faktúre č. ZF20260003'),
  )
}
