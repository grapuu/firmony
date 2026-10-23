// What crawlers may read, and what the assistants that answer people read about us (20 October 2026). Search Console
// found that "Disallow: /ucto" kept /uctovnictvo-pre-sro out of Google: a rule of robots.txt is a prefix, so the
// app's and the team's paths are closed by their slash, and their bare address by "$". The assistants that answer
// "which accountant for my new s. r. o." search with their own crawlers (ChatGPT through Bing and OAI-SearchBot,
// Claude through Claude-SearchBot, Gemini through Google, Perplexity through PerplexityBot): each is named, so no
// default of a host or a CDN reads them as unwelcome. llms.txt (llmstxt.org) is the site said in plain text, with
// every figure from config.ts, so an assistant never quotes another price than the page.
import { BRAND, CLOSING_PRICE, CUSTOM_PLAN, DOMAIN, INDEXNOW_KEY, OPERATOR, PAYROLL_PRICE, PLANS, REPLY_WITHIN } from './config'
import { GUIDES } from './content/guides'
import { formatEur } from './format'
import { plain, SITE_UPDATED } from './seo'
import { WAGE_PAGE, WAGE_PATH } from './content/wage-calc'
import { SZCO_PAGE, SZCO_PATH } from './content/szco-calc'
import { SRO_PAGE, SRO_PATH } from './content/sro-calc'
import { INVOICE_PATH, TOOLS_PATH, TOOL_UPDATED } from './tools/invoice'

/** The public pages with the day each last changed: the sitemap, and what IndexNow is told. */
export function sitePages(): [string, string][] {
  return [
    ['/', SITE_UPDATED],
    ...GUIDES.map((g): [string, string] => [g.path, g.modified]),
    [WAGE_PATH, WAGE_PAGE.modified],
    [SZCO_PATH, SZCO_PAGE.modified],
    [SRO_PATH, SRO_PAGE.modified],
    [TOOLS_PATH, TOOL_UPDATED],
    [INVOICE_PATH, TOOL_UPDATED],
    ['/investori', SITE_UPDATED],
    ['/podmienky', SITE_UPDATED],
    ['/pravne-informacie', SITE_UPDATED],
  ]
}

