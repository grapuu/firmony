// The notes to the financial statements (poznámky, 17 October 2026): a draft from the books that the accountant reads,
// completes in the closing's form and attaches to the statements in eDane as a PDF (pdf.ts). Pure: the closing's view
// and what she typed in, in; the document, out.
//
// What the notes hold, read on 17 October 2026 (the measures as published, the texts of dauc.sk and the Financial
// Administration's guidance): a micro entity's (Poznámky Úč MUJ 3-01, MF/15464/2013-74 as amended) Article I general
// information (the name and seat, the group, the average employees), II the accounting principles and methods (going
// concern, valuation, the depreciation plan, changes, grants, corrections of errors), III what explains the statements
// (unusual items, liabilities due after five years and secured ones, own shares, the capital fund from contributions,
// loans and guarantees to the members of the bodies, what is off the balance sheet, services of public interest); a
// small entity's (Poznámky Úč POD 3-01, MF/23378/2014-74 as amended) Articles I general information (the approval of
// the statements before, the legal reason, the group, the employees), II the bodies, III the policies, IV what
// explains the statements, V other assets and liabilities, VI events after the balance-sheet day, VII other
// information; a large entity's (MF/23377/2014-74) the same and the tables of its figures, the cash flows among them.
// Every page carries the form's name at the top left and IČO and DIČ at the top right; amounts are in whole euros;
// what has no content is left out. A statement the books cannot know is written as a company without it would, and
// the closing's page says which of them to check (`NOTE_CHECKS`).
import { textDay } from './booking'
import type { Asset } from './assets'
import type { EntitySize, Lines, Statements } from './closing'
import type { PdfBlock, PdfDocument } from './pdf'

/** What the accountant types for the notes (closings.inputs). */
export interface NotesInputs {
  /** The day the statements of the year before were approved, when they were not closed here. */
  priorApproved: string | null
  /** Events after the balance-sheet day; the proposal to distribute the profit or settle the loss; anything else. */
  events: string
  profit: string
  other: string
}

export const EMPTY_NOTES: NotesInputs = { priorApproved: null, events: '', profit: '', other: '' }

export interface NotesSource {
  company: { name: string; ico: string | null; dic: string | null; address: string | null; registerLine: string | null }
  year: number
  /** The first day of the period (the founding in a company's first one). */
  from: string
  size: EntitySize
  statements: Statements
  previous: Statements | null
  employees: number
  nace: string
  activity: string
  /** The day the year before's statements were approved, as its closing here has it. */
  priorApproved: string | null
  assets: readonly Pick<Asset, 'account' | 'bookMonths' | 'taxMethod'>[]
  tax: { rate: number; current: number }
  deferred: { on: boolean; asset: number; liability: number; rate: number }
  audit: 'yes' | 'maybe' | 'no'
  notes: NotesInputs
  /** How the company keeps its stock (stock.ts), when it does. */
  stock?: { method: 'A' | 'B'; valuation: 'average' | 'fifo' } | null
}

/** What the draft states that only the accountant can confirm: the closing's page lists them beside the download. */
export const NOTE_CHECKS = ['group', 'bodies', 'offBalance', 'longLiabilities', 'events', 'priorApproved'] as const
export type NoteCheck = (typeof NOTE_CHECKS)[number]

/** Whole euros as the notes write them: "8 490 €", "−5 €". */
const eur = (cents: number): string => `${cents < 0 ? '−' : ''}${String(Math.round(Math.abs(cents) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`
/** Whole euros already rounded (the statements' euro lines). */
const whole = (n: number): string => eur(n * 100)

/** A year before taken over from the column of the period before: total assets net without their gross. */
const netOnly = (s: Statements): boolean => s.grossEur.r001 === undefined && (s.balanceEur.r001 ?? 0) !== 0

/** The rows of the balance sheet (whole euros) and their sum, from either form's lines. */
const row = (lines: Lines | undefined, key: string): number => lines?.[key] ?? 0

