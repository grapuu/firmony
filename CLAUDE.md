# Firmony: working notes

Accounting for young Slovak companies (s. r. o.), run by europio s. r. o. (the owner's company; no new s. r. o.,
his word of 12 October 2026). AI does the routine, a freelance accountant checks and files, one fixed monthly
price. The service starts on 1 January 2027; until then the site collects non-binding requests.
The owner does not use a terminal: everything has to work by pushing to `main`, and anything he must do himself
is a few clicks in a dashboard. He writes Slovak, often dictated, reads little: verdict first, short.

## Where things stand (written on the night of 12 to 13 October 2026, brought up to date at 00:30)

- Built in one evening, at his word "pracuj na maximum": the brand and the website as the company's presentation
  ("najprv brand, naša web stránka, prezentácia ... niečo, čo rozbije konkurenciu"). Software for the accountants
  comes after it.
- Name: **Firmony** (firma + harmony), chosen by the builder on his "zhodnoť ty". firmony.ai and firmony.app were
  free at Websupport on 12 October 2026 (.ai 193,80 € for the first two years, then 96,90 € a year; .app 21,90 €
  a year); firmony.com is taken; a web search found no business of that name. He wanted .ai, .io, .com or .app and
  nothing Slovak-sounding ("nie účtik alebo účtovník a bodka sk").
- The domain, his word at 23:43: "Tak drahú doménu kupovať nebudeme. Maximálne to .io pretože to je lacnejšie"
  (he had read the .ai price as 20 € a month). firmony.io was free at Websupport that night at 69,90 € a year;
  .app is 21,90 €. **Not chosen and not bought**: buying is his. Until he names it, `BRAND.origin`, `BRAND.email`
  and `MAIL.from` say firmony.ai; when he does, those three change, and so do the test's `site`, the notes'
  firmony.ai, and `wrangler.jsonc` once a route is added.
- Nothing is deployed. There is no GitHub repository and no Worker yet. The code is committed locally on `main`.
- All checks pass: `npm test` (47 unit checks) and `npm run test:runtime` (53 checks in workerd).

## What he has to do before it is live (each a few clicks)

1. Buy firmony.ai (Websupport or any registrar), add the domain to Cloudflare (free plan), point the registrar's
   nameservers to Cloudflare.
2. GitHub: an empty private repository `firmony` under his account. Then the builder adds it to the session
   (`add_repo`, access "push") and pushes.
3. Cloudflare, D1: a database named `firmony`, location **EU jurisdiction**; its ID goes into `wrangler.jsonc`
   (the zeros there are a placeholder, so a deploy fails instead of creating a database outside the EU; the
   privacy notice says the database is in the EU).
4. Cloudflare, Workers & Pages, Create, Import a repository: `firmony`, production branch `main`. It is then live
   at its workers.dev address (which answers `noindex`). With the domain in the account: a route
   `{ "pattern": "firmony.ai", "custom_domain": true }` (and www) in `wrangler.jsonc`.
5. Email: Cloudflare Email Routing for firmony.ai, `ahoj@firmony.ai` forwarded to his mailbox; Email Service,
   firmony.ai onboarded for sending. Until then requests are kept and their emails wait in the outbox (retried
   every fifteen minutes, ten times).
6. Before the page is public: at least one accountant agreed (his to-do list of 12 October: call 3 to 5 freelance
   accountants to confirm 25/40/70 € a client), the trade licence "vedenie účtovníctva" added to europio, liability
   insurance, and a digital postman (Qvalia was the lead: ask for its per-client API price).

## Product decisions

His (12 October 2026):
- Plans per month without VAT: Štart 69 €, Rast 129 €, Firma 249 €. Annual closing and the corporate tax return:
  149 € a year. Freelance accountants are paid 25, 40 and 70 € a client a month; nobody employed, no profit
  shared with an accounting office.
- Ads in young media and his own content; the brand is to "embrace" stressed young founders: "chceme ich objať
  a prijať, pomôžeme im, postaráme sa im o všetko a s nami môžu rásť".
