# Firmony: working notes

Accounting for young Slovak companies (s. r. o.), run by europio s. r. o. (the owner's company; no new s. r. o.,
his word of 12 October 2026). AI does the routine, a freelance accountant checks and files, one fixed monthly
price. The service starts on 1 January 2027; until then the site collects non-binding requests.
The owner does not use a terminal: everything has to work by pushing to `main`, and anything he must do himself
is a few clicks in a dashboard. He writes Slovak, often dictated, reads little: verdict first, short.

## Where things stand (written on the night of 12 to 13 October 2026, brought up to date on 13 October at 19:00)

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
- Nothing is deployed. The code is on GitHub, `grapuu/firmony` (private), created on 13 October 2026 at 16:20
  from the browser pane of his desktop app, which he signed in to GitHub (account grapuu) for it; `main` is pushed.
  A new session adds the repository with `add_repo` (owner grapuu, access "push"). There is no Worker yet.
- All checks pass: `npm test` (134 unit checks) and `npm run test:runtime` (170 checks in workerd). The sixth
  design is committed (13 October 2026, from 15:07): white, blue and red, built as CloudTalk builds its site.
- **The client's app, first version** (13 October 2026, from 16:44, his word: "môže začať stavať software ...
  doslova okopíruj ten model ... aby ten človek z toho nemal strach ... také interaktívne, také moderné, jak web
  stránka. A hlavne ten systém musí fungovať logicky a dokonale"). Built under `/app`, pushed (`90032d6`), not
  deployed. What it is and how it works: "The client's app" below. A clickable copy with the sample company is the
  artifact "Firmony aplikácia" (https://claude.ai/artifact/RiaH2Z4AzYHCM2EQw7EPhc), sent to him at about 17:20 with
  what to click.
- **The whole structure, from 17:48** (his word: "Nič som nechcel dopísať. Potrebujem, aby sme to nejak dokončili
  a ešte raz musíš okopírovať tú štruktúru a to, čo ľudia milujú ... a dorob to celé, nech to už vytvorí štruktúru
  a vieme postupovať ďalej"). He was sent four steps with a time for each, and a message after each:
  1. The accountants' side and his administration (about 20:00): **done at about 19:00**, "The accountants'
     side" below; the artifact (version 3) has both sides, the bar at its bottom switches between them.
  2. For the client (about 21:30): documents forwarded by email, reminders by email, first steps after signing
     in, the company's settings, inviting a partner, the app on the phone's home screen.
  3. Issuing invoices, also as e-invoices, marked paid by themselves when the payment comes (about 23:00).
  4. The bank by open banking (Enable Banking), switched on by his registration (about midnight).

## What he has to do before it is live (each a few clicks)

1. Buy firmony.ai (Websupport or any registrar), add the domain to Cloudflare (free plan), point the registrar's
   nameservers to Cloudflare.
2. GitHub: done on 13 October 2026 (`grapuu/firmony`, private, `main` pushed).
3. Cloudflare, D1: a database named `firmony`, location **EU jurisdiction**; its ID goes into `wrangler.jsonc`
   (the zeros there are a placeholder, so a deploy fails instead of creating a database outside the EU; the
   privacy notice says the database is in the EU).
4. Cloudflare, Workers & Pages, Create, Import a repository: `firmony`, production branch `main`. It is then live
   at its workers.dev address (which answers `noindex`). With the domain in the account: a route
   `{ "pattern": "firmony.ai", "custom_domain": true }` (and www) in `wrangler.jsonc`.
5. Email: Cloudflare Email Routing for firmony.ai, `ahoj@firmony.ai` forwarded to his mailbox; Email Service,
   firmony.ai onboarded for sending. Until then requests are kept and their emails wait in the outbox (retried
   every fifteen minutes, ten times).
6. For the client's app: an R2 bucket `firmony-files` in the **EU jurisdiction** (before the first deploy that
   carries `r2_buckets`), and the secret `ANTHROPIC_API_KEY` on the Worker (an API key of an Anthropic account of
   europio; without it every photo goes to the accountant). Before the first client: the privacy notice names
   Anthropic (photos and PDFs of documents, read and not kept for training), R2 for the files, and what the app
   keeps and how long (documents ten years by the accounting act, s. 35). Not written yet.
7. The first administrator: once email works, he signs in at /app/prihlasenie with `ahoj@firmony.ai`
   (`TEAM.bootstrapEmail`): while nobody of the team exists, that address becomes the administrator
   ("Christian Juhás"). Then he adds accountants on /ucto/tim; each signs in with her own email.
8. Before the page is public: at least one accountant agreed (his to-do list of 12 October: call 3 to 5 freelance
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

## The key, as read on 13 October 2026 (his question at 16:24: what did the French and the Americans have, what is missing here)

He asked what system to build behind the site to be the fastest, cheapest, most efficient and easiest, and what
the key of the winners abroad is. He wants .io for the domain (CloudTalk has one), bought later, after a talk
about marketing. What was found (sources: Dealroom on Pennylane, Pennylane's PDP page, Digitiz and independant.io
on Dougs, Dougs' 2025 retrospective, Outsource Accelerator and ICAEW on Bench, The Next Web on Rillet, Reuters
on Crete, the sites of Matax, Bezúčto and Keepi, TASR on Digitoo, Enable Banking's Slovak page, podnikajte.sk):
- The winners sell "the client does nothing": documents and the bank flow in by themselves, software posts them,
  a person checks and answers. Dougs (an online firm, our model): 14 000 clients in 2023, "plus de 49 000" in
  2026, 49 to 159 € a month, bank sync, app, photographed receipts, real-time dashboard, unlimited questions,
  company formation free with accounting; criticised for hard-to-reach people on complex matters, changing
  contacts and errors found late. Pennylane (software for client and accountant): 4 500 firms, 350 000 SMEs,
  €75M at €2B in April 2025; its certified e-invoicing platform is free for its clients; Dougs was among the
  first nine certified platforms (December 2025).
- Bench (over $100M raised) shut down abruptly in December 2024: late bookkeeping, proprietary software, no
  export; customers locked out in tax season. Rillet ($1B, August 2026): AI agents keep the ledger, accountants
  review. Crete (Thrive, June 2025): $500M to buy accounting firms and give them AI.
- Slovakia has DIY software (Bezúčto 19,99 € a month for an s. r. o., Keepi, KROS, Pohoda), AI for offices
  (Digitoo, 2023: 70 % less time per invoice) and offices with photo and email delivery (Matax: 90, 160 and 400 €
  a month, closing from 200 €, no app or bank link on its site). Nobody joins a person who does it for you with a
  system where everything flows in. Firmony is 19 to 38 % cheaper than Matax.
- The Slovak edge from 1 January 2027: e-invoices arrive as data through a digital postman, the bank through open
  banking (Enable Banking lists SLSP, VÚB, Tatra, ČSOB, Poštová, 365.bank), and an eKasa receipt's QR code points
  to the receipt in the Financial Administration's database ("Over doklad"). Whether that may be used at scale is
  to be checked.
- Proposed, not yet decided by him: phase 1 by 1 January 2027 is the pipe (a client app: photo, email forwarding,
  eKasa QR, e-invoices and bank by themselves, "missing document" per payment, VAT due and when, messages with the
  accountant) and an accountant's cockpit (AI proposes MD/D, VAT and the control statement line; she confirms;
  bank matched; VAT return and control statement as XML; every client's deadlines on one screen). The ledger and
  the closing stay in a certified program (Pohoda or Omega) until there are hundreds of clients. First piece
  offered: intake (email, photo, eKasa QR) with AI posting proposals, tried on europio's documents.
- For marketing later: since 17 August 2026 an s. r. o. is founded only through a notary or an advocate, and
  over 24 000 companies were founded by mid-September 2026 (95 % s. r. o.); Dougs wins clients at founding.

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
- Pages: `/` (the opening with the card on the IČO, one month, four figures, the hug, everything in one price,
  AI and the accountant, the e-invoice date, prices, the comparison, two ways in, who is behind it, questions,
  the closing form),
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

## The client's app (`src/app/`, views in `src/views/inside.tsx` and `inside-pages.tsx`; 13 October 2026)

The model is Dougs' and Pennylane's: every payment on the company's account needs a document, and the client's only
task is to add one where it is missing. Everything else (reading it, pairing it with its payment, the deadlines,
filing) is ours. One amber thing in sight on every page: what is missing; when nothing is, the overview says
"Všetko máme. Nemusíte nič robiť." in the panel of light of the site.

- Signing in (`session.ts`): an email, a link valid for 20 minutes and once (`login_links`, a hash), then a
  cookie `__Host-firmony` for 30 days (`sessions`, a hash; HttpOnly, Secure, SameSite Lax). The link opens a page
  with one button (POST), so a mail scanner that opens links cannot use it up. The form answers the same for an
  address we do not know. Accounts are made by us (`users`, `members`, `companies`); there is no sign-up.
- Pages: `/app` (overview: what is missing, up to six payments; the month in figures; deadlines; adding
  documents and the address for forwarding; the accountant), `/app/platby` (filters `hotove`, `vsetky`), a payment
  (`/app/platby/:id`: send a document, confirm the one offered, pick one we have, or "no document needed" with a
  reason; a question about it), `/app/doklady` (filter `bez-platby`), a document (what was read, its payment, "paid
  from my own money", delete), `/app/spravy`. Desktop: a column on the left; phone: a bar on top and five tabs,
  the middle one "+" for a document. Every page works without its script (`public/inside.js`: a file goes off as
  soon as it is picked, a photo is made a JPEG of at most 2400 px first, files can be dropped on the card, a
  document being read is looked at again, the address is copied).
- Every query names the company of the session (`store.ts`). Whether a payment needs a document is never stored:
  `exempt` and `links` decide it. A document belongs to one payment (`links.document_id` is the key); a payment may
  have several documents.
- Pairing (`match.ts`, the rule at its top): the same amount to the cent, the right direction (an issued invoice
  is paid in), dates that fit (a receipt: a day before to five after; an invoice: fifteen days before it was
  issued to sixty after it was due); a score of amount 50, symbol 40, account 30, name 20, three days 10. Paired
  without asking only at 70 or more and when neither has another candidate; from 50 offered to the client.
- No document needed by itself (`autoExempt`): a payment between the company's own accounts, to the State
  Treasury (bank code 8180: taxes, social insurance, fees), and the bank's fee or interest (no account, words of a
  fee). The client can pick: bank, own accounts, payroll, the state, money put in or lent, something else (with a
  few words). The accountant is meant to check them (her side is not built).
- Reading (`read.ts`, `xml.ts`): a file is what its first bytes say (JPEG, PNG, WebP, HEIC, PDF, XML), never its
  name; the same file twice is kept once (`file_hash`), and on a payment's page the one we have is given to it. A
  photo or a PDF goes to Claude (`READER` in config: claude-haiku-5-5, a tool with Slovak fields, every field
  checked; 5 MB for a picture, 25 MB for a PDF); HEIC, a file too large, no key or no answer: "Prečíta ho
  účtovníčka". An e-invoice (UBL 2.1, Peppol) and the bank's statement (camt.053; VS, SS and KS wherever banks put
  them; a batch split; the closing balance kept) are read by our code. XML that declares entities is refused. The
  schedule reads again what was cut off, three times.
- Files are in R2 (`FILES`, `companies/<id>/documents/<doc>.<ext>`) and handed out only to their company
  (`/app/subory/:id`: a picture or text in a sandbox, XML as text, a PDF with its viewer).
- Messages go to us by email (`ahoj@firmony.ai`, "Správa od klienta"), with the payment they are about.
- The sample company (`demo.ts`, "Ukážková firma s. r. o.", Martin Novák, dated from today) exists only at
  `/app/ukazka` on a developer's machine with `DEMO=1`, which only the playground sets; the runtime test holds that
  it is 404 on the Worker.
- Not built yet: the accountant's side (her list of clients, documents to book, answering messages, checking what
  the client marked), documents by email (an Email Worker for `doklady-<code>@`; the address is shown already),
  the bank by open banking (the statement is uploaded by hand meanwhile), the digital postman, eKasa receipts by
  their QR code, issuing invoices, more than one company for one person (a switch), deleting files at the end of
  their ten years, thumbnails. Not seen in a real browser: a PDF opened by "Otvoriť originál" under its CSP; a
  photo from an iPhone made smaller by the script (HEIC).

## The accountants' side (`src/team/`, views in `src/views/team.tsx`; 13 October 2026, from 17:48)

What Pennylane and Dougs give the accountant, for the work behind the client's app: every client's work counted
on one screen, a document booked on one screen with its original beside the form, the next one a click away.

- Who: `users.team` is 'admin' or 'accountant' (null for a client). The same sign-in by link for everybody;
  somebody of the team without a company lands on /ucto, one who also has a company of their own lands in it and
  has "Účtovníctvo pre tím" in the column (and "Moja firma" on the team side). An accountant sees the companies
  whose `accountant_id` is hers (`canSee`, `visible` in `src/team/store.ts`); the administrator sees all, makes
  clients (/ucto/klienti/novy), reads the requests from the site (/ucto/ziadosti) and adds the team (/ucto/tim,
  an email with the sign-in page goes to the new person). A client at any /ucto address gets a plain "not found"
  page; anything a user may not see answers 404. Every POST is checked like the rest of the site (origin, length).
- Klienti (/ucto): a table with what waits at each client (to book, to check, an unanswered message, payments
  without a document at the client) and four figures above it; a client with nothing waiting has a green tick.
- A client (/ucto/klienti/:id): to book, payments the client marked "no document needed" (OK, or "Vrátiť
  klientovi", which clears the mark and writes to the client with the payment), the messages with a reply box
  (the client is emailed "Firmony: máte novú správu"), payments without a document with "Pripomenúť klientovi"
  (a message listing them, and an email), the company's data (DIČ, IČ DPH, VAT payer, the note for the team; plan
  and accountant for the administrator), its people, the CSV for the accountant's program by month (UTF-8 with
  BOM, ';', amounts as "12,40", no cell that Excel would run), and the suppliers' rules.
