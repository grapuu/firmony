import {check} from './check.mjs'

/** Real app forms, real verified browser sessions, local deterministic provider. No network AI or sent mail. */
export async function checkAssistantBrowser({page,clientPage,db,origin,provider}){
  const company='browser-overview-co',at=Math.floor(Date.now()/1000)
  await db.prepare("UPDATE sessions SET verified_at=? WHERE user_id='browser-admin' AND credential_id IS NOT NULL").bind(at).run()
  await db.prepare("INSERT INTO documents(id,company_id,created_at,source,status,number,file_name) VALUES('assistant-browser-doc',?,?,'upload','reading','TEST-BROWSER-ASISTENT','TEST-BROWSER.pdf')").bind(company,at).run()
  await clientPage.goto(`${origin}/app/spravy`)
  await clientPage.getByRole('link',{name:'Spýtať sa asistenta na stav firmy',exact:true}).click()
  await clientPage.locator('form[data-assistant-form]').waitFor({state:'visible'})
  check('assistant browser: the existing messages view opens the scoped assistant with labelled controls',await clientPage.locator('form[data-assistant-form] textarea,form[data-assistant-form] select').evaluateAll(es=>es.every(e=>e.labels?.length>0))&&await clientPage.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size}))
  const beforeQuick=provider.requests.length
  await clientPage.getByRole('link',{name:'Čo sa deje s dokladom?',exact:true}).click()
  await clientPage.locator('[data-assistant-answer]').waitFor({state:'visible'})
  check('assistant browser: quick questions work without any cloud invocation',provider.requests.length===beforeQuick&&await clientPage.locator('[data-assistant-answer]').getByText('Vyberte konkrétny doklad vo formulári.',{exact:false}).isVisible())
  await clientPage.getByLabel('Vaša otázka',{exact:true}).fill('TEST-BROWSER Čo sa deje s vybraným dokladom?')
  await clientPage.getByLabel('Doklad, ak sa ho otázka týka',{exact:true}).selectOption('assistant-browser-doc')
  provider.next={topic:'document'}
  const answerResponse=clientPage.waitForResponse(r=>new URL(r.url()).pathname==='/app/asistent'&&r.request().method()==='POST')
  await clientPage.getByRole('button',{name:'Opýtať sa AI',exact:true}).click()
  check('assistant browser: a natural question receives the real document state and its own source',(await answerResponse).status()===200&&await clientPage.locator('[data-assistant-answer]').getByText('Doklad je prijatý a prebieha jeho čítanie.',{exact:false}).isVisible()&&await clientPage.locator('[data-assistant-answer] a').first().getAttribute('href')==='/app/doklady/assistant-browser-doc')
  check('assistant browser: the server sends only the typed text to the provider',provider.requests.length===beforeQuick+1&&provider.requests.at(-1).messages[0].content==='TEST-BROWSER Čo sa deje s vybraným dokladom?'&&!JSON.stringify(provider.requests.at(-1)).includes('assistant-browser-doc'))
  for(const width of [320,390,1440]){
    await clientPage.setViewportSize({width,height:900})
    check(`assistant browser: the client question, answer and source fit ${width}px`,await clientPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await clientPage.locator('[data-assistant-answer] a').first().isVisible())
    await clientPage.screenshot({path:`.wrangler/screens/${width}-assistant-browser.png`,fullPage:true})
  }
  // The secondary button submits the live textarea and document selector, not a stale hidden copy.
  const exactQuestion='TEST-BROWSER Nová odborná otázka bez AI <script>window.assistantInjected=1</script>'
  await clientPage.getByLabel('Vaša otázka',{exact:true}).fill(exactQuestion)
  const beforeMessages=(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=?').bind(company).first()).n
  await clientPage.getByRole('button',{name:'Pripraviť otázku účtovníčke',exact:true}).click()
  await clientPage.locator('form[action="/app/spravy"] textarea[name=sprava]').waitFor({state:'visible'})
  const draft=await clientPage.locator('textarea[name=sprava]').inputValue()
  check('assistant browser: expert escalation preserves the latest text and selected document without a paid call or a sent message',draft.includes(exactQuestion)&&draft.includes('/app/doklady/assistant-browser-doc')&&provider.requests.length===beforeQuick+1&&(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=?').bind(company).first()).n===beforeMessages)
  check('assistant browser: question markup is escaped and cannot execute',await clientPage.evaluate(()=>window.assistantInjected===undefined))
  const sendResponse=clientPage.waitForResponse(r=>new URL(r.url()).pathname==='/app/spravy'&&r.request().method()==='POST')
  await clientPage.locator('form[action="/app/spravy"] button[type=submit]').click()
  check('assistant browser: the existing composer sends only after the explicit final click',(await sendResponse).status()===303&&(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=?').bind(company).first()).n===beforeMessages+1)
  await clientPage.goto(`${origin}/app/asistent`)
  provider.next={status:429}
  await clientPage.getByLabel('Vaša otázka',{exact:true}).fill('TEST-BROWSER Zachovajte túto otázku pri výpadku.')
  const errorResponse=clientPage.waitForResponse(r=>new URL(r.url()).pathname==='/app/asistent'&&r.request().method()==='POST')
  await clientPage.getByRole('button',{name:'Opýtať sa AI',exact:true}).click()
  check('assistant browser: an unavailable provider preserves the editable question and the human path',(await errorResponse).status()===503&&await clientPage.getByLabel('Vaša otázka',{exact:true}).inputValue()==='TEST-BROWSER Zachovajte túto otázku pri výpadku.'&&await clientPage.getByRole('button',{name:'Pripraviť otázku účtovníčke',exact:true}).isEnabled()&&await clientPage.locator('[data-assistant-answer]').count()===0)
  await page.goto(`${origin}/ucto/klienti/${company}/asistent?tema=overview`)
  check('assistant browser: the assigned accountant uses the same source-backed view with no client escalation button',await page.locator('[data-assistant-answer]').isVisible()&&await page.getByRole('button',{name:'Pripraviť otázku účtovníčke',exact:true}).count()===0)
  await page.goto(`${origin}/ucto/ai/asistent`)
  const controlResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/ucto/ai/asistent'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Vypnúť cloudové otázky',exact:true}).click()
  check('assistant browser: the verified administrator can stop paid questions',(await controlResponse).status()===303&&(await db.prepare('SELECT enabled FROM assistant_control WHERE id=1').first()).enabled===0)
  await clientPage.goto(`${origin}/app/asistent`)
  check('assistant browser: disabled AI keeps the unblocked expert and quick-question paths',await clientPage.getByRole('button',{name:'Opýtať sa AI',exact:true}).isDisabled()&&await clientPage.getByRole('button',{name:'Pripraviť otázku účtovníčke',exact:true}).isEnabled())
  await page.getByRole('button',{name:'Zapnúť cloudové otázky',exact:true}).click()
}
