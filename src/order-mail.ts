// The emails of the order: the link to the contract (to the address that was typed, carrying nothing a stranger
// typed), the confirmation once a director concluded it (with the terms in full, as the durable copy of what was
// accepted), and the note to us. Plain text, not typeset.
import { BRAND, CLOSING_PRICE, OPERATOR, PAYROLL_PRICE, REPLY_WITHIN, TERMS_VERSION, planById } from './config'
import { formatEur } from './format'
import { longDate, termsText } from './content/terms'

const plain = (text: string) => text.replace(/ /g, ' ')
const eur = (euros: number) => plain(formatEur(euros * 100))

const imprint = () => `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, zapísanej ${OPERATOR.registeredIn}.`

export function orderLinkMail(company: string, plan: string, link: string, days: number): { subject: string; body: string } {
  const chosen = planById(plan)
  return {
    subject: `${BRAND.name}: zmluva pre ${company}`,
    body: [
      'Dobrý deň,',
      '',
      `ďakujeme za záujem o ${BRAND.name}. Zmluvu o vedení účtovníctva uzavriete online, trvá to minútu:`,
      '',
      link,
      '',
      `Firma: ${company}`,
      ...(chosen ? [`Balík: ${chosen.name}, ${eur(chosen.price)} mesačne bez DPH`] : []),
      '',
      `Uzavrieť ju môže konateľ firmy. Odkaz platí ${days} dní.`,
      '',
      `Ak máte otázky, stačí odpovedať na tento e-mail. Ozveme sa ${REPLY_WITHIN}.`,
      '',
      'Christian Juhás',
      BRAND.name,
      '',
      imprint(),
    ].join('\n'),
  }
}

export interface ContractFacts {
  company: string
  ico: string
  plan: string
  priceCents: number
  startOn: string
  signedBy: string
  at: string
  inbox: string
  link: string
}

export function contractMail(f: ContractFacts): { subject: string; body: string } {
  const plan = planById(f.plan)
  return {
    subject: `${BRAND.name}: zmluva je uzavretá`,
    body: [
      'Dobrý deň,',
      '',
      `zmluva o vedení účtovníctva je uzavretá. Ďakujeme za dôveru.`,
      '',
      `Firma: ${f.company}, IČO ${f.ico}`,
      `Balík: ${plan?.name ?? f.plan}, ${plain(formatEur(f.priceCents))} mesačne bez DPH`,
      `Mzdy: ${eur(PAYROLL_PRICE)} mesačne za človeka`,
      `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne`,
      `Začiatok: ${longDate(f.startOn)}`,
      `Uzavrel(a): ${f.signedBy}, konateľ, ${f.at}`,
      `Znenie obchodných podmienok: ${TERMS_VERSION}`,
      '',
      'Čo ďalej:',
      `1. Prihláste sa do aplikácie týmto odkazom (platí 7 dní): ${f.link}`,
      '2. Podpíšte plnú moc cez eID, návod je v aplikácii.',
      '3. Prepojte banku, aby platby chodili samy.',
      '4. Ak meníte účtovníčku, v aplikácii nájdete hotovú výpoveď.',
      '',
      `Faktúry, ktoré Vám chodia e-mailom, môžete preposielať na ${f.inbox}.`,
      '',
      'Christian Juhás',
      BRAND.name,
      '',
      imprint(),
      '',
      '---',
      '',
      termsText(),
    ].join('\n'),
  }
}

export function ownerContractMail(f: ContractFacts & { email: string; requestPerson: string }): { subject: string; body: string } {
  const plan = planById(f.plan)
  return {
    subject: `Nová zmluva: ${f.company}`,
    body: [
      `Nová zmluva cez web ${BRAND.name}`,
      '',
      `Firma: ${f.company}, IČO ${f.ico}`,
      `Balík: ${plan?.name ?? f.plan}, ${plain(formatEur(f.priceCents))} mesačne`,
      `Začiatok: ${longDate(f.startOn)}`,
      `Uzavrel(a): ${f.signedBy}, ${f.at}`,
      `E-mail: ${f.email}`,
      `Žiadosť poslal(a): ${f.requestPerson}`,
      '',
      'Ďalej: priradiť účtovníčku, overiť plnú moc a identifikáciu podľa zákona proti praniu špinavých peňazí.',
    ].join('\n'),
  }
}