/** What the draft cannot know and says as a company without it would, with whether the books show a reason to look. */
export function noteChecks(src: NotesSource): NoteCheck[] {
  const out: NoteCheck[] = ['group', 'bodies', 'offBalance']
  const loans = src.statements.form === 'pod' ? row(src.statements.balanceEur, 'r121') + row(src.statements.balanceEur, 'r102') : row(src.statements.balanceEur, 'r35') + row(src.statements.balanceEur, 'r37')
  if (loans > 0) out.push('longLiabilities')
  if (src.notes.events.trim() === '') out.push('events')
  if (src.size !== 'micro' && !(src.notes.priorApproved ?? src.priorApproved) && src.previous) out.push('priorApproved')
  return out
}

/** The depreciation plan as the register has it, in a sentence. */
function depreciationPlan(src: NotesSource): string {
  if (src.assets.length === 0) {
    const fixed = src.statements.form === 'pod' ? row(src.statements.grossEur, 'r002') : row(src.statements.balanceEur, 'r02')
    return fixed === 0
      ? 'Účtovná jednotka nemá dlhodobý majetok, ktorý sa odpisuje.'
      : 'Dlhodobý majetok sa odpisuje podľa odpisového plánu rovnomerne počas predpokladanej doby jeho používania, od mesiaca, v ktorom bol zaradený do užívania.'
  }
  const asTax = src.assets.filter((a) => a.bookMonths === null && !a.account.startsWith('01'))
  const own = [...new Set(src.assets.filter((a) => a.bookMonths !== null || a.account.startsWith('01')).map((a) => a.bookMonths ?? 36))].sort((a, b) => a - b)
  const parts: string[] = []
  if (asTax.length > 0) {
    const accelerated = asTax.some((a) => a.taxMethod === 'accelerated')
    parts.push(`hmotný majetok v ročných sumách daňových odpisov podľa § 26 až 28 zákona o dani z príjmov (${accelerated ? 'rovnomerne a zrýchlene' : 'rovnomerne'}), rozvrhnutých na mesiace roka`)
  }
  if (own.length > 0) parts.push(`${asTax.length > 0 ? 'ostatný majetok' : 'majetok'} rovnomerne počas ${own.join(', ')} mesiacov`)
  return `Dlhodobý majetok sa odpisuje podľa odpisového plánu od mesiaca, v ktorom bol zaradený do užívania: ${parts.join('; ')}. Majetok s obstarávacou cenou do 1 700 € (hmotný) a 2 400 € (nehmotný) sa účtuje do nákladov.`
}

/** The valuation of assets and liabilities (§ 24 to 28 of the Act on Accounting), as a company keeps it here. */
function valuation(src: NotesSource): string[] {
  const out = [
    'Nakúpený dlhodobý majetok a zásoby sa oceňujú obstarávacou cenou, ktorá zahŕňa cenu obstarania a náklady s obstaraním súvisiace; majetok vytvorený vlastnou činnosťou vlastnými nákladmi.',
    ...(src.stock
      ? [
          `O zásobách sa účtuje spôsobom ${src.stock.method === 'A' ? 'A (priebežne)' : 'B (stav zásob podľa inventúry ku dňu, ku ktorému sa zostavuje účtovná závierka)'}; úbytok zásob sa oceňuje ${src.stock.valuation === 'fifo' ? 'metódou FIFO, prvá cena na ocenenie prírastku sa použije ako prvá na ocenenie úbytku' : 'váženým aritmetickým priemerom'} (§ 25 ods. 5 zákona o účtovníctve).`,
        ]
      : []),
    'Pohľadávky sa pri vzniku oceňujú menovitou hodnotou, pochybné pohľadávky sa znižujú opravnými položkami.',
    'Krátkodobý finančný majetok a peňažné prostriedky sa oceňujú menovitou hodnotou.',
    'Záväzky sa pri vzniku oceňujú menovitou hodnotou, rezervy očakávanou výškou záväzku.',
    'Majetok a záväzky v cudzej mene sa prepočítavajú na eurá referenčným výmenným kurzom Európskej centrálnej banky v deň účtovného prípadu a ku dňu, ku ktorému sa zostavuje účtovná závierka.',
  ]
  if (src.size !== 'micro')
    out.push(
      src.deferred.on
        ? `O odloženej dani z príjmov sa účtuje z dočasných rozdielov medzi účtovnou hodnotou majetku a záväzkov a ich daňovou základňou sadzbou ${src.deferred.rate} % (§ 10 postupov účtovania pre podnikateľov).`
        : 'O odloženej dani z príjmov účtovná jednotka neúčtuje.',
    )
  return out
}