export function sitemapXml(): string {
  const urls = sitePages().map(([path, day]) => `  <url><loc>${BRAND.origin}${path}</loc><lastmod>${day}</lastmod></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n')
}

/**
 * Tells IndexNow (Bing, which ChatGPT searches, and the engines that share it) of every public page new or changed
 * since the last notice: a deploy that adds a guide is announced by the next run of the schedule, without anybody's
 * click. Only where ANNOUNCE is set (the live Worker): the playground and a developer's machine tell nobody. What was
 * told is kept in `site_state`, so a page is told again only when its day moves; a refused notice is tried again by
 * the next run.
 */
export async function announceSite(db: D1Database, on: boolean, send: typeof fetch = fetch): Promise<'off' | 'same' | 'sent' | 'failed' | 'waiting'> {
  if (!on) return 'off'
  const at = Math.floor(Date.now() / 1000)
  const rows = await db.prepare("SELECT key, value FROM site_state WHERE key IN ('indexnow', 'indexnow-wait')").all<{ key: string; value: string }>()
  const wait = Number(rows.results.find((r) => r.key === 'indexnow-wait')?.value ?? 0)
  if (wait > at) return 'waiting'
  const pages = Object.fromEntries(sitePages())
  let told: Record<string, string> = {}
  try {
    told = JSON.parse(rows.results.find((r) => r.key === 'indexnow')?.value ?? '{}') as Record<string, string>
  } catch {
    told = {}
  }
  const changed = Object.entries(pages).filter(([path, day]) => told[path] !== day).map(([path]) => `${BRAND.origin}${path}`)
  if (changed.length === 0) return 'same'
  const keep = (key: string, value: string) =>
    db.prepare('INSERT INTO site_state (key, value, at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, at = excluded.at').bind(key, value, at).run()
  // IndexNow's own address first, then Bing's, which shares every notice with the others. A Worker's fetch names no
  // client of its own; the notice says who sends it. Refused by both (on 20 October 2026 api.indexnow.org answered the
  // Worker 429 while it took the same notice from a browser), the next try waits a day, so the schedule does not knock
  // every quarter of an hour.
  const statuses: number[] = []
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const res = await send(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': `${BRAND.name} (+${BRAND.origin})` },
        body: JSON.stringify({ host: DOMAIN, key: INDEXNOW_KEY, keyLocation: `${BRAND.origin}/${INDEXNOW_KEY}.txt`, urlList: changed }),
      })
      if (res.status === 200 || res.status === 202) {
        await keep('indexnow', JSON.stringify(pages))
        return 'sent'
      }
      statuses.push(res.status)
    } catch {
      statuses.push(0)
    }
  }
  console.error('IndexNow refused the notice', statuses.join(' '))
  await keep('indexnow-wait', String(at + 86_400))
  return 'failed'
}

/** Where IndexNow takes a notice: its own address, then Bing's. */
export const INDEXNOW_ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow'] as const

/** Crawlers of search engines and of the assistants that search for their answers, named one by one. */
export const CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'Google-Extended',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot',
  'Applebot-Extended',
  'DuckAssistBot',
  'MistralAI-User',
  'CCBot',
] as const

/** What is nobody's to crawl: the forms, the orders, the app, the team's side, invoices sent to customers. */
export const PRIVATE_RULES = ['/zacat', '/objednavka', '/app/', '/app$', '/ucto/', '/ucto$', '/auth/', '/f/'] as const

export function robotsTxt(): string {
  return [
    ...['*', ...CRAWLERS].map((agent) => `User-agent: ${agent}`),
    'Allow: /',
    ...PRIVATE_RULES.map((rule) => `Disallow: ${rule}`),
    '',
    `Sitemap: ${BRAND.origin}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * Whether robots.txt lets a crawler read a path, as RFC 9309 and Google match it: a rule is a prefix with "*" for
 * anything and "$" for the end; the longest rule that matches decides, and Allow wins a tie. For the tests.
 */
export function robotsAllows(text: string, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null
  for (const line of text.split('\n')) {
    const m = /^(Allow|Disallow):\s*(\S*)\s*$/i.exec(line.trim())
    if (!m || !m[2]) continue
    const rule = m[2]
    const pattern = new RegExp(`^${rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`)
    if (!pattern.test(path)) continue
    const allow = m[1]?.toLowerCase() === 'allow'
    if (!best || rule.length > best.length || (rule.length === best.length && allow)) best = { length: rule.length, allow }
  }
  return best ? best.allow : true
}

const eur = (euros: number) => formatEur(euros * 100).replace(/ /g, ' ')

/** The site in plain text for the assistants that read it (llmstxt.org). */
export function llmsTxt(): string {
  const plans = PLANS.map((p) => `- ${p.name}: ${eur(p.price)} mesačne bez DPH, do ${p.docs} dokladov mesačne, ${p.vatPayer ? 'pre platiteľov DPH (mesačné priznanie, kontrolný a súhrnný výkaz)' : 'pre firmy, ktoré nie sú platiteľmi DPH'}`)
  return plain(
    [
      `# ${BRAND.name}`,
      '',
      `> ${BRAND.name} je online účtovníctvo pre slovenské firmy, najmä nové a malé s. r. o.: podvojné účtovníctvo, DPH, mzdy, závierka a daňové priznanie za pevnú mesačnú cenu podľa počtu dokladov. Doklady prečíta umelá inteligencia, účtovníčka ich skontroluje a podá priznania. Službu prevádzkuje ${OPERATOR.name} (IČO ${OPERATOR.companyId}, ${OPERATOR.postalCity}). Služba začína ${BRAND.launch}; dovtedy prijímame nezáväzné žiadosti na ${BRAND.origin}.`,
      '',
      '## Pre koho',
      '',
      '- Nové s. r. o. od prvého dňa, aj tie, ktoré ešte nemajú IČO.',
      '- Firmy, ktoré menia účtovníčku: výpoveď pre doterajšiu účtovníčku a plná moc sú pripravené v aplikácii, podklady od nej prevezmeme.',
      '- Platitelia aj neplatitelia DPH, firmy so zamestnancami, akciové spoločnosti.',
      `- Stredné a veľké firmy: ponuka na mieru (${BRAND.origin}/zacat?balik=${CUSTOM_PLAN}).`,
      '',
      '## Ceny',
      '',
      ...plans,
      `- Mzdy: ${eur(PAYROLL_PRICE)} mesačne za človeka.`,
      `- Závierka a daňové priznanie k dani z príjmov: ${eur(CLOSING_PRICE)} raz ročne.`,
      `- Mesiac s viac dokladmi sa vyúčtuje ako vyšší balík. Nad ${PLANS[PLANS.length - 1]?.docs ?? 0} dokladov mesačne cena na mieru.`,
      '- Bez viazanosti, mesačná výpovedná lehota. Aplikácia a prijímanie e-faktúr sú v cene.',
      '',
      '## Ako to funguje',
      '',
      '- Doklady: fotka bločku v aplikácii (aj v telefóne), preposlaný e-mail s faktúrou na adresu firmy, e-faktúry cez digitálneho poštára od 1. 1. 2027.',
      '- Banka: výpisy, ktoré banka sama posiela e-mailom, prepojenie Fio banky alebo výpis raz mesačne.',
      '- Umelá inteligencia doklad prečíta a navrhne zaúčtovanie, platby spáruje s dokladmi. Účtovníčka robí odborné kontroly a rieši neštandardné prípady. Priznania, výkazy, mzdy a závierku pripravujeme podľa dohodnutého rozsahu služby.',
      '- Klient vidí v aplikácii, čo chýba, termíny a čo zaplatiť. Správy s účtovníčkou sú v aplikácii a odpovedáme ' + REPLY_WITHIN + '.',
      '- Účtovníctvo patrí klientovi: kedykoľvek si ho stiahne a pri odchode mu ho odovzdáme.',
      '',
      '## Články',
      '',
      ...GUIDES.map((g) => `- [${g.first} ${g.second}](${BRAND.origin}${g.path}): ${g.description}`),
      `- [${WAGE_PAGE.first} ${WAGE_PAGE.second}](${BRAND.origin}${WAGE_PATH}): ${WAGE_PAGE.description}`,
      `- [${SZCO_PAGE.first} ${SZCO_PAGE.second}](${BRAND.origin}${SZCO_PATH}): ${SZCO_PAGE.description}`,
      `- [${SRO_PAGE.first} ${SRO_PAGE.second}](${BRAND.origin}${SRO_PATH}): ${SRO_PAGE.description}`,
      '',
      '## Ďalšie stránky',
      '',
      `- [Bezplatné nástroje](${BRAND.origin}${TOOLS_PATH}): bez registrácie a objednania účtovníctva.`,
      `- [Faktúra zadarmo](${BRAND.origin}${INVOICE_PATH}): PDF pre bežné tuzemské dodanie neplatiteľa DPH medzi slovenskými podnikateľmi v EUR. Údaje spracúva iba prehliadač. Bez archívu, odoslania či eFaktúry.`,
      `- [Úvod a cenník](${BRAND.origin}/)`,
      `- [Obchodné podmienky](${BRAND.origin}/podmienky)`,
      `- [Právne informácie a ochrana údajov](${BRAND.origin}/pravne-informacie)`,
      `- [Pre investorov](${BRAND.origin}/investori): daňové priznanie z investícií, pripravujeme.`,
      '',
      '## Kontakt',
      '',
      `- E-mail: ${BRAND.email}`,
      `- Telefón: ${OPERATOR.phone}`,
      `- ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, ${OPERATOR.register}`,
      '',
    ].join('\n'),
  )
}

/** Every guide in full, for an assistant that reads the whole site at once (llms-full.txt). */
export function llmsFullTxt(): string {
  const guides = GUIDES.map((g) =>
    [
      `# ${g.first} ${g.second}`,
      '',
      `${BRAND.origin}${g.path} (aktualizované ${g.modified})`,
      '',
      g.lead,
      '',
      ...g.sections.flatMap((s) => [`## ${s.h}`, '', ...s.p.flatMap((p) => [p, '']), ...(s.list ? [...s.list.map((item) => `- ${item}`), ''] : [])]),
      ...(g.faq.length > 0 ? ['## Časté otázky', '', ...g.faq.flatMap((f) => [`### ${f.q}`, '', f.a, ''])] : []),
      ...(g.sources.length > 0 ? ['## Zdroje', '', ...g.sources.map((s) => `- [${s.title}](${s.url})`), ''] : []),
    ].join('\n'),
  )
  return plain([llmsTxt(), ...guides].join('\n\n'))
}