- Booking (/ucto/doklady and /ucto/doklady/:id): the queue of all her clients, oldest first. One screen: the
  original (a photo, or a PDF framed beside the form; a phone gets the link), the form (kind, what it is for as a
  category with its account, supplier, IČO, number, dates typed "11. 10. 2026", amounts, VAT, VS, another account),
  "Odpočítať DPH" for a VAT payer, "Zapamätať pre dodávateľa", and the entry it makes, MD and D, live from the form
  (`entryFor` in `src/app/booking.ts`: a received invoice against 321, a receipt against 221 from the company's
  account, 365 when the owner paid it himself, 211 from cash; VAT on 343 only when it is deducted; an issued
  invoice 311 against 602 or 604 and 343). "Zaúčtovať a ďalší" books and opens the client's next document;
  "Uložiť bez zaúčtovania"; "Zahodiť doklad" (a duplicate, or what is no document); a booked one can be changed
  or unbooked, and is never deleted, by the client or the team. The reader proposes the category (`kategoria`);
  a supplier's rule wins over it and is applied at once to the supplier's other waiting documents. The same
  document sent twice (same number and amount, or same supplier, day and amount) is marked "Možný duplikát" and is
  never paired by itself. A payment can be given to a document from its best candidates.
- Messages (/ucto/spravy): the clients whose last message is theirs, the longest waiting first. A client's message
  is emailed to the company's accountant, or to ahoj@ while it has none.
