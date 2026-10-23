# Handoff to Claude (24 October 2026)

This document is the complete handover of the current work phase. Read it first, then `CLAUDE.md`
(the architectural memory) and `PROGRESS.md` (the chronological log). The goal of this phase was to
finish the customer-acquisition transparency work (first month free, formation conditions, pricing),
stabilise it, and hand the project over safely. **Do not redo this phase's work; continue from it.**

## A. Current state of Firmony

**Live in production** (`main`, deployed by Cloudflare Workers Builds on push to `main`):

- **Landing page** — approved premium design: hero, the 3D carousel of four "ZA 0 €" offers, flow,
  stats, statement, services, duo, e-invoice, pricing, comparison calculator, free tools, paths,
  about, FAQ, final CTA. `src/views/home.tsx`, copy in `src/copy.ts`, styles in `public/app.css`,
  the one script in `public/flow.js`.
- **Registration** — `/zacat` (IČO → registry lookup → request → order → online contract acceptance),
  with AML, order review, and `CONTRACT_RELEASE` gating. `src/views/start.tsx`, `src/views/order.tsx`,
  `src/order.ts`, `src/contracts.ts`.
- **Formation (G4)** — client request `/app/zalozenie`, team queue `/ucto/klienti/:id/zalozenie`,
  7-step checklist, states, history, export, erasure. `src/formation/`, `docs/formation.md`.
