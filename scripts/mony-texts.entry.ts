// What Mony knows from the site and the app themselves (27 October 2026): every text is the one the pages show, so it
// cannot disagree with them. Bundled and run once by scripts/build-knowledge.mjs; never part of the Worker.
import { EXEMPT_NAMES, app } from '../src/app/copy'
import { team } from '../src/team/copy'
import { peppolCopy } from '../src/peppol/copy'
import { copy } from '../src/copy'
import { GUIDES } from '../src/content/guides'
import { TERMS, TERMS_TITLE } from '../src/content/terms'
import { INVOICING_TERMS, invoicingCopy } from '../src/content/invoicing'
import { llmsFullTxt, llmsTxt, sitePages } from '../src/robots'

/** Every string of a nested text object as "path: text"; a text made of data is shown once with placeholders. */
function flatten(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    const text = value.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : '')).trim()
    if (text) out.push(`${path}: ${text}`)
  } else if (typeof value === 'function') {
    for (const args of [['…', '…', '…', '…'], [2, 2, 2, 2]]) {
      try {
        const made = (value as (...a: unknown[]) => unknown)(...args)
        if (typeof made === 'string') return flatten(made, `${path} (s údajmi)`, out)
      } catch {
        /* a text that needs data of another shape is left out */
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flatten(item, path ? `${path}.${key}` : key, out)
  }
}
const lines = (value: unknown, root: string): string[] => {
  const out: string[] = []
  flatten(value, root, out)
  return out
}

export function monyTexts() {
  return {
    core: llmsTxt(),
    site: llmsFullTxt(),
    pages: sitePages().map(([path]) => path),
    guides: GUIDES.map((g) => g.path),
    terms: [TERMS_TITLE, ...TERMS.map((s, i) => [`${i + 1}. ${s.title}`, ...s.points.map((p, j) => `${i + 1}.${j + 1} ${p}`)].join('\n'))].join('\n\n'),
    appTexts: [...lines(app, 'aplikácia'), ...lines(EXEMPT_NAMES, 'aplikácia.dokladNetreba'), ...lines(peppolCopy, 'efaktury')],
    invoicingTexts: [...lines(invoicingCopy, 'fakturácia'), ...INVOICING_TERMS.map((s, i) => `Podmienky fakturácie ${i + 1}. ${s.title}: ${s.points.join(' ')}`)],
    siteTexts: lines(copy, 'web'),
    teamTexts: lines(team, 'tím'),
  }
}