- A request from the site becomes a client in one form (`?ziadost=`): company, person, plan, accountant, VAT, and
  a welcome email with a sign-in link valid for `TEAM.welcomeDays` (7) days and the address for forwarding.
- The sample team: /ucto/ukazka in the playground signs in as the administrator (Christian Juhás),
  `?ako=uctovnicka` as Lucia Horváthová, who keeps Ukážková firma; Jana Kováčová keeps Ateliér Nova s. r. o.
  (Eva Kollárová, with Martin Novák as her partner, so Martin's app shows the switch between the two companies).
  Every sample document has its original, a small PDF made from its own figures (`demoPdf` in `src/app/demo.ts`).
- On a phone the column is a menu in the bar (`BarMenu`): who is signed in, the switch, signing out.
- Not built yet on this side: the VAT return and the control statement as XML, deadlines of every client on one
  screen, the closing, booking the bank's own payments (a fee, a tax) as entries, a log of who changed what on the
  pages (the events are recorded), assigning many clients at once, search in the queue.

## Design (the sixth one, built on the afternoon of 13 October 2026)

History: the first design (plum, mist, coral, Literata) he called "odporná ... jak z Wordu"; the second (black,
glass, Host Grotesk bold) "tuctové"; the third (black, his iridescent glass objects in every section,
Instrument Serif headlines) "nie najhoršie ... stále nie elita" at 01:10 and at 01:25 "tuctová web stránka z
umelej inteligencie"; the fourth (night turning into a white day, a pile of papers flying into a ledger, Geist
only) at 14:09 "nie je to zlé, ale úprimne, nebral by CEO Apple, Nvidia, Tesla ... je to slabé". The fifth
(black and filmic like Apple's and Robinhood's product pages, one large phone drawn in CSS with the app on it,
his glass papers flying into it, Newsreader headlines with Geist) at 15:07: "nechutné ... neprehľadné ... čisto
vygenerované umelou inteligenciou ... kvantum textu, vyzerá to lacno, ten telefón je úplne od veci". What he
asked for instead, with screenshots of CloudTalk and Tesla: more white ("nechaj biely"), blue and red; the
elegant type in a pleasant red and the modern type in blue; his glass icons kept, made clear and modern and set
as CloudTalk sets its own ("okopíruj aj tie ikony, ako majú"); far less text; no phone; an opening like
CloudTalk's or Tesla's; CloudTalk's structure, its fonts and its centred layout; the plans kept ("asi musí byť")
but made premium. At 15:08: the motion stays ("sú pekné, to zanechaj"), done otherwise. The first look went out
at about 16:00 (preview version 9). At 16:14 he accepted it, having seen it on a computer and not yet on a phone:
"na počítači už to za mňa je celkom úroveň ... nechávame to v tomto stave". Asked whether Musk or Huang would
accept it, he was told: the design would pass; what such people judge is proof (real clients and numbers, never
invented), people (his real photo, an accountant with a name) and a finished thing (domain, email, live site).