- **Managed takeover (G1)** — switch-accountant flow.
- **Billing (Firmony's own invoices)** — `src/team/billing.ts` (pure rules) + `src/team/billing-store.ts`
  (database). Invoices issued by europio s. r. o., delivered to clients as e-invoices (UBL 2.1).
- **Client system** — documents, bank, VAT (monthly/quarterly/§7a), payroll, closing + income tax,
  deadlines, assistant (G2), eKasa, fixed assets, trips, meals, social fund, garnishments, etc.
- **E-invoice / Peppol** — `src/app/invoices.ts` `ublOf` writes UBL 2.1; `test/peppol.mjs` validates it
  against the real CEN-EN16931 and PEPPOL-EN16931 Schematron (SaxonJS) plus the UBL XSD (xmllint-wasm).
  E-invoices are **files**, not live-sent to a Peppol access point (the digital-postman integration is
  still "pripravujeme").

## B. What this phase did

Implemented and tested (all on top of the previous `main`):

1. **First month free** — 100 % discount on the base plan of a new client's first service month.
   - `src/team/billing.ts` `draftOf`: emits `free:plan:YYYY-MM` as its own **negative** line in the
     same batch as the `plan:YYYY-MM` line, so the offer is visible and the value shown. Only the plan
     is discounted; payroll, the "extra" for more documents, and the closing are billed whole.
   - `billing_items` unique key `(client_id, key)` makes it single-use; if the first month was already
     billed, no discount is applied (no retroactive changes). Zero-total invoices (plan + discount only)
     work; the total can never go negative (discount = −plan price).
   - Tests: `test/billing.units.mjs` (new cases), `test/billing.runtime.mjs` (updated totals + new
     assertions for the negative `invoice_lines` row and the UBL carrying the discount).

2. **Formation transparency** — `src/copy.ts` + `src/views/home.tsx`:
   - Card "Založenie s. r. o." shows a visible condition (36-month accounting commitment + pro-rata
     recoup), via a new `.offer__cond` style.
   - The "Bez viazanosti" fine print is replaced by the exact statement + a link to FAQ
     `#zalozenie-podmienky`; the promise is now "Bez dlhej viazanosti" with the caveat.

3. **Pricing and calculator** — `src/calc.ts` + `src/copy.ts` + `src/views/home.tsx`:
   - `firstYearPlanCents` (11 paid months), `standardYearPlanCents` (12), `firstYearCents`
     (first year with closing + payroll). The pricing card shows "Prvých 12 mesiacov" and "Ďalších
     12 mesiacov"; the closing is separate "raz za kalendárny rok"; the comparison calculator uses
     the first year. The exact marketing wording is "Prvý mesiac základného účtovného balíka za 0 €.
     Doplnkové služby sa účtujú podľa cenníka."

4. **Peppol coverage** — `test/peppol.mjs` gained two cases: the first-month-free offer netting to zero,
   and the offer beside paid extras, on a non-VAT-payer invoice. The negative-line discount is already
   validated by the existing "discount" case (see E. risks).

5. **Documents** — `docs/formation-pricing.md` (C-price basis, formula, edge cases) and
   `docs/terms-draft-promo-and-formation.md` (draft contract clauses, C left blank). Both are
   **proposals, not approved** (see D).

## C. What works and must not be casually rebuilt

- **Schema migration steps with SHA-256 regression** (`src/db.ts`): every new step appends; the first N
  are guarded by a hash test ("formation: the first 79 deployed schemas are unchanged"). Add schema only
  as a new step.
- **Contract snapshot** (`src/contracts.ts`): on acceptance, the full terms + catalogue are stored with
  SHA-256; old contracts are returned verbatim. Never rewrite closed contracts. Changing `src/content/terms.ts`
  bumps `TERMS_VERSION` and invalidates the current `CONTRACT_RELEASE` (needs a new legal/insurance review).
- **Pure vs store split**: `src/team/billing.ts` is pure (tested by `billing.units.mjs`), `billing-store.ts`
  is the database layer. Keep money in integer cents everywhere (`formatEur`, `formatEurExact`).
- **Copy lives in `src/copy.ts`** and is `typesetAll`-ed once (Slovak NBSP rules); prices/limits in
  `src/config.ts`; no hardcoded figures in views. Tests enforce "no long dash" and no inline styles/scripts.
- **Asset cache-busting** (`config.ts` `asset()`): each deploy revs `/app.css` and `/flow.js`.
- **E-invoice validation** is real (SaxonJS Schematron + xmllint XSD), not a string check.
- **Billing idempotency**: `billing_items` unique keys + `billing_invoices`; issuing is two steps (write, then
  deliver the client's copy), both idempotent.

## D. What is NOT approved yet (do not activate, do not invent numbers)

1. **Price C for formation** — not set. `docs/formation-pricing.md` lays out the cost categories (notary/lawyer,
   trade licence + fee, register + court fee, tax/insurance/DPH registrations, our coordination) but **no number**.
2. **Which costs Firmony actually covers** — the "who pays" table is a fill-in draft.
3. **Pro-rata formula as a legal obligation** — `C × max(0, 36 − m) / 36` is a **working proposal**, not a
   contractual clause. Rounding, notice period, suspension, company-change, and our-breach exceptions are
   proposals pending legal review.
4. **The draft terms** (`docs/terms-draft-promo-and-formation.md`) — new article 4.x (first month free) and a
   formation article with `C = ____ €`. Not in `src/content/terms.ts` yet.
5. **Legal + insurance review / new `CONTRACT_RELEASE`** — required before any terms change goes live.
6. **Production activation of anything depending on 1–5** — there is **no** mechanism that auto-bills the
   formation recoup today (correctly; do not add one without approval).

## E. Technical risks (file → risk → next step)

1. **`src/team/billing.ts` `draftOf` / `src/team/billing-store.ts` `billingDrafts`** — the promo is keyed by
   `company.id`, not by the legal entity (IČO). `src/order.ts` `isClient()` blocks a second **active** company
   with the same IČO, but a **closed** company that re-registers with the same IČO would get a new `companies`
   row and could claim the promo again. There is no unique index on `companies.ico`. **Next step:** key the
   grant by IČO (e.g. a `promo_grants` table, or a cross-company `free:plan:%` check in `billingDrafts`), and
   add a runtime test for re-registration. *Not implemented now because it is a billing-logic change that could
   not be re-tested in the final session.*
2. **`src/app/invoices.ts` `ublOf`** — the discount is exported as a **negative invoice line** (negative
   `InvoicedQuantity` and `LineExtensionAmount`), which the repo's Peppol rules accept (no fatal) but is not the
   canonical `AllowanceCharge` representation. The existing `test/peppol.mjs` "discount" case and the two new
   cases cover it. **Next step (only if a Peppol access point rejects it):** emit a document-level
   `cac:AllowanceCharge` (ChargeIndicator=false, Amount, AllowanceChargeReason) after `PaymentMeans` and fix
   `LegalMonetaryTotal` (`LineExtensionAmount` = positives, `AllowanceTotalAmount`, `TaxExclusiveAmount` = net).
3. **Tests could not be re-run in the final session** — the local shell had no `node`/`npm`. All suites were green
   at the end of the previous session (`check`, 1 503 unit + deployment, 2 273 runtime, UI 1440/390/320, peppol).
   **First action for you:** run the full suite (below) before touching anything.
4. **`src/calc.ts` `annualPlanCents`** is now an unused export (the "subsequent year" counterpart). Harmless;
   remove or use when the calculator later shows both years.
5. **0 € invoices** are issued for a first-month-only client; `stateOf` marks them paid. This is intended
   transparency, but confirm the downstream (accounting/overview) accepts a 0 € document.

## F. Recommended next priorities (business value × technical risk)

1. **Re-run the full suite** and confirm green before any further change.
2. **IČO-keyed promo grant** (E.1) — close the only identified correctness gap in the promo, with a runtime test.
3. **First client login / end-to-end dry run** — the highest-value unblocked work; the flow is technically ready.
4. **Formation pricing decision** — get C and the covered-cost list approved, then wire the formula only as a
   documented, human-confirmed step (never an automatic charge).
5. **Terms + `CONTRACT_RELEASE`** — after legal/insurance review, add the approved clauses, bump `TERMS_VERSION`,
   archive, and re-release.
6. **Peppol AllowanceCharge** (E.2) — only if/when a receiving access point requires it.

## G. GitHub and deployment

- **Branch:** `main`. **Local commit `168d020`** ("Zjednodušiť formulár: založenie bez redundantnej voľby
  situácie") is **ahead of `origin/main` and not pushed**. The changes of this phase are committed on top (see below).
- **Deployment:** Cloudflare **Workers Builds deploys `main` to production** (firmony.io, D1 `firmony`,
  R2 `firmony-files`). `.github/workflows/production.yml` runs `verify:deployment` on push to `main`.
  `.github/workflows/ci.yml` runs `check`, `test`, `test:peppol`, `test:runtime`, `test:ui`, `test:browser` on
  PRs and `main`. **Do not push to `main` without owner approval.** A feature branch is safe to push.
- **Tests:**
  - `npm run check` — TypeScript (two tsconfigs).
  - `npm test` — unit (esbuild bundle → `units.test.mjs`) + deployment.
  - `npm run test:runtime` — the deployable bundle in workerd (e2e).
  - `npm run test:ui` — visual layout (Chromium, 1440/390/320) from `FIRMONY_CAPTURE_DIR=.wrangler/ui` captures.
  - `npm run test:peppol` — UBL/EN 16931/Peppol validation.
  - `npm run test:browser` — Playwright browser checks (Chromium + WebKit).
- **Never** force-push, never squash history without need, never auto-merge unapproved changes into `main`.


