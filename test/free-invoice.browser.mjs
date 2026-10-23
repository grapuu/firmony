import { readFile } from 'node:fs/promises'
import { check } from './check.mjs'

export async function checkFreeInvoiceBrowser({ browser, origin }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const page = await context.newPage()
  const requests = [], failures = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }))
  try {
    await page.goto(`${origin}/bezplatne-nastroje`)
    check('free invoice browser: all five public tools can be opened without an account', await page.locator('.free-tools__card').count() === 5 && await page.getByRole('link', {name:'Vytvoriť faktúru',exact:true}).count() === 1)
    await page.getByRole('link', {name:'Vytvoriť faktúru',exact:true}).click()
    await page.locator('[data-download]:enabled').waitFor()
    const start = requests.length
    await page.locator('[data-download]').click()
    check('free invoice browser: empty submission stays local and exposes actionable errors', await page.locator('#invoice-errors:visible a').count() > 4 && new URL(page.url()).search === '' && !requests.slice(start).some(r=>r.method==='POST'||r.type==='document'))
    const fill = (name, value) => page.locator(`[name="${name}"]`).fill(value)
    for (const [name,value] of Object.entries({
      'supplier.name':'TEST Dodávateľ s. r. o.', 'supplier.address':'Testovacia 1, 040 01 Košice', 'supplier.ico':'57442452', 'supplier.dic':'2123456789', 'supplier.registry':'TEST register, oddiel Sro, vložka TEST',
      'customer.name':'TEST Odberateľ <img src=x onerror=window.BAD=1>', 'customer.address':'Skúšobná 2, 811 01 Bratislava', 'customer.ico':'31333532',
      number:'TEST-2026/001', issued:'2026-10-22', supplied:'2026-10-22', due:'2026-11-05',
      'lines.0.description':'TEST konzultácia', 'lines.0.quantity':'1,5', 'lines.0.unit':'hod', 'lines.0.price':'10,01',
    })) await fill(name,value)
    await page.locator('[name=nonVat]').check(); await page.locator('[name=domestic]').check()
    check('free invoice browser: exact amount and literal user text appear in the preview and accessible local total', (await page.locator('.free-preview__total').textContent()).includes('15,02') && (await page.locator('[data-invoice-total][role=status]').textContent()).includes('15,02') && await page.locator('[data-invoice-preview] img').count() === 0 && await page.evaluate(()=>window.BAD) === undefined)
    await page.locator('[data-add-line]').click()
    await fill('lines.1.description','TEST druhá položka'); await fill('lines.1.quantity','3'); await fill('lines.1.price','0,10')
    check('free invoice browser: adding a line preserves the first item and updates the exact total', await page.locator('[name="lines.0.description"]').inputValue() === 'TEST konzultácia' && (await page.locator('.free-preview__total').textContent()).includes('15,32'))
    await page.getByRole('button',{name:'Odstrániť položku 2',exact:true}).click()
    check('free invoice browser: removal restores the total and keeps focus in the remaining item', (await page.locator('.free-preview__total').textContent()).includes('15,02') && await page.locator('[data-invoice-line]').count() === 1 && await page.locator('[name="lines.0.description"]').evaluate(e=>e===document.activeElement))
    await fill('lines.0.price','1,001')
    await page.locator('[data-download]').click()
    check('free invoice browser: excess money precision is refused without discarding fields', await page.locator('[name="lines.0.price"][aria-invalid=true]').count() === 1 && await page.locator('[name="supplier.name"]').inputValue() === 'TEST Dodávateľ s. r. o.')
    await fill('lines.0.price','10,01')
    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-download]').click()])
    const pdf = await readFile(await pdfDownload.path())
    check('free invoice browser: real local download has the PDF signature and the safe invoice filename', pdf.subarray(0,8).toString() === '%PDF-1.4' && pdfDownload.suggestedFilename() === 'faktura-TEST-2026_001.pdf' && await page.locator('#invoice-errors:visible').count() === 0)
    const [draftDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-save-draft]').click()])
    const draft = await readFile(await draftDownload.path())
    check('free invoice browser: a downloadable draft contains the entered data, with no server save', JSON.parse(draft).invoice.lines[0].price === '10,01' && JSON.parse(draft).format === 'firmony-invoice')
    // The styled picker retains a real keyboard-operable native file input.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-load-draft]').press('Enter')])
    await chooser.setFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{broken')})
    await page.getByText('Tento súbor sa nedá načítať.',{exact:false}).waitFor()
    check('free invoice browser: the keyboard picker opens and a rejected import leaves the existing draft intact', (await page.locator('[data-invoice-status]').textContent()).includes('zostali zachované') && await page.locator('[name=number]').inputValue() === 'TEST-2026/001')
    await page.locator('[data-load-draft]').setInputFiles({name:'invoice.json',mimeType:'application/json',buffer:draft})
    await page.getByText('Údaje sú načítané.',{exact:false}).waitFor()
    check('free invoice browser: restoring a draft requires the issuer to confirm its scope again', !(await page.locator('[name=nonVat]').isChecked()) && !(await page.locator('[name=domestic]').isChecked()) && await page.locator('[name="lines.0.price"]').inputValue() === '10,01')
    check('free invoice browser: typing, preview, import and export issue no API call, form navigation or external request', !requests.slice(start).some(r=>r.type==='fetch'||r.type==='xhr'||r.method==='POST'||r.type==='document'||!r.url.startsWith(origin)))
    check('free invoice browser: the tool creates no persistent browser record and raises no script error', await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0) && failures.length === 0, failures.join('; '))
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900})
      check(`free invoice browser: tool and all labels fit at ${width}px`, await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#free-invoice-form input,#free-invoice-form textarea')].every(e=>e.labels.length>0)))
      await page.screenshot({path:`.wrangler/screens/${width}-free-invoice-browser.png`,fullPage:true})
    }
  } finally { await context.close() }
}