- Type: **Funnel Display** (The Funnel Project, OFL) for titles, figures and the name, 600, set tight
  (-0.035 to -0.045em): CloudTalk sets GT Pressura (Grilli Type, paid) at 500; this is the free face nearest to
  it. **Figtree** (Erik Kennedy, OFL) for everything read and every interface, for CloudTalk's Silka (paid).
  **Newsreader italic** (opsz pinned at 60, weights 300 to 500) for the warm half of a title, set a tenth larger
  than the sans so that the two stand level. The files come from `@fontsource-variable/funnel-display` and
  `figtree` (devDependencies), latin and latin-ext, 18 to 20 kB each; Geist and Newsreader's upright are gone.
- Colour (`:root` in `public/app.css`): white page; `--mist` #f5f6fb for the light panels; hairlines `--line`
  #e5e8f1; `--ink` #0d1330 for figures and names, `--text` and two greys leaning to the blue. **Blue** #1c2ef0
  (7.8 to 1 on white) for every title's sans half, every button and link; **red** #e1344c for the serif half
  (large type only, 4.4 to 1; `--red-ink` #c0233a for small red text). Green only for "booked", amber for the
  flag on a slip. The panels of light (the opening, the e-invoice band, the close) are one sky of blue, violet
  and red in radial gradients, each lit from another side, with film grain (an SVG feTurbulence data URI at
  20 %, overlay), as CloudTalk lays it over its own; on them the type is white and the serif a light rose
  (#ffb9c6).
- Titles: `.title` with `.title__sans` (blue) and `.title__serif` (red italic, its own line), centred over each
  section (`.head--center`), as CloudTalk centres its sections. His glass icons stand in `.tile`s: rounded
  squares (radius 30 % of the side) of white to a faint blue with a touch of pink in one corner, a hairline,
  40, 56 or 84 px; the glass fills 84 % of it.
- The opening (`.hero`): CloudTalk's composition. A panel of light (radius 32, up to 720 px high) with a pill
  "Účtovníctvo pre mladé s. r. o.", the promise in white ("Postaráme sa" held together by a no-break space, so
  the line breaks before "o všetko"; "Vy rastite." in the rose serif) and the lead; three of his glass objects
  float in its right part (the invoice, the coins, the slip), each bobbing and drifting up at its own pace as
  the page scrolls. The white card where a client starts (the F in a tile, "Začnite s IČO vašej firmy", the IČO
  field and its button in one row, "Ešte nemám firmu") lies over the panel's lower right edge: the grid has a
  second row of 124 px and the card spans both. Under the panel on the left: the price line and "Pozrieť
  cenník", "Ako to funguje". The words keep left of the card at every height (`--pad-x`, `--card-w`,
  `--card-r`). On a tablet the card comes under the panel and overlaps it by 96 px; on a phone the glass is one
  invoice in the top corner, and none below 380 px. The opening arrives once (words, card, glass) on load.
- One month (`.flow`, "Vy pošlete doklady. My urobíme zvyšok."): a white card of October as CloudTalk shows a
  feed (head, five rows each with its icon in a tile, title, amount and a green pill, and "Všetko zaúčtované")
  on a light panel. Where scroll timelines exist and the screen is at least 700 px high, the track is 235vh and
  the stage sticky: the five glass papers float beside the card (above it in a panel under 900 px, two of them
  coming in from the sides) and fly one by one into the icon of their row, which lights as it is booked; then
  the foot appears. The card's measures are numbers on `.flow__panel` (`--head-n`, `--row-n`, `--pad-n`,
  `--tile-n`, `--fly-n`) and every landing is reckoned from them (`--lx`, `--ly`, `--ls`); a paper's start is a
  share of the panel's width (`--p`, in `cqw`) and a height from the card's top. Without the flight the card
  stands finished, two papers beside it.