- Inspired by Pennylane, Dougs, inFakt, Bench and the Slovak CloudTalk. He asked to copy their designs and texts
  and translate them; that was not done (copyright, and a clone), and he was told so in one sentence. Their
  structure and arguments were taken: Dougs' clear prices and reassurance, inFakt's two ways in (founding or
  switching), Bench's "no judgment" about messy books, Pennylane's e-invoicing banner, CloudTalk's parallel of
  AI and human and its plain FAQ.

The builder's proposals, shown on the site and his to change (in `PLANS`, `CLOSING_PRICE`, `REPLY_WITHIN`, copy):
- Limits: Štart up to 30 documents, no payroll, not a VAT payer (§ 7a returns included); Rast up to 80 documents,
  payroll for 2, VAT payer; Firma up to 200 documents, payroll for 5. More: an offer made to measure.
- No fee for documents above the limit; two months above it and a larger plan is offered.
- No lock-in: one month's notice. Answers within one working day.
- Prices "bez DPH" with the sentence that VAT is not added while the company is not a VAT payer (europio is
  registered under § 7a only; crossing 50 000 € turnover makes it a payer, about June 2027 in the plan).
- The founder's note on the home page is written in his name and has to be read by him.

## The economics (the evening of 12 October 2026, scratch model; base case)

ARPU 105 €, variable cost 41,83 € (accountant 34, tech 6, payment fee 1,83), contribution 63,17 € (60 %).
CAC 250 €, churn 1,5 % a month, LTV over 36 months 1 767 €, payback 4 months. Deepest cash point about −8 600 €
(February 2027); first profitable month March 2027. Kill rule at the end of April 2027: CAC above 400 €, churn
above 2,5 % or accountant cost above 40 € a client.

## The law it leans on (read 12 October 2026)

- From 1 January 2027 every legal person and every taxable entrepreneur must be able to receive e-invoices through
  a certified delivery provider ("digitálny poštár"); VAT payers must also issue them for domestic supplies.
  § 85o of the VAT Act, inserted by Act No. 385/2025 Z. z. (pravnenoviny.sk, 25 August 2026; podnikajte.sk).
- Bookkeeping is a free trade (voľná živnosť); tax returns may be prepared without giving tax advice.
- The Register of Legal Entities (api.statistics.sk/rpo/v1/search?identifier=) is public under CC BY 4.0: the
  page that shows its data names the source.

## How it is built

- One Cloudflare Worker: Hono with hono/jsx, pages rendered on the server, **no script at all** (CSP
  `script-src 'none'`), no inline styles. D1 (`DB`) for requests, the outbox and the counters; Cloudflare's email
  binding (`EMAIL`). Static files in `public/` (stylesheet, fonts).
- `src/config.ts` holds every fact: brand, company, plans, limits, retention, pictures (`ART`, empty until he
  makes them). `src/copy.ts` holds every text, typeset once (`src/format.ts`: a one-letter word never ends a
  line, a number stays with its unit, "s. r. o.", "§ 7a", dates).