const numbered = (items: string[]): PdfBlock[] => items.map((text, i) => ({ kind: 'text', text: `${i + 1}. ${text}` }))

/** The general information: the name, seat and activity, as every size begins. */
function identity(src: NotesSource): string {
  const c = src.company
  const activity = src.activity ? ` Hlavná činnosť: ${src.activity}${src.nace ? ` (SK NACE ${src.nace})` : ''}.` : ''
  return `${c.name}, ${c.address ?? ''}${c.registerLine ? `, ${c.registerLine}` : ''}.${activity}`
}

/** The draft notes of a year, by the company's size group. */
export function notesDocument(src: NotesSource): PdfDocument {
  const c = src.company
  const pod = src.size !== 'micro'
  const st = src.statements
  const b = st.balanceEur
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Poznámky k účtovnej závierke' },
    { kind: 'text', text: `${c.name}, za účtovné obdobie od ${textDay(src.from)} do ${textDay(`${src.year}-12-31`)}. Sumy sú v celých eurách.` },
  ]
  const own413 = pod ? row(b, 'r086') : row(b, 'r29')
  const ownShares = pod ? row(b, 'r069') : 0
  const goodwill = pod ? row(st.grossEur, 'r007') : 0
  const longLoans = pod ? row(b, 'r121') : row(b, 'r37')
  const liabilities = longLoans > 0 ? `Dlhodobé bankové úvery sú ${whole(longLoans)}; ich zostatková doba splatnosti a zabezpečenie sú uvedené v úverových zmluvách.` : 'Účtovná jednotka nemá záväzky so zostatkovou dobou splatnosti dlhšou ako päť rokov ani záväzky zabezpečené záložným právom alebo inou formou zabezpečenia.'
  const priorApproved = src.notes.priorApproved ?? src.priorApproved
  const events = src.notes.events.trim() || 'Po dni, ku ktorému sa zostavuje účtovná závierka, do dňa jej zostavenia nenastali udalosti, ktoré by mali významný vplyv na verné zobrazenie skutočností, ktoré sú predmetom účtovníctva.'
  if (!pod) {
    blocks.push(
      { kind: 'heading', text: 'Čl. I Všeobecné informácie' },
      ...numbered([`Obchodné meno a sídlo: ${identity(src)}`, 'Účtovná jednotka nie je súčasťou konsolidovaného celku.', `Priemerný prepočítaný počet zamestnancov počas účtovného obdobia: ${String(src.employees).replace('.', ',')}.`]),
      { kind: 'heading', text: 'Čl. II Informácie o účtovných zásadách a účtovných metódach' },
      ...numbered([
        'Účtovná závierka je zostavená za predpokladu nepretržitého pokračovania činnosti účtovnej jednotky.',
        `Spôsob oceňovania: ${valuation(src).join(' ')}`,
        depreciationPlan(src),
        'Účtovné zásady a účtovné metódy sa v porovnaní s predchádzajúcim účtovným obdobím nezmenili.',
        'Účtovná jednotka v účtovnom období neprijala dotácie.',
        'V účtovnom období neboli opravené významné chyby minulých účtovných období.',
      ]),
      { kind: 'heading', text: 'Čl. III Informácie, ktoré vysvetľujú a dopĺňajú položky súvahy a výkazu ziskov a strát' },
      ...numbered([
        'V účtovnom období neboli výnosy ani náklady mimoriadneho rozsahu alebo výskytu.',
        liabilities,
        'Účtovná jednotka nemá vlastné akcie ani vlastné obchodné podiely.',
        own413 > 0 ? `Účtovná jednotka vytvorila kapitálový fond z príspevkov alebo ostatné kapitálové fondy vo výške ${whole(own413)}.` : 'Účtovná jednotka nevytvorila kapitálový fond z príspevkov.',
        'Členom štatutárnych, dozorných a iných orgánov neboli poskytnuté záruky, pôžičky ani iné plnenia.',
        'Účtovná jednotka nemá významné finančné povinnosti, ktoré sa nevykazujú v súvahe, ani podmienené záväzky.',
        'Účtovná jednotka nemá výlučné ani osobitné práva poskytovať služby vo všeobecnom hospodárskom záujme.',
      ]),
    )
  } else {
    blocks.push(
      { kind: 'heading', text: 'Čl. I Všeobecné informácie' },
      ...numbered([
        `Názov a sídlo, opis činnosti: ${identity(src)}`,
        ...(priorApproved ? [`Účtovná závierka za predchádzajúce účtovné obdobie bola schválená ${textDay(priorApproved)}.`] : []),
        `Účtovná závierka je zostavená ako riadna individuálna účtovná závierka podľa § 17 ods. 6 zákona o účtovníctve za ${src.size === 'large' ? 'veľkú' : 'malú'} účtovnú jednotku.${src.audit === 'yes' ? ' Účtovná závierka podlieha overeniu audítorom (§ 19 zákona o účtovníctve).' : ''}`,
        'Účtovná jednotka nie je súčasťou konsolidovaného celku.',
        `Priemerný prepočítaný počet zamestnancov počas účtovného obdobia: ${String(src.employees).replace('.', ',')}.`,
      ]),
      { kind: 'heading', text: 'Čl. II Informácie o orgánoch účtovnej jednotky' },
      { kind: 'text', text: 'Členom štatutárnych, dozorných a iných orgánov neboli poskytnuté záruky, iné zabezpečenia ani pôžičky a nepoužili finančné prostriedky ani iné plnenia na súkromné účely.' },
      { kind: 'heading', text: 'Čl. III Informácie o prijatých postupoch' },
      ...numbered([
        'Účtovná závierka je zostavená za predpokladu nepretržitého pokračovania činnosti účtovnej jednotky.',
        'Účtovné zásady a účtovné metódy sa v porovnaní s predchádzajúcim účtovným obdobím nezmenili.',
        'Účtovná jednotka nemá transakcie, ktoré sa nevykazujú v súvahe.',
        `Spôsob oceňovania: ${valuation(src).join(' ')} ${depreciationPlan(src)}`,
        'V účtovnom období neboli opravené významné chyby minulých účtovných období.',
      ]),
      { kind: 'heading', text: 'Čl. IV Informácie, ktoré vysvetľujú a dopĺňajú súvahu a výkaz ziskov a strát' },
      ...numbered([
        goodwill > 0 ? `Goodwill v obstarávacej cene ${whole(goodwill)} sa odpisuje podľa odpisového plánu.` : 'Účtovná jednotka nemá goodwill ani záporný goodwill.',
        'Účtovná jednotka nemá deriváty.',
        liabilities,
        ownShares > 0 ? `Vlastné akcie a vlastné obchodné podiely sú ${whole(ownShares)}.` : 'Účtovná jednotka nemá vlastné akcie ani vlastné obchodné podiely.',
        own413 > 0 ? `Ostatné kapitálové fondy sú ${whole(own413)}.` : 'Účtovná jednotka nevytvorila kapitálový fond z príspevkov.',
        'V účtovnom období neboli výnosy ani náklady výnimočného rozsahu alebo výskytu.',
      ]),
      { kind: 'heading', text: 'Čl. V Informácie o iných aktívach a iných pasívach' },
      { kind: 'text', text: 'Účtovná jednotka nemá podmienený majetok ani podmienené záväzky, významné finančné povinnosti, ktoré sa nevykazujú v súvahe, ani významné položky podsúvahových účtov.' },
      { kind: 'heading', text: 'Čl. VI Informácie o udalostiach, ktoré nastali po dni, ku ktorému sa zostavuje účtovná závierka' },
      { kind: 'text', text: events },
      { kind: 'heading', text: 'Čl. VII Ostatné informácie' },
      { kind: 'text', text: 'Účtovná jednotka nemá výlučné ani osobitné práva poskytovať služby vo všeobecnom hospodárskom záujme.' },
    )
    if (src.size === 'large') blocks.push(...largeTables(src))
  }
  if (src.notes.profit.trim()) blocks.push({ kind: 'heading', text: 'Návrh na rozdelenie zisku alebo vyrovnanie straty' }, { kind: 'text', text: src.notes.profit.trim() })
  // A micro entity's notes do not ask for the events after the balance-sheet day: they stand when she wrote them.
  if (!pod && src.notes.events.trim()) blocks.push({ kind: 'heading', text: 'Udalosti po dni, ku ktorému sa zostavuje účtovná závierka' }, { kind: 'text', text: src.notes.events.trim() })
  if (src.notes.other.trim()) blocks.push({ kind: 'heading', text: 'Ďalšie informácie' }, { kind: 'text', text: src.notes.other.trim() })
  return {
    title: `Poznámky k účtovnej závierke ${src.year}: ${c.name}`,
    header: { left: pod ? 'Poznámky Úč POD 3-01' : 'Poznámky Úč MUJ 3-01', right: `IČO ${c.ico ?? ''}${c.dic ? `   DIČ ${c.dic}` : ''}` },
    blocks,
  }
}