- Then: four figures in light cards (69 €, 0 €, 1 deň, 1. 1. 2027); the hug, lit word by word; everything in
  the price as CloudTalk's interactive list (six cards with a radio each, the checked one white with a blue
  check; the light panel beside them shows the picked one: the machine reading a torn slip under its beam with
  MD 513 / D 221 and the flag, the filed VAT return, e-invoices received, payroll, deadlines with the missing
  slip, the question to the accountant, each but the slip with its glass beside the card's top corner),
  switched by `:has()` with no script; the machine and the person as
  two cards tinted blue and rose; the e-invoice date as a panel of light with the envelope; the prices as one
  sheet of three columns whose six rows stand level (`subgrid`, the list's lines `display: contents`), the lead
  plan lit from above with a blue-to-red bar and a blue price; the comparison; two ways in; who is behind it
  (his words in the red serif); questions; the close as a panel of light with his glass F; a white footer.
- The pages of the request and the legal page are white with a faint blue light at their top.
- Pictures: `scripts/art.py logo art-src/icons/f.png` cuts the glass F from its own transparency: the logo
  files see-through, the favicon see-through, the phone icons and the shared link's picture on white, the name
  in Funnel Display, blue with a red full stop.
- `scripts/dev/preview.mjs <folder>` makes a static copy of the pages for the owner's artifact (relative
  addresses, the stylesheet inlined, the forms stopped with a note); published as "Firmony" on 13 October 2026
  and republished from the same file path (version 9 is the first of the sixth design; version 11, of 16:10,
  adds the glass beside the previews).

