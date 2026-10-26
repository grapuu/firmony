// Who is in the Peppol network (26 October 2026, the digital postman built into Firmony). A Slovak company is a
// Peppol participant by its DIČ under the scheme 0245, as the Financial Administration's transposition of Peppol BIS
// 3.0 addresses it and as our e-invoices write it (invoices.ts, EndpointID). Whether a participant is registered, and
// with which SMP, is public: the Peppol SML publishes a U-NAPTR record of every participant ("Meta:SMP"), whose
// regular expression gives the SMP's address. The name is strip-trailing(base32(sha256(lowercase(ID-VALUE))), "=")
// + "." + ID-SCHEME + "." + SML zone ("Peppol CNAME to NAPTR Migration Process" v1.0.0 of 17 April 2025,
// docs.peppol.eu/edelivery/changelog/2025-04/; its own example, 0088:123abc, is a unit check). The production SML is
// now OpenPeppol's own, zone participant.sml.prod.tech.peppol.org: seen on 26 October 2026 by asking it for a Slovak
// company of the Peppol Directory (0245:2023489446) through Google's and Cloudflare's DNS over HTTPS, the record
// pointing to its SMP, and the same name and SMP shown by peppol.helger.com's participant tool for the SML
// api.sml.prod.tech.peppol.org. A name of nobody answers NXDOMAIN. The record is asked for by DNS over HTTPS
// (Cloudflare's JSON API), so no contract and no key are needed to tell that a customer can receive.

export const PEPPOL_SCHEME = 'iso6523-actorid-upis'
export const SML_ZONE = 'participant.sml.prod.tech.peppol.org'
const DOH = 'https://cloudflare-dns.com/dns-query'

/** Peppol BIS Billing 3.0: the document types and the process every e-invoice and credit note of ours travels as. */
export const BIS = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
  credit: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
  process: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
} as const

/** A Slovak company's participant value, "0245:2120000000", from its DIČ or the digits of its IČ DPH; null without them. */
export function slovakParticipant(dic: string | null | undefined, icdph?: string | null): string | null {
  const plain = (dic ?? '').replace(/\s/g, '')
  if (/^\d{10}$/.test(plain)) return `0245:${plain}`
  const vat = (icdph ?? '').replace(/\s/g, '').toUpperCase()
  return /^SK\d{10}$/.test(vat) ? `0245:${vat.slice(2)}` : null
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32 without its padding. */
export function base32(bytes: Uint8Array): string {
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

/** The participant's name in the SML, which its U-NAPTR record stands under. */
export async function smlName(value: string, zone: string = SML_ZONE): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.toLowerCase())))
  return `${base32(digest)}.${PEPPOL_SCHEME}.${zone}`
}

export type Lookup = { state: 'found'; smp: string | null } | { state: 'missing' } | { state: 'unknown' }

/**
 * Asks the SML whether a participant is registered: a U-NAPTR record is the answer yes (with the SMP host it names,
 * which tells the postman); no such name is no; anything else (a timeout, an error of the resolver) is unknown and is
 * never shown as no.
 */
export async function lookupParticipant(value: string, fetcher: typeof fetch = fetch, timeoutMs = 3000): Promise<Lookup> {
  try {
    const name = await smlName(value)
    const response = await fetcher(`${DOH}?name=${encodeURIComponent(name)}&type=NAPTR`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) {
      await response.body?.cancel()
      return { state: 'unknown' }
    }
    const text = await response.text()
    if (text.length > 32_768) return { state: 'unknown' }
    const body = JSON.parse(text) as { Status?: number; Answer?: { type?: number; data?: string }[] }
    // NXDOMAIN: the SML has no such participant.
    if (body.Status === 3) return { state: 'missing' }
    if (body.Status !== 0) return { state: 'unknown' }
    const naptr = (body.Answer ?? []).find((a) => a?.type === 35 && typeof a.data === 'string')
    if (!naptr) return { state: 'missing' }
    return { state: 'found', smp: smpHostOf(naptr.data as string) }
  } catch {
    return { state: 'unknown' }
  }
}

/** The host of the SMP a U-NAPTR record's regular expression rewrites to ("!.*!https://smp.example.eu/!"). */
export function smpHostOf(data: string): string | null {
  const match = /https?:\/\/([a-z0-9.-]+)/i.exec(data)
  return match?.[1] ? match[1].toLowerCase() : null
}