/** A large entity's tables: the fixed assets, the receivables and liabilities, equity, revenues, the income tax, the cash flows. */
function largeTables(src: NotesSource): PdfBlock[] {
  const st = src.statements
  const pr = src.previous
  // The year before taken over from the column of the period before carries only the net: its gross and correction are unknown, not nought.
  const grossKnown = !pr || !netOnly(pr)
  const start = (lines: Record<string, number> | undefined, r: string) => (grossKnown ? whole(row(lines, r)) : '')
  const labels: Record<string, string> = {
    r003: 'Dlhodobý nehmotný majetok', r004: 'Aktivované náklady na vývoj', r005: 'Softvér', r006: 'Oceniteľné práva', r007: 'Goodwill', r008: 'Ostatný dlhodobý nehmotný majetok', r009: 'Obstarávaný dlhodobý nehmotný majetok', r010: 'Preddavky na dlhodobý nehmotný majetok',
    r011: 'Dlhodobý hmotný majetok', r012: 'Pozemky', r013: 'Stavby', r014: 'Samostatné hnuteľné veci a súbory', r015: 'Pestovateľské celky trvalých porastov', r016: 'Základné stádo a ťažné zvieratá', r017: 'Ostatný dlhodobý hmotný majetok', r018: 'Obstarávaný dlhodobý hmotný majetok', r019: 'Preddavky na dlhodobý hmotný majetok', r020: 'Opravná položka k nadobudnutému majetku',
    r021: 'Dlhodobý finančný majetok',
  }
  const fixedRows = Object.keys(labels).filter((r) => r === 'r003' || r === 'r011' || r === 'r021' || row(st.grossEur, r) !== 0 || row(pr?.grossEur, r) !== 0)
  const sumRow = (r: string) => r === 'r003' || r === 'r011' || r === 'r021'
  const out: PdfBlock[] = [
    { kind: 'heading', text: 'Čl. VIII Doplňujúce údaje k súvahe a výkazu ziskov a strát' },
    { kind: 'text', text: '1. Dlhodobý majetok: obstarávacia cena (brutto), oprávky a opravné položky (korekcia) a zostatková hodnota (netto) na začiatku a na konci účtovného obdobia.' },
    {
      kind: 'table',
      columns: [
        { label: 'Položka', width: 34 },
        { label: 'Brutto na začiatku', width: 11, align: 'right' },
        { label: 'Brutto na konci', width: 11, align: 'right' },
        { label: 'Korekcia na začiatku', width: 11, align: 'right' },
        { label: 'Korekcia na konci', width: 11, align: 'right' },
        { label: 'Netto na začiatku', width: 11, align: 'right' },
        { label: 'Netto na konci', width: 11, align: 'right' },
      ],
      rows: fixedRows.map((r) => ({
        bold: sumRow(r),
        cells: [labels[r] as string, start(pr?.grossEur, r), whole(row(st.grossEur, r)), start(pr?.fixEur, r), whole(row(st.fixEur, r)), whole(row(pr?.balanceEur, r)), whole(row(st.balanceEur, r))],
      })),
    },
  ]
  const pair = (label: string, key: string, bold = false) => ({ bold, cells: [label, whole(row(st.balanceEur, key)), whole(row(pr?.balanceEur, key))] })
  const twoColumns = (first: string) => [
    { label: first, width: 60 },
    { label: 'Bežné obdobie', width: 20, align: 'right' as const },
    { label: 'Predchádzajúce obdobie', width: 20, align: 'right' as const },
  ]
  out.push(
    { kind: 'text', text: '2. Pohľadávky podľa zostatkovej doby splatnosti a finančné účty.' },
    { kind: 'table', columns: twoColumns('Položka'), rows: [pair('Pohľadávky so zostatkovou dobou splatnosti dlhšou ako jeden rok', 'r041'), pair('Pohľadávky so zostatkovou dobou splatnosti do jedného roka', 'r053'), pair('Krátkodobý finančný majetok', 'r066'), pair('Finančné účty', 'r071')] },
    { kind: 'text', text: '3. Záväzky, rezervy a úvery.' },
    {
      kind: 'table',
      columns: twoColumns('Položka'),
      rows: [pair('Dlhodobé záväzky', 'r102'), pair('Dlhodobé rezervy', 'r118'), pair('Dlhodobé bankové úvery', 'r121'), pair('Krátkodobé záväzky', 'r122'), pair('Krátkodobé rezervy', 'r136'), pair('Bežné bankové úvery', 'r139'), pair('Krátkodobé finančné výpomoci', 'r140'), pair('Záväzky spolu', 'r101', true)],
    },
    { kind: 'text', text: '4. Vlastné imanie.' },
    {
      kind: 'table',
      columns: [
        { label: 'Položka', width: 60 },
        { label: 'Na začiatku obdobia', width: 20, align: 'right' },
        { label: 'Na konci obdobia', width: 20, align: 'right' },
      ],
      rows: (
        [
          ['Základné imanie', 'r081'],
          ['Emisné ážio', 'r085'],
          ['Ostatné kapitálové fondy', 'r086'],
          ['Zákonné rezervné fondy', 'r087'],
          ['Ostatné fondy zo zisku', 'r090'],
          ['Oceňovacie rozdiely z precenenia', 'r093'],
          ['Výsledok hospodárenia minulých rokov', 'r097'],
          ['Výsledok hospodárenia za účtovné obdobie po zdanení', 'r100'],
          ['Vlastné imanie spolu', 'r080'],
        ] as const
      )
        .filter(([, key]) => key === 'r080' || row(st.balanceEur, key) !== 0 || row(pr?.balanceEur, key) !== 0)
        .map(([label, key]) => ({ bold: key === 'r080', cells: [label, whole(row(pr?.balanceEur, key)), whole(row(st.balanceEur, key))] })),
    },
    { kind: 'text', text: '5. Výnosy z hospodárskej činnosti podľa druhov.' },
    {
      kind: 'table',
      columns: twoColumns('Položka'),
      rows: [
        { cells: ['Tržby z predaja tovaru', whole(row(st.profitEur, 'r03')), whole(row(pr?.profitEur, 'r03'))] },
        { cells: ['Tržby z predaja vlastných výrobkov', whole(row(st.profitEur, 'r04')), whole(row(pr?.profitEur, 'r04'))] },
        { cells: ['Tržby z predaja služieb', whole(row(st.profitEur, 'r05')), whole(row(pr?.profitEur, 'r05'))] },
        { bold: true, cells: ['Čistý obrat', whole(row(st.profitEur, 'r01')), whole(row(pr?.profitEur, 'r01'))] },
      ],
    },
  )
  // The income tax: the result before tax, the tax at the rate on it, the tax of the return and the deferred tax.
  const before = row(st.profitEur, 'r56')
  out.push(
    { kind: 'text', text: '6. Daň z príjmov.' },
    {
      kind: 'table',
      columns: [
        { label: 'Položka', width: 70 },
        { label: 'Suma', width: 30, align: 'right' },
      ],
      rows: [
        { cells: ['Výsledok hospodárenia pred zdanením', whole(before)] },
        { cells: [`Teoretická daň sadzbou ${src.tax.rate} %`, eur(Math.max(0, Math.round((before * 100 * src.tax.rate) / 100)))] },
        { cells: ['Daň z príjmov splatná', whole(row(st.profitEur, 'r58'))] },
        { cells: ['Daň z príjmov odložená', whole(row(st.profitEur, 'r59'))] },
        { bold: true, cells: ['Daň z príjmov spolu', whole(row(st.profitEur, 'r57'))] },
        ...(src.deferred.on ? [{ cells: ['Odložená daňová pohľadávka', eur(src.deferred.asset)] }, { cells: ['Odložený daňový záväzok', eur(src.deferred.liability)] }] : []),
      ],
    },
  )
  out.push(...cashFlows(src))
  return out
}

