// A Slovak address written on one line, as the forms keep it, in its parts for the files that want them apart
// (Intrastat's reporting unit, the e-invoice's postal address).

/** "Hlavná 1, 040 01 Košice" as its street, postal code and town. */
export function splitAddress(address: string): { street: string; postal: string | null; city: string | null } {
  const parts = address.split(',').map((p) => p.trim())
  const last = parts.length > 1 ? (parts.pop() as string) : ''
  const m = /^(\d{3})\s?(\d{2})\s+(.+)$/.exec(last)
  if (m) return { street: parts.join(', ') || address, postal: `${m[1]}${m[2]}`, city: m[3] ?? null }
  return { street: parts.length > 0 ? [...parts, last].filter(Boolean).join(', ') : address, postal: null, city: null }
}
