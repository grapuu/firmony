// The only file that asks the Register of Financial Statements (Register účtovných závierok, run by the Ministry of
// Finance; its open API under https://www.registeruz.sk/cruz-public/api). What a review of a new client wants of it:
// whether the company files its statements as a micro entity (the template "Úč MUJ"), when it was founded, whether
// it is consolidated and the band of its employees.
//
// The calls and their answers as recorded from the live API by an independent client (github.com/freevisionsk/
// registeruz-mcp, tests/cassettes, read on 28 October 2026):
//   GET /uctovne-jednotky?zmenene-od=<day>&ico=<IČO>  {"id":[1217556],"existujeDalsieId":false}
//   GET /uctovna-jednotka?id=<id>   {"idUctovnychZavierok":[...],"konsolidovana":false,"velkostOrganizacie":"04",
//                                    "datumZalozenia":"2012-08-17","ico":"46792511",...}
//   GET /uctovna-zavierka?id=<id>   {"typ":"Riadna","obdobieOd":"2023-01","obdobieDo":"2023-12","idUctovnychVykazov":[...]}
//   GET /uctovny-vykaz?id=<id>      {"idSablony":687,...}
//   GET /sablona?id=<id>            {"nazov":"Úč MUJ","nariadenieMF":"MF/18008/2014",...}
//   GET /velkosti-organizacie       codes 00 unknown, 01 none, 02 one, 03 two, 04 three to four, 05 five to nine,
//                                    06 ten to nineteen employees and on.
// Every call waits four seconds at most; a register that does not answer is "unknown", never "micro".

export const RUZ_API = 'https://www.registeruz.sk/cruz-public/api'

export interface RuzProfile {
  /** The day the company was founded, as the register gives it. */
  founded: string | null
  consolidated: boolean
  /** The band of employees (velkostOrganizacie), "00" when not known. */
  employees: string | null
  /** The latest regular or extraordinary statements filed: their period and the name of their template. */
  latest: { from: string; to: string; template: string } | null
}

/** Fewer than ten employees: the bands 00 (not known) to 05. */
export const fewEmployees = (code: string | null) => code === null || /^0[0-5]$/.test(code)

/** The band of employees in words. */
export const EMPLOYEE_BANDS: Readonly<Record<string, string>> = {
  '00': 'nezistený počet zamestnancov',
  '01': '0 zamestnancov',
  '02': '1 zamestnanec',
  '03': '2 zamestnanci',
  '04': '3 až 4 zamestnanci',
  '05': '5 až 9 zamestnancov',
}

/** A template name of the ministry's register by its id, kept for the isolate: they never change. */
const templates = new Map<number, string>()

async function ask<T>(fetcher: typeof fetch, path: string): Promise<T | null> {
  try {
    const res = await fetcher(`${RUZ_API}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/**
 * What the register knows of a company: null when it did not answer, 'none' when it knows no such company. Of its
 * statements, the six filed last (the register numbers them as they come) are read, and the latest regular or
 * extraordinary one by its period counts.
 */
export async function ruzProfile(ico: string, fetcher: typeof fetch = fetch): Promise<RuzProfile | 'none' | null> {
  if (!/^\d{8}$/.test(ico)) return null
  const units = await ask<{ id?: number[] }>(fetcher, `/uctovne-jednotky?zmenene-od=2000-01-01&ico=${ico}`)
  if (!units || !Array.isArray(units.id)) return null
  const id = [...units.id].sort((a, b) => b - a)[0]
  if (id === undefined) return 'none'
  const unit = await ask<{ ico?: string; idUctovnychZavierok?: number[]; konsolidovana?: boolean; velkostOrganizacie?: string; datumZalozenia?: string }>(fetcher, `/uctovna-jednotka?id=${id}`)
  if (!unit || (unit.ico && unit.ico !== ico)) return null
  const ids = [...(unit.idUctovnychZavierok ?? [])].sort((a, b) => b - a).slice(0, 6)
  const closings = await Promise.all(ids.map((z) => ask<{ typ?: string; obdobieOd?: string; obdobieDo?: string; idUctovnychVykazov?: number[] }>(fetcher, `/uctovna-zavierka?id=${z}`)))
  if (closings.some((c) => c === null)) return null
  const latest = closings
    .filter((c): c is NonNullable<typeof c> => Boolean(c && /^(Riadna|Mimoriadna)$/.test(c.typ ?? '') && /^\d{4}-\d{2}$/.test(c.obdobieDo ?? '') && c.idUctovnychVykazov?.length))
    .sort((a, b) => (b.obdobieDo ?? '').localeCompare(a.obdobieDo ?? ''))[0]
  let found: RuzProfile['latest'] = null
  if (latest) {
    const report = await ask<{ idSablony?: number }>(fetcher, `/uctovny-vykaz?id=${latest.idUctovnychVykazov?.[0]}`)
    const template = report?.idSablony
    if (typeof template !== 'number') return null
    let name = templates.get(template)
    if (!name) {
      name = (await ask<{ nazov?: string }>(fetcher, `/sablona?id=${template}`))?.nazov?.trim()
      if (!name) return null
      templates.set(template, name)
    }
    found = { from: latest.obdobieOd ?? '', to: latest.obdobieDo ?? '', template: name }
  }
  return {
    founded: /^\d{4}-\d{2}-\d{2}/.test(unit.datumZalozenia ?? '') ? (unit.datumZalozenia ?? '').slice(0, 10) : null,
    consolidated: unit.konsolidovana === true,
    employees: unit.velkostOrganizacie ?? null,
    latest: found,
  }
}