/**
 * The cash flows (indirect method) from the two balance sheets and the result: what operations, investments and
 * financing brought, which together are the change of money and bank accounts. Only with the year before in the books.
 */
export function cashFlowOf(st: Statements, pr: Statements): { operating: number; investing: number; financing: number; start: number; end: number; lines: [string, number][] } {
  const g = (s: Statements, r: string) => row(s.grossEur, r)
  const n = (s: Statements, r: string) => row(s.balanceEur, r)
  const d = (f: (s: Statements) => number) => f(st) - f(pr)
  const result = n(st, 'r100')
  const corrections = d((s) => row(s.fixEur, 'r001'))
  const loansOf = (s: Statements) => n(s, 'r121') + n(s, 'r139') + n(s, 'r140')
  const provisions = d((s) => n(s, 'r118') + n(s, 'r136'))
  const inventories = -d((s) => g(s, 'r034'))
  const receivables = -d((s) => g(s, 'r041') + g(s, 'r053') + g(s, 'r074'))
  const payables = d((s) => n(s, 'r101') - loansOf(s) - n(s, 'r118') - n(s, 'r136') + n(s, 'r141'))
  const operating = result + corrections + provisions + inventories + receivables + payables
  const investing = -d((s) => g(s, 'r002') + g(s, 'r066'))
  const borrowing = d(loansOf)
  const equity = d((s) => n(s, 'r080')) - result
  const financing = borrowing + equity
  const lines: [string, number][] = [
    ['Výsledok hospodárenia po zdanení', result],
    ['Odpisy, opravné položky a ich zmeny', corrections],
    ['Zmena stavu rezerv', provisions],
    ['Zmena stavu zásob', inventories],
    ['Zmena stavu pohľadávok a časového rozlíšenia aktív', receivables],
    ['Zmena stavu záväzkov a časového rozlíšenia pasív', payables],
    ['A. Peňažné toky z prevádzkovej činnosti', operating],
    ['B. Peňažné toky z investičnej činnosti (obstaranie a predaj dlhodobého a krátkodobého finančného majetku)', investing],
    ['Zmena stavu úverov a finančných výpomocí', borrowing],
    ['Vklady do vlastného imania a výplaty z neho (podiely na zisku)', equity],
    ['C. Peňažné toky z finančnej činnosti', financing],
  ]
  return { operating, investing, financing, start: n(pr, 'r071'), end: n(st, 'r071'), lines }
}