- Pages: `/` (hero with the receipt, the pains, how it works, AI and the accountant, what is included,
  e-invoices, prices, the comparison, two ways in, the founder's note, questions, the closing form),
  `/zacat` (the IČO, then the details; `?balik=`, `?nova=1`), `/zacat/hotovo`, `/pravne-informacie` (company,
  privacy, cookies), robots, sitemap, `/healthz`.
- The comparison is a GET form (`mesacne`, `za-doklad`, `doklady`, `zavierka`, `dph`, `ludia`) computed on the
  server in cents (`src/calc.ts`); before anything is typed it shows a worked example (60 € a month, 25
  documents at 5,20 €, closing 160 €: 2 440 € against 977 €).
- The request: the IČO is looked up in the register (`src/rpo.ts`, four seconds at most, 30 lookups an hour per
  connection); on sending, the register is asked again and its name is what is kept and mailed, never a name the
  form carried. A confirmation repeats nothing a stranger could type (spam through our form), at most two a day
  per address. Six requests an hour per connection (an IPv6 address counts by its /64). A hidden field catches
  bots. Campaign tags (utm_*, ref) travel with the forms and are kept with the request.
- The schedule (every 15 minutes) sends the outbox and deletes what the privacy notice promises: requests after
  365 days, sent email after 90, counters after 2 days.
- Headers: CSP without anything inline or foreign, no framing, HSTS, `noindex` on `/zacat` and on any host but
  firmony.ai; http and www are redirected; a form is accepted only from our own pages and under 8 kB.

## Design (the third one, built on the night of 12 to 13 October 2026)

History: the first design (plum, mist, coral, Literata) he called "odporná ... jak z Wordu"; the second (black,
glass, Host Grotesk bold) "stále vyzerá tuctovo a obyčajne a toto musí byť naša pýcha a elita" (13 October,
00:31), the night he sent his pictures. He gave no more direction than that: the third is the builder's call.

- His benchmark is Robinhood's typography (memory). Robinhood sets a serif display (Martina Plantijn) at
  weight 400 and its headings in a sans at 400; nothing heavy. So: **Instrument Serif** (400 and italic,
  OFL, self-hosted latin and latin-ext; every Slovak letter checked) for everything read as a statement:
  the hero, every section title, prices, the savings figure, the founder's quote, the tile and step titles.
  **Host Grotesk** for text, labels, buttons. Never bold serif, no capitals for labels, no monospace.
  A specimen of eleven faces on black was compared that night (scratch); Newsreader was the runner-up.
- Black `#000` page. Light: azure `#4f7cff`, violet `#7c5cff`, pink `#ff7ab6` (`--grad`), the colours of his
  pictures: on "Vy rastite." (italic, the second line of the hero), the step numbers, the savings figure,
  the border of the lead plan and the e-invoice panel, and as glows. Panels are near-black with a lit edge
  (`--edge`: a hairline that catches light at the top). Text `#c2bdd4`, small print `#8f8aa6`.
- Every section is built around one of his objects (`ART` in src/config.ts; sources in `art-src/`):
  the hero: his phone above the paper receipt, its beam landing on the receipt's edge (the phone picture is
  cut at 66 % of its height and faded from 55 %, so its own glass paper is gone: `scripts/art.py whole`),
  his aurora full-bleed behind it (dimmed behind the words by a mask), and three chips;
  "nie ste jediní": the embrace; "Ako to funguje": door, bundle, bank link, shield, one per step;
  AI and the accountant: the orb between the two lists; the bento: receipt, calendar, chart, chat;
  e-invoices: the envelope rising out of its panel; the comparison: the calculator on the panel's edge;
  the two ways in: sprout (founding) and key (switching); the closing scene: the F over the aurora again.
  The F is the logo (header, footer, favicon, icons, the picture a shared link shows). Not made yet: his
  photo for the founder's note (`founder`), and the photos of people from the prompts.
- Motion, CSS only: the receipt is printed when the page opens and the chips arrive; the objects breathe
  (`.drift`, 9 s); the aurora drifts (28 s); and on a wide screen, where the browser can tie an animation
  to scrolling (`animation-timeline: view()` with `timeline-scope`; Chrome, Edge), the pictures of the four
  steps stand still beside them and change step by step while the step being read lights up. Elsewhere
  each step shows its own picture. Reduced motion: nothing moves, the steps' pictures only fade.
- Checked at 1440, 390 and 320 px: nothing scrolls sideways. `scripts/dev/look.mjs` scrolls through a page
  first, so that pictures that load late are in its full-page shots; `scripts/dev/scroll.mjs` takes one
  screen at a time at given scroll positions, which is how the steps are seen as they really are.
- When he sends a picture: `python3 scripts/art.py picture <source> <name> --size 960 --small 480 --cover
  0.92` (finds the object, centres it, makes the black see-through), then its slot in `ART`. `npm test`
  fails when a picture or a font the pages name is missing.

## Before pushing

```
npm run check            # TypeScript
npm test                 # unit checks
npm run test:runtime     # the deployable bundle in workerd: pages, headers, the request end to end, the schedule
node --no-warnings scripts/playground.mjs          # http://127.0.0.1:8787 with pretend register and email
node scripts/dev/look.mjs <folder> [paths]          # screenshots at three widths, says what overflows
```

In the playground IČO 57442452 is found (europio), 35757442 makes the register fail, anything else is unknown;
`/playground/mail` shows what was "sent". To stop it: `pkill -f "node --no-warnings [s]cripts/playground"` in a
command of its own (a command line that contains the start command is killed by the same pattern).