## Before pushing

```
npm run check            # TypeScript
npm test                 # unit checks (106): pairing, statements, e-invoices, reading, texts, deadlines
npm run test:runtime     # the deployable bundle in workerd (114): the site, and the app end to end
node --no-warnings scripts/playground.mjs          # http://127.0.0.1:8787 with pretend register, email and reader
node scripts/dev/look.mjs <folder> [paths]          # screenshots at three widths, says what overflows
node scripts/dev/mutate.mjs                         # takes this change's rules out one at a time (18, see its list)
node scripts/dev/preview-app.mjs <folder> <photo>   # the clickable copy of the app (a fresh playground first)
```

The team in the playground: `/ucto/ukazka` (the administrator) or `/ucto/ukazka?ako=uctovnicka` (Lucia).
The app in the playground: `/app/ukazka` signs in to the sample company; a photo added there is "read" by the
pretend reader (`readerAnswer` in `test/pretend.mjs`) as yesterday's café receipt for 12,40 €, which pairs it with
the café payment. A fresh sample company: remove `.wrangler/playground-d1` and `.wrangler/playground-r2` before
starting. `mutate.mjs` works in a copy in the system's temporary folder; replace its list with the next change's
rules.

In the playground IČO 57442452 is found (europio), 35757442 makes the register fail, anything else is unknown;
`/playground/mail` shows what was "sent". To stop it: `pkill -f "node --no-warnings [s]cripts/playground"` in a
command of its own (a command line that contains the start command is killed by the same pattern).
