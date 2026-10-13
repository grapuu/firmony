// The email of the order: the link to the contract, to the address that was typed, carrying nothing a stranger
// typed. Plain text, not typeset. Once the contract is concluded, nothing more of it goes by email (his word of
// 13 October 2026): the client gets a doorbell with the sign-in link (src/bell.ts) and reads the contract and its
// terms in the app, at /app/zmluva.
import { BRAND, OPERATOR, REPLY_WITHIN, planById } from './config'
import { formatEur } from './format'

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
