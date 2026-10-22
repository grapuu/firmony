// What search engines read beside the page (20 October 2026, his word: "absolútne top SEO ... keď niekto napíše
// firmony, aby sme boli prví, no aj podľa kľúčových slov"): schema.org data in JSON-LD. Every figure comes from
// config.ts, so the data can never say another price than the page. Nothing here is a script: it is data that no
// browser runs, which the policy of the site allows.
import { BRAND, CLOSING_PRICE, OPERATOR, PAYROLL_PRICE, PLANS } from './config'

/** When the public pages last changed, for the sitemap. */
export const SITE_UPDATED = '2026-10-22'

const id = (name: string) => `${BRAND.origin}/#${name}`

/** europio s. r. o. as the company behind the brand. */
export function organization(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': id('organizacia'),
    name: BRAND.name,
    legalName: OPERATOR.name,
    url: `${BRAND.origin}/`,
    logo: `${BRAND.origin}/art/icon-512.png`,
    image: `${BRAND.origin}/art/share.png`,
    email: BRAND.email,
    telephone: OPERATOR.phone.replace(/\s/g, ''),
    taxID: OPERATOR.taxId,
    identifier: { '@type': 'PropertyValue', propertyID: 'IČO', value: OPERATOR.companyId.replace(/\s/g, '') },
    address: postal(),
    areaServed: { '@type': 'Country', name: 'Slovensko' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', email: BRAND.email, telephone: OPERATOR.phone.replace(/\s/g, ''), availableLanguage: 'sk' },
  }
}

function postal(): Record<string, unknown> {
  const [postalCode, ...town] = OPERATOR.postalCity.split(' ')
  return {
    '@type': 'PostalAddress',
    streetAddress: OPERATOR.street,
    postalCode: `${postalCode} ${town.shift() ?? ''}`.trim(),
    addressLocality: town.join(' '),
    addressCountry: 'SK',
  }
}

/** The site itself, named so that a search for the brand finds it as one. */
export function website(): Record<string, unknown> {
  return { '@type': 'WebSite', '@id': id('web'), name: BRAND.name, alternateName: [`${BRAND.name} účtovníctvo`, 'firmony.io'], url: `${BRAND.origin}/`, inLanguage: 'sk', publisher: { '@id': id('organizacia') } }
}

/** The accounting service with its plans, payroll and the closing as offers. */
export function service(): Record<string, unknown> {
  const offer = (name: string, price: number, description: string, unit = 'MON') => ({
    '@type': 'Offer',
    name,
    description,
    priceCurrency: 'EUR',
    price: price.toFixed(2),
    priceSpecification: { '@type': 'UnitPriceSpecification', price: price.toFixed(2), priceCurrency: 'EUR', unitCode: unit, valueAddedTaxIncluded: false },
    url: `${BRAND.origin}/#cennik`,
  })
  return {
    '@type': 'AccountingService',
    '@id': id('sluzba'),
    name: `${BRAND.name}: online účtovníctvo`,
    description: 'Vedenie podvojného účtovníctva, DPH, miezd, závierky a daňového priznania pre s. r. o. a akciové spoločnosti online. Doklady číta umelá inteligencia, kontroluje a podáva ich účtovníčka.',
    url: `${BRAND.origin}/`,
    image: `${BRAND.origin}/art/share.png`,
    provider: { '@id': id('organizacia') },
    areaServed: { '@type': 'Country', name: 'Slovensko' },
    address: postal(),
    telephone: OPERATOR.phone.replace(/\s/g, ''),
    email: BRAND.email,
    priceRange: `od ${PLANS[0]?.price ?? 0} € mesačne`,
    knowsLanguage: 'sk',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Cenník',
      itemListElement: [
        ...PLANS.map((p) => offer(p.name, p.price, `do ${p.docs} dokladov mesačne${p.vatPayer ? ', platiteľ DPH' : ''}`)),
        offer('Mzdy', PAYROLL_PRICE, 'za človeka a mesiac'),
        offer('Závierka a daňové priznanie', CLOSING_PRICE, 'raz ročne', 'ANN'),
      ],
    },
  }
}

/** Questions and answers as the page shows them. */
export function faqPage(items: readonly { q: string; a: string }[], path: string): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    '@id': `${BRAND.origin}${path}#otazky`,
    mainEntity: items.map((item) => ({ '@type': 'Question', name: plain(item.q), acceptedAnswer: { '@type': 'Answer', text: plain(item.a) } })),
  }
}

/** A guide: its title, its description, who wrote it and when it changed. */
export function article(a: { title: string; description: string; path: string; published: string; modified: string }): Record<string, unknown> {
  return {
    '@type': 'Article',
    '@id': `${BRAND.origin}${a.path}#clanok`,
    headline: plain(a.title),
    description: plain(a.description),
    inLanguage: 'sk',
    datePublished: a.published,
    dateModified: a.modified,
    mainEntityOfPage: `${BRAND.origin}${a.path}`,
    image: `${BRAND.origin}/art/share.png`,
    author: { '@id': id('organizacia') },
    publisher: { '@id': id('organizacia') },
  }
}

/** The way back to the home page, as search results show it. */
export function breadcrumbs(name: string, path: string): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND.name, item: `${BRAND.origin}/` },
      { '@type': 'ListItem', position: 2, name: plain(name), item: `${BRAND.origin}${path}` },
    ],
  }
}

/** Text without the typesetter's no-break spaces, as data wants it. */
export function plain(text: string): string {
  return text.replace(/[  ]/g, ' ')
}

/** The graph as the page carries it: one JSON-LD block, safe inside the page (no "<" can close it). */
export function jsonLd(nodes: Record<string, unknown>[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c')
}
