// Analytics (26 October 2026): what a request keeps and how the dashboard counts, without a database.
export function checkAnalyticsUnits({ analytics: a, analyticsRecord: r, analyticsStore: s, security, check }) {
  const token = 'Ab3_' + 'xY9-'.repeat(9) + 'q1Z'
  check('analytics: a path loses its query, trailing slash and doubled slashes', a.normalisePath('/zacat?ico=12345678') === '/zacat' && a.normalisePath('/e-faktura-2027/') === '/e-faktura-2027' && a.normalisePath('//a//b/') === '/a/b' && a.normalisePath('/') === '/' && a.normalisePath('') === '/')
  check('analytics: keys, ids, e-mails and long numbers in a path are replaced', a.normalisePath(`/objednavka/${token}`) === '/objednavka/:token' && a.normalisePath('/f/abc') === '/f/:token' && a.normalisePath('/x/550e8400-e29b-41d4-a716-446655440000') === '/x/:id' && a.normalisePath('/x/123456') === '/x/:n' && a.normalisePath('/x/jan%40firma.sk') === '/x/:email' && a.normalisePath(`/x/${token}`) === '/x/:token' && a.normalisePath('/x/0123456789abcdef0123') === '/x/:id')
  check('analytics: our own addresses stay as they are, odd ones do not', a.normalisePath('/danove-priznanie-pravnickej-osoby') === '/danove-priznanie-pravnickej-osoby' && a.normalisePath('/mzdova-kalkulacka') === '/mzdova-kalkulacka' && a.normalisePath('/%C3%BAcet') === '/:x' && a.normalisePath('/%E0%A4%A') === '/:x' && a.normalisePath('/A<b>') === '/:x')
  const deep = a.normalisePath(`/${'abcdefghij/'.repeat(20)}`)
  check('analytics: a path keeps six segments and 120 characters at most', deep.split('/').length === 7 && deep.length <= 120 && a.normalisePath(`/${'a'.repeat(300)}`).length <= 120)

  const UA = {
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    androidTab: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    gpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
    claude: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
  }
  check('analytics: robots are told by family, an empty agent is a robot', a.botOf(UA.google) === 'google' && a.botOf(UA.gpt) === 'openai' && a.botOf(UA.claude) === 'anthropic' && a.botOf(UA.facebook) === 'preview' && a.botOf(UA.headless) === 'other' && a.botOf('curl/8.7.1') === 'other' && a.botOf('') === 'other' && a.botOf(undefined) === 'other')
  check('analytics: a person\'s browser is no robot', [UA.chrome, UA.mac, UA.iphone, UA.android, UA.androidTab, UA.ipad].every((ua) => a.botOf(ua) === null))
  check('analytics: phone, tablet or computer from the agent alone', a.deviceOf(UA.iphone) === 'phone' && a.deviceOf(UA.android) === 'phone' && a.deviceOf(UA.androidTab) === 'tablet' && a.deviceOf(UA.ipad) === 'tablet' && a.deviceOf(UA.chrome) === 'computer' && a.deviceOf(UA.mac) === 'computer' && a.deviceOf('') === 'computer')

  check('analytics: a referrer is its domain alone, without www or a link shim', a.referrerOf('https://www.google.com/search?q=firmony', 'firmony.io') === 'google.com' && a.referrerOf('https://l.facebook.com/l.php?u=https%3A%2F%2Ffirmony.io', 'firmony.io') === 'facebook.com' && a.referrerOf('android-app://com.google.android.gm/', 'firmony.io') === 'com.google.android.gm')
  check('analytics: our own site, a broken or odd referrer is none', a.referrerOf('https://firmony.io/cena-uctovnictva', 'firmony.io') === null && a.referrerOf('https://www.firmony.io/', 'firmony.io') === null && a.referrerOf('javascript:alert(1)', 'firmony.io') === null && a.referrerOf('not a url', 'firmony.io') === null && a.referrerOf('', 'firmony.io') === null && a.referrerOf(undefined, 'firmony.io') === null && a.referrerOf('http://localhost:8787/', 'firmony.io') === null)
  check('analytics: campaign tags are kept in one key, nothing else of the query', a.campaignOf(new URLSearchParams('utm_source=Facebook&utm_medium=cpc&utm_campaign=jesen&ico=12345678&gclid=abc')) === 'utm_source=facebook&utm_medium=cpc&utm_campaign=jesen' && a.campaignOf(new URLSearchParams('ref=jan')) === 'ref=jan' && a.campaignOf(new URLSearchParams('utm_source=%3Cscript%3E')) === null && a.campaignOf(new URLSearchParams('ico=1')) === null)
  check('analytics: a campaign key reads as source, medium and campaign', a.campaignName('utm_source=facebook&utm_medium=cpc&utm_campaign=jesen') === 'facebook / cpc / jesen' && a.campaignName('ref=jan') === 'ref jan')

  check('analytics: a time falls in its bucket', a.bucketOf(0) === 0 && a.bucketOf(24.9) === 0 && a.bucketOf(25) === 1 && a.bucketOf(99) === 2 && a.bucketOf(3199) === 7 && a.bucketOf(3200) === 8 && a.bucketOf(60000) === 8 && a.bucketOf(-5) === 0 && a.bucketOf(NaN) === 0 && a.BUCKET_COUNT === 9)
  const hist = (pairs) => Array.from({ length: 9 }, (_, i) => pairs[i] ?? 0)
  check('analytics: the median and p95 are read inside their bucket', a.percentile(hist({ 2: 10 }), 0.5) === 75 && a.percentile(hist({ 2: 10 }), 0.95) === 97.5 && a.percentile(hist({ 0: 4 }), 0.5) === 12.5)
  check('analytics: percentiles over several buckets', a.percentile(hist({ 0: 50, 4: 50 }), 0.5) === 25 && a.percentile(hist({ 0: 50, 4: 50 }), 0.95) === 380 && a.percentile(hist({ 1: 1, 3: 1, 5: 2 }), 1) === 800)
  check('analytics: the open last bucket says its lower bound, an empty histogram nothing', a.percentile(hist({ 8: 3 }), 0.5) === 3200 && a.percentile(hist({}), 0.5) === null && a.percentile([], 0.95) === null)
  check('analytics: times are said in ms or s', a.msText(84.6) === '85 ms' && a.msText(1240) === '1,2 s' && a.msText(3200) === '3,2 s a viac' && a.msText(null) === '')
  check('analytics: a share to one decimal place, none of nothing', a.shareOf(1, 3) === '33,3 %' && a.shareOf(2, 2) === '100,0 %' && a.shareOf(1, 0) === '')

  const flat = a.sparkPath([0, 0, 0], 100, 28)
  const spark = a.sparkPath([1, 4, 2], 100, 28)
  check('analytics: a sparkline of noughts lies on the bottom; the highest day reaches the top', flat.line === 'M0,26 L50,26 L100,26' && spark.line === 'M0,20 L50,2 L100,14' && spark.area.endsWith('L100,28 L0,28 Z') && a.sparkPath([5]).line.split(' ').length === 2 && a.sparkPath([]).line.startsWith('M0,'))
  check('analytics: the days of a period, both ends included', a.daysFrom('2026-10-24', '2026-10-26').join(',') === '2026-10-24,2026-10-25,2026-10-26' && a.daysFrom('2026-12-31', '2027-01-01').length === 2)
  check('analytics: a period is 7, 30 or 90 days', a.periodOf('7') === 7 && a.periodOf('90') === 90 && a.periodOf('x') === 30 && a.periodOf(undefined) === 30 && a.periodOf('1000') === 30)
  check('analytics: a person\'s rows are kept 13 months to the day', a.usageCutoff('2026-10-26') === '2025-09-26' && a.usageCutoff('2027-03-31') === '2026-02-28' && a.usageCutoff('2026-01-15') === '2024-12-15' && a.USAGE_MONTHS === 13)

  check('analytics: the side of the app by its address', a.sideOf('/app') === 'client' && a.sideOf('/app/faktury') === 'client' && a.sideOf('/ucto/klienti/x') === 'team' && a.sideOf('/application') === null && a.sideOf('/') === null && a.sideOf('/auth') === null)
  check('analytics: a route is a pattern of ours or "(iné)"', a.routeKey('/app/faktury/:id') === '/app/faktury/:id' && a.routeKey('/ucto/*') === '/ucto/*' && a.routeKey('') === '(iné)' && a.routeKey(undefined) === '(iné)' && a.routeKey('/app/<x>') === '(iné)')
  check('analytics: the client\'s features by route', a.featureOf('client', '/app') === 'prehlad' && a.featureOf('client', '/app/faktury/:id/poslat') === 'faktury' && a.featureOf('client', '/app/subory/:id') === 'doklady' && a.featureOf('client', '/app/trzby') === 'pokladna' && a.featureOf('client', '/app/mzdove-podania/:id') === 'mzdy' && a.featureOf('client', '/app/*') === 'ine' && a.featureOf('client', '/app/prihlasenie') === null && a.featureOf('client', '/app/vstup') === null)
  check('analytics: the team\'s parts by route', a.featureOf('team', '/ucto') === 'klienti' && a.featureOf('team', '/ucto/klienti/novy') === 'klienti' && a.featureOf('team', '/ucto/klienti/:id') === 'klient' && a.featureOf('team', '/ucto/klienti/:id/dph/koeficient') === 'dph' && a.featureOf('team', '/ucto/klienti/:companyId/mzdove-podania/:id') === 'mzdy' && a.featureOf('team', '/ucto/ai/asistent') === 'ai' && a.featureOf('team', '/ucto/*') === 'ine' && a.featureOf('team', '/ucto/ukazka') === null)
  check('analytics: every client feature has a Slovak name', ['prehlad', 'faktury', 'doklady', 'platby', 'banka', 'spravy', 'asistent', 'pokladna', 'cesty', 'dane', 'mzdy', 'uhrady', 'strediska', 'firma', 'prechod', 'export', 'ine'].every((f) => a.featureName('client', f) !== f) && a.featureName('team', 'neznama') === 'neznama')

  const req = (over = {}) => ({ method: 'GET', status: 200, contentType: 'text/html; charset=UTF-8', url: new URL('https://firmony.io/cena-uctovnictva?utm_source=fb&utm_campaign=jesen'), userAgent: UA.iphone, referer: 'https://www.google.sk/', cookie: '', purpose: '', ...over })
  const counted = r.siteCounters(req())
  check('analytics: a page view counts its path, device, referrer and campaign', JSON.stringify(counted) === JSON.stringify([['path', '/cena-uctovnictva'], ['device', 'phone'], ['referrer', 'google.sk'], ['campaign', 'utm_source=fb&utm_campaign=jesen']]), JSON.stringify(counted))
  check('analytics: a robot, a signed-in browser, a page not found and a failure are counted apart', JSON.stringify(r.siteCounters(req({ userAgent: UA.google }))) === '[["bot","google"]]' && JSON.stringify(r.siteCounters(req({ cookie: 'a=1; __Host-firmony=abc' }))) === '[["internal","signed-in"]]' && JSON.stringify(r.siteCounters(req({ status: 404 }))) === '[["path","(404)"]]' && JSON.stringify(r.siteCounters(req({ status: 500, method: 'POST', contentType: 'text/plain' }))) === '[["error","/cena-uctovnictva"]]')
  check('analytics: no page view of a form sent, a file, a redirect or a prefetch', r.siteCounters(req({ method: 'POST' })).length === 0 && r.siteCounters(req({ contentType: 'text/css' })).length === 0 && r.siteCounters(req({ status: 303 })).length === 0 && r.siteCounters(req({ purpose: 'prefetch' })).length === 0 && r.siteCounters(req({ method: 'HEAD' })).length === 0)
  check('analytics: an invoice or a contract opened by its key is counted by its path alone, never the key', JSON.stringify(r.siteCounters(req({ url: new URL(`https://firmony.io/f/${token}`) }))) === '[["path","/f/:token"]]' && JSON.stringify(r.siteCounters(req({ url: new URL(`https://firmony.io/objednavka/${token}`) }))) === '[["path","/objednavka/:token"]]')

  const client = (over) => ({ id: 'x', name: 'X', ico: null, plan: 'start', accountantId: null, accountant: null, contractAt: null, lastActive: null, active30: 0, documents: 0, invoices: 0, assistant: 0, aml: 'checked', ...over })
  const list = [client({ id: 'a', name: 'Beta', lastActive: 100, documents: 5, aml: 'waiting' }), client({ id: 'b', name: 'alfa', lastActive: null, documents: 9, aml: 'missing' }), client({ id: 'c', name: 'Gama', lastActive: 300, documents: 5 })]
  check('analytics: the clients sort by name, activity, documents and AML', s.sortClients(list, 'nazov').map((c) => c.id).join('') === 'bac' && s.sortClients(list, 'aktivita').map((c) => c.id).join('') === 'cab' && s.sortClients(list, 'doklady').map((c) => c.id).join('') === 'bac' && s.sortClients(list, 'aml').map((c) => c.id).join('') === 'bac' && s.clientSortOf('zle') === 'nazov' && s.clientSortOf('faktury') === 'faktury')
  const route = (over) => ({ side: 'client', method: 'GET', route: '/app', n: 10, s2: 10, s3: 0, s4: 0, s5: 0, ms: 0, hist: [], p50: 10, p95: 20, ...over })
  const speed = s.speedOf([route({ route: '/a', p95: 900 }), route({ route: '/b', p95: 1900, n: 2 }), route({ route: '/c', p95: 300, s5: 1 }), route({ route: '/d', p95: 50, s4: 4 })])
  check('analytics: the slowest routes need a few requests; failing ones list server errors first', speed.slow.map((x) => x.route).join(',') === '/a,/c,/d' && speed.failing.map((x) => x.route).join(',') === '/c,/d')

  check('analytics: a sign-up\'s kept campaign tags read as the same key', a.campaignFromSource('{"utm_source":"TikTok","utm_campaign":"jesen","x":"y"}') === 'utm_source=tiktok&utm_campaign=jesen' && a.campaignFromSource({ ref: 'jan' }) === 'ref=jan' && a.campaignFromSource('nie json') === null && a.campaignFromSource(null) === null && a.campaignFromSource('[1]') === null && a.campaignFromSource('{}') === null)
  check('analytics: tokens priced at claude-haiku-5-5 as read on 26 October 2026', a.HAIKU_PRICE.model === 'claude-haiku-5-5' && a.HAIKU_PRICE.read === '2026-10-26' && Math.abs(a.costUsd(1_000_000, 0) - 0.1) < 1e-12 && Math.abs(a.costUsd(0, 1_000_000) - 0.5) < 1e-12 && Math.abs(a.costUsd(2100, 400) - 0.00041) < 1e-12 && a.costUsd(-5, NaN) === 0)
  check('analytics: dollars are written the Slovak way', a.usdText(0.00041) === '0,0004 USD' && a.usdText(1.256) === '1,26 USD' && a.usdText(0) === '0,0000 USD')
  check('analytics: its downloads need a fresh confirmation, the page itself the team\'s', security.sensitivePath('/ucto/analytika/export.json', 'GET') && security.sensitivePath('/ucto/analytika/export.csv', 'GET') && !security.sensitivePath('/ucto/analytika', 'GET'))
}