function cashFlows(src: NotesSource): PdfBlock[] {
  if (!src.previous || src.previous.form !== 'pod' || netOnly(src.previous)) return [{ kind: 'text', text: '7. Prehľad peňažných tokov: predchádzajúce účtovné obdobie nie je v účtovnej knihe Firmony; prehľad sa zostaví z oboch súváh.' }]
  const cf = cashFlowOf(src.statements, src.previous)
  const bold = new Set(['A. Peňažné toky z prevádzkovej činnosti', 'C. Peňažné toky z finančnej činnosti'])
  return [
    { kind: 'text', text: '7. Prehľad peňažných tokov (nepriama metóda).' },
    {
      kind: 'table',
      columns: [
        { label: 'Položka', width: 74 },
        { label: 'Suma', width: 26, align: 'right' },
      ],
      rows: [
        ...cf.lines.map(([label, value]) => ({ bold: bold.has(label) || label.startsWith('B.'), cells: [label, whole(value)] })),
        { bold: true, cells: ['Čisté zvýšenie alebo zníženie peňažných prostriedkov (A + B + C)', whole(cf.operating + cf.investing + cf.financing)] },
        { cells: ['Peňažné prostriedky na začiatku účtovného obdobia', whole(cf.start)] },
        { bold: true, cells: ['Peňažné prostriedky na konci účtovného obdobia', whole(cf.end)] },
      ],
    },
  ]
}
