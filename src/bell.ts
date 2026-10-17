// Every email Firmony sends to a client or to its team is a doorbell. His word of 13 October 2026: "nechcem žiadnu
// komunikáciu mailom ... všetko v našom uzamknutom ekosystéme". A doorbell says that something waits in the app and
// links to it, and carries nothing else: no message, no amount, no supplier, no name of a person, no personal data.
// What it announces is read after signing in. Three emails carry what they must: the sign-in link (the key to the
// door), an invitation (who invites, so that it is not taken for phishing) and an invoice a client sends to its own
// customer, who has no account with us. People who are not clients yet (a request from the site, the link to the
// contract) get the two emails of the site, since they have no account to read anything in.
//
// A doorbell is rung once for what it announces (its key in the outbox); for messages, once for each batch the other
// side has not read yet (the callers look at `seen_at`), so five messages in a row are one email.
import { BRAND, TEAM } from './config'
import { queueStatement } from './mail'

export interface Bell {
  subject: string
  body: string
}

function ring(subject: string, lead: string, link: string, after: string[] = []): Bell {
  return {
    subject: `${BRAND.name}: ${subject}`,
    body: ['Dobrý deň,', '', lead, '', link, '', ...after, ...(after.length > 0 ? [''] : []), `Na tento e-mail neodpovedajte, všetko vybavíte v aplikácii ${BRAND.name}.`].join('\n'),
  }
}

/** The outbox row of a doorbell: once for each kind, thing and person. */
export function ringStatement(db: D1Database, kind: string, about: string, to: string, b: Bell): D1PreparedStatement {
  return queueStatement(db, { key: `bell:${kind}:${about}:${to.toLowerCase()}`, to, subject: b.subject, body: b.body })
}

const days = `platí ${TEAM.welcomeDays} dní`

export const bell = {
  // To the people of a client's company.
  answer: (link: string) => ring('máte novú správu', 'vo Firmony na Vás čaká nová správa od účtovníčky. Prečítate si ju po prihlásení:', link),
  missing: (link: string, settings: string) =>
    ring('k platbám chýbajú doklady', 'k niektorým platbám ešte chýbajú doklady. Ktoré to sú, uvidíte po prihlásení:', link, [`Pripomienky vypnete tu: ${settings}`]),
  monthly: (month: string, by: string, link: string, settings: string) =>
    ring(`doklady za ${month} do ${by}`, `do ${by} potrebujeme doklady za ${month} a k niektorým platbám ešte chýbajú. Uvidíte ich po prihlásení:`, link, [`Pripomienky vypnete tu: ${settings}`]),
  bank: (link: string) => ring('obnovte prístup k banke', 'prístup Firmony k Vašej banke čoskoro vyprší. Obnovíte ho po prihlásení, trvá to minútu:', link),
  statement: (month: string, link: string, settings: string) =>
    ring(`výpis z banky za ${month}`, `do Firmony ešte neprišiel výpis z banky za ${month}. Pridáte ho po prihlásení, trvá to minútu:`, link, [`Pripomienky vypnete tu: ${settings}`]),
  statementConfirm: (link: string) => ring('potvrďte účet z výpisu', 'do Firmony prišiel výpis z účtu, ktorý u Vás ešte nemáme. Po prihlásení potvrďte, či je to účet Vašej firmy:', link),
  contract: (link: string) =>
    ring('zmluva je uzavretá', `zmluva je uzavretá, ďakujeme za dôveru. Zmluvu, obchodné podmienky a prvé kroky nájdete v aplikácii. Prihláste sa týmto odkazom (${days}):`, link),
  welcome: (link: string) => ring('vitajte', `Vaša firma je pripravená vo Firmony. Prihláste sa týmto odkazom (${days}):`, link),
  invoice: (link: string) => ring('nová faktúra od Firmony', 'vo Firmony na Vás čaká nová faktúra za naše služby. Nájdete ju po prihlásení:', link),
  invoiceOverdue: (link: string) => ring('faktúra po splatnosti', 'faktúru za naše služby od Vás zatiaľ nevidíme zaplatenú. Podrobnosti nájdete po prihlásení:', link),

  // To the team.
  teamMessage: (link: string) => ring('nová správa od klienta', 'vo Firmony čaká nová správa od klienta:', link),
  teamPoa: (link: string) => ring('plná moc na overenie', 'klient nahral plnú moc. Overte ju a podajte ju na úrady:', link),
  teamTakeover: (link: string) => ring('podklady od doterajšej účtovníčky', 'klient nahral podklady od doterajšej účtovníčky. Prevezmite ich:', link),
  teamDeclaration: (link: string) => ring('údaje klienta na overenie', 'klient vyplnil údaje pre zákon proti praniu špinavých peňazí. Overte ich:', link),
  teamReport: (link: string) => ring('interné oznámenie', 'vo Firmony čaká interné oznámenie neobvyklej obchodnej operácie na posúdenie:', link),
  teamContract: (link: string) => ring('nová zmluva', 'klient uzavrel zmluvu online. Jeho prvé kroky a účtovníčku nájdete tu:', link),
  teamRenew: (link: string) => ring('nový odkaz na zmluvu', 'konateľ žiada nový odkaz na zmluvu, platnosť toho predchádzajúceho vypršala:', link),
  teamRequest: (link: string) => ring('nová žiadosť z webu', 'na webe prišla nová žiadosť:', link),
  teamNotice: (link: string) => ring('výpoveď zmluvy', 'klient vypovedal zmluvu alebo výpoveď vzal späť:', link),
  teamBilling: (month: string, link: string) => ring(`faktúry klientom za ${month}`, `faktúry klientom za ${month} sú pripravené. Skontrolujte ich a vystavte:`, link),
  teamStatement: (link: string) => ring('výpis na kontrolu', 'výpis z banky klienta nenadväzuje na predchádzajúci, preto sme ho nezaúčtovali. Pozrite sa naň:', link),
}

/** Everything a doorbell may say, for the checks: no other text reaches a mailbox of a client or of the team. */
export const BELL_KINDS = Object.keys(bell) as (keyof typeof bell)[]
