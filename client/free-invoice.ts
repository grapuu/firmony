// No fetch, analytics, browser storage or account: invoice data and the PDF stay in this tab until downloaded.
import { blankInvoice, checkInvoice, importInvoice, invoiceFileName, invoicePdf, MAX_ITEMS, type FreeInvoice, type InvoiceParty } from '../src/tools/invoice'
import { formatEurExact } from '../src/format'

const form = document.querySelector<HTMLFormElement>('#free-invoice-form')
const linesRoot = document.querySelector<HTMLElement>('[data-invoice-lines]')
const preview = document.querySelector<HTMLElement>('[data-invoice-preview]')
const status = document.querySelector<HTMLElement>('[data-invoice-status]')
const errors = document.querySelector<HTMLElement>('#invoice-errors')
const addLine = document.querySelector<HTMLButtonElement>('[data-add-line]')
const download = document.querySelector<HTMLButtonElement>('[data-download]')
const load = document.querySelector<HTMLInputElement>('[data-load-draft]')

if (form && linesRoot && preview && status && errors && addLine && download && load) {
  let draft = blankInvoice('')
  let dirty = false
  let attempted = false
  const text = (tag: string, value: string, className?: string): HTMLElement => {
    const element = document.createElement(tag)
    element.textContent = value
    if (className) element.className = className
    return element
  }
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null
  const value = (name: string) => field(name)?.value ?? ''
  const party = (side: string): InvoiceParty => ({ name: value(`${side}.name`), address: value(`${side}.address`), ico: value(`${side}.ico`), dic: value(`${side}.dic`), registry: value(`${side}.registry`) })
  const read = (): FreeInvoice => ({ supplier: party('supplier'), customer: party('customer'), number: value('number'), issued: value('issued'), supplied: value('supplied'), due: value('due'), iban: value('iban'), vs: value('vs'), note: value('note'),
    nonVat: (field('nonVat') as HTMLInputElement).checked, domestic: (field('domestic') as HTMLInputElement).checked,
    lines: [...linesRoot.querySelectorAll<HTMLElement>('[data-invoice-line]')].map((_, i) => ({ description: value(`lines.${i}.description`), quantity: value(`lines.${i}.quantity`), unit: value(`lines.${i}.unit`), price: value(`lines.${i}.price`) })) })

  const renderErrors = (focus: boolean) => {
    errors.replaceChildren()
    for (const control of form.querySelectorAll('[aria-invalid]')) control.removeAttribute('aria-invalid')
    const checked = checkInvoice(draft)
    errors.hidden = checked.errors.length === 0
    if (checked.errors.length === 0) return
    errors.append(text('p', 'Ešte skontrolujte tieto údaje:'))
    const list = document.createElement('ul')
    for (const error of checked.errors) {
      const control = field(error.field) ?? (error.field === 'lines' ? field('lines.0.description') : null)
      control?.setAttribute('aria-invalid', 'true')
      const item = document.createElement('li')
      const link = document.createElement('a')
      link.textContent = error.message
      link.href = `#${control?.id ?? 'free-invoice-form'}`
      link.addEventListener('click', (event) => { if (control) { event.preventDefault(); control.focus(); control.scrollIntoView({ block: 'center' }) } })
      item.append(link); list.append(item)
    }
    errors.append(list)
    if (focus) errors.focus()
  }

  const renderPreview = () => {
    const checked = checkInvoice(draft)
    preview.replaceChildren()
    preview.append(text('p', 'FAKTÚRA', 'free-preview__eyebrow'), text('h3', draft.number || 'Vaše číslo faktúry'))
    const parties = text('div', '', 'free-preview__parties')
    for (const [label, p] of [['Dodávateľ', draft.supplier], ['Odberateľ', draft.customer]] as const) {
      const box = text('div', '')
      box.append(text('small', label), text('strong', p.name || 'Obchodné meno'), text('p', p.address || 'Adresa'))
      if (p.ico) box.append(text('p', `IČO ${p.ico}`))
      if (p.dic) box.append(text('p', `DIČ ${p.dic}`))
      if (p.registry) box.append(text('p', p.registry))
      parties.append(box)
    }
    preview.append(parties, text('p', 'Dodávateľ nie je platiteľom DPH.', 'free-preview__muted'))
    for (const [label, day] of [['Vystavenie', draft.issued], ['Dodanie', draft.supplied], ['Splatnosť', draft.due]]) {
      preview.append(text('p', `${label}: ${day ? day.split('-').reverse().join('. ') : 'doplňte dátum'}`, 'free-preview__muted'))
    }
    const table = document.createElement('table')
    const caption = text('caption', 'Položky faktúry')
    table.append(caption)
    const head = document.createElement('thead'), headerRow = document.createElement('tr')
    for (const title of ['Popis a množstvo', 'Spolu']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; headerRow.append(th) }
    head.append(headerRow); table.append(head)
    const body = document.createElement('tbody')
    draft.lines.forEach((line, i) => {
      const tr = document.createElement('tr'), what = document.createElement('td'), amount = document.createElement('td')
      what.append(text('span', line.description || `Položka ${i + 1}`), text('small', `${line.quantity} ${line.unit} × ${line.price || '0'} EUR`))
      amount.textContent = checked.amounts[i] === null ? 'Doplňte cenu' : formatEurExact(checked.amounts[i]!)
      tr.append(what, amount); body.append(tr)
    })
    table.append(body); preview.append(table)
    const total = text('div', '', 'free-preview__total')
    total.append(text('span', 'Na úhradu'), text('strong', checked.total === null ? 'Doplňte položky' : formatEurExact(checked.total)))
    preview.append(total)
    if (draft.iban) preview.append(text('p', `IBAN: ${draft.iban}`, 'free-preview__muted'))
    if (draft.vs) preview.append(text('p', `Variabilný symbol: ${draft.vs}`, 'free-preview__muted'))
    if (draft.note) preview.append(text('p', draft.note, 'free-preview__muted'))
  }
  const refresh = () => { draft = read(); renderPreview(); if (attempted) renderErrors(false) }

  const renderLines = () => {
    linesRoot.replaceChildren()
    draft.lines.forEach((line, i) => {
      const row = document.createElement('div'); row.className = 'free-line'; row.dataset.invoiceLine = String(i)
      const heading = text('div', '', 'free-line__heading'); heading.append(text('strong', `Položka ${i + 1}`))
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Odstrániť'; remove.className = 'free-line__remove'; remove.disabled = draft.lines.length === 1; remove.setAttribute('aria-label', `Odstrániť položku ${i + 1}`)
      remove.addEventListener('click', () => {
        draft = read(); draft.lines.splice(i, 1); dirty = true; renderLines(); refresh()
        field(`lines.${Math.min(i, draft.lines.length - 1)}.description`)?.focus()
        status.textContent = 'Položka bola odstránená.'
      })
      heading.append(remove); row.append(heading)
      for (const [key, label, max] of [['description', 'Popis tovaru alebo služby', 240], ['quantity', 'Množstvo', 20], ['unit', 'Jednotka', 12], ['price', 'Cena za jednotku v EUR', 20]] as const) {
        const name = `lines.${i}.${key}`, input = document.createElement('input'), wrapper = document.createElement('label')
        wrapper.className = `free-field free-line__${key}`; wrapper.htmlFor = `invoice-${name}`
        input.id = `invoice-${name}`; input.name = name; input.value = line[key]; input.maxLength = max; input.autocomplete = 'off'
        input.inputMode = key === 'quantity' || key === 'price' ? 'decimal' : 'text'
        wrapper.append(text('span', label), input); row.append(wrapper)
      }
      linesRoot.append(row)
    })
    addLine.disabled = draft.lines.length >= MAX_ITEMS
  }
  const save = (bytes: BlobPart, mime: string, name: string) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime })), anchor = document.createElement('a')
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  form.addEventListener('input', () => { dirty = true; status.textContent = ''; refresh() })
  addLine.addEventListener('click', () => {
    draft = read()
    if (draft.lines.length >= MAX_ITEMS) return
    draft.lines.push({ description: '', quantity: '1', unit: 'ks', price: '' }); dirty = true; renderLines(); refresh()
    field(`lines.${draft.lines.length - 1}.description`)?.focus()
    status.textContent = 'Nová položka je pripravená.'
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault(); attempted = true; refresh()
    if (checkInvoice(draft).errors.length) { renderErrors(true); return }
    try {
      const bytes = invoicePdf(draft)
      if (!bytes) { status.textContent = 'PDF sa nepodarilo pripraviť. Skontrolujte údaje a skúste to znova.'; return }
      save(new Uint8Array(bytes).buffer, 'application/pdf', `${invoiceFileName(draft.number)}.pdf`)
      dirty = false
      status.textContent = 'PDF je pripravené na stiahnutie. Skontrolujte jeho uloženie v zariadení. Odberateľovi ho odošlete Vy.'
    } catch { status.textContent = 'PDF sa nepodarilo pripraviť. Údaje zostávajú na stránke. Skúste to znova alebo si stiahnite rozpracované údaje.' }
  })
  document.querySelector('[data-save-draft]')?.addEventListener('click', () => {
    refresh()
    try {
      save(JSON.stringify({ format: 'firmony-invoice', version: 1, invoice: draft }, null, 2), 'application/json', `${invoiceFileName(draft.number)}-udaje.json`)
      dirty = false; status.textContent = 'Údaje sú pripravené na stiahnutie ako súbor JSON. Nie je to faktúra. Súbor si chráňte, obsahuje vyplnené údaje.'
    } catch { status.textContent = 'Údaje sa nepodarilo pripraviť na stiahnutie. Na stránke zostávajú vyplnené.' }
  })
  load.addEventListener('change', async () => {
    const file = load.files?.[0]
    if (!file) return
    try {
      if (file.size > 200_000) throw new Error('size')
      const restored = importInvoice(JSON.parse(await file.text()))
      if (!restored) throw new Error('format')
      if (dirty && !window.confirm('Nahradiť vyplnené údaje údajmi zo súboru? Neuložené zmeny sa stratia.')) return
      draft = restored
      for (const [side, p] of [['supplier', draft.supplier], ['customer', draft.customer]] as const) for (const key of ['name', 'address', 'ico', 'dic', 'registry'] as const) { const control = field(`${side}.${key}`); if (control) control.value = p[key] }
      for (const name of ['number', 'issued', 'supplied', 'due', 'iban', 'vs', 'note'] as const) { const control = field(name); if (control) control.value = draft[name] }
      for (const name of ['nonVat', 'domestic']) (field(name) as HTMLInputElement).checked = false
      renderLines(); attempted = false; errors.hidden = true; dirty = false; refresh()
      status.textContent = 'Údaje sú načítané. Skontrolujte ich a pred PDF znova potvrďte rozsah faktúry.'
    } catch { status.textContent = 'Tento súbor sa nedá načítať. Vyberte súbor JSON stiahnutý z tohto nástroja, najviac 200 kB. Vaše údaje zostali zachované.' }
    finally { load.value = '' }
  })
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = '' } })
  // Enable submission only after all handlers exist. CSP also refuses all native form submissions on this page.
  draft = { ...read(), lines: blankInvoice('').lines }; renderLines(); refresh()
  for (const control of document.querySelectorAll<HTMLElement>('[data-js]')) control.hidden = false
  download.disabled = false
}
