import { pdfText, type PdfBlock } from '../app/pdf'
import type { Declaration, Person } from '../app/aml'
import type { Company } from '../app/store'
import type { Order } from '../order'
import { sha256Hex } from '../db'
import { orderFacts, companyFacts } from './model'
import { BRAND, OPERATOR, planById } from '../config'
import { formatEur } from '../format'
import { AML_NO_CONSENT } from './consent'

export const declarationFingerprint = (facts: unknown, declaration: Declaration) => sha256Hex(JSON.stringify({ company: facts, declaration }))
/**
 * The declaration as a PDF: to sign with a qualified signature, or (`inPerson`) as filled in by the director at a meeting,
 * where the designated person verifies the identification in person and this PDF is kept as what was declared.
 */
export async function declarationPdf(order: Order | Company, d: Declaration, inPerson = false): Promise<string> {
  const facts = 'company' in order ? orderFacts(order) : companyFacts(order)
  const name = 'company' in order ? order.company : order.name
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Vyhlásenie: Kto stojí za firmou' },
    { kind: 'text', text: `${name}, IČO ${order.ico}, ${order.address ?? ''}` },
    { kind: 'text', text: 'Identifikačné údaje podľa § 7 a § 10 zákona č. 297/2008 Z. z., v znení účinnom od 17. 8. 2026.' },
  ]
  const person = (title: string, p: Person) => blocks.push({ kind: 'heading', text: title },
    { kind: 'text', text: `Meno a priezvisko: ${p.name}. ${p.birthNumber ? `Rodné číslo: ${p.birthNumber}` : `Dátum narodenia: ${p.birthDate}`}.` },
    { kind: 'text', text: `Pobyt: ${p.address}, krajina ${p.residenceCountry ?? ''}. Štátna príslušnosť: ${p.nationality}, kódy ${p.citizenships ?? ''}. PEP: ${p.pep ? 'áno' : 'nie'}.` })
  person('Osoba konajúca za firmu', d.director)
  blocks.push({ kind: 'text', text: `Doklad totožnosti: ${d.director.idKind}, ${d.director.idNumber}.` })
  if (d.kuv === 'self' || d.kuv === 'with') person('Konečný užívateľ výhod: osoba konajúca za firmu', d.director)
  d.owners.forEach((p, i) => { person(`Ďalší konečný užívateľ výhod ${i + 1}`, p); blocks.push({ kind: 'text', text: `Podiel alebo spôsob kontroly: ${p.share}.` }) })
  blocks.push({ kind: 'heading', text: 'Činnosť a pôvod prostriedkov' },
    { kind: 'text', text: `Činnosť: ${d.activity}. Pôvod príjmov: ${d.income}. Očakávaný obrat: ${d.turnover}.` },
    { kind: 'text', text: `Intenzívne používanie hotovosti: ${d.cash ? 'áno' : 'nie'}. Pravidelní partneri mimo EÚ: ${d.abroad ? 'áno' : 'nie'}, ${d.abroadWhere}. Krajiny partnerov: ${d.partnerCountries ?? ''}.` },
    { kind: 'text', text: `Skutočné miesto činnosti: ${d.businessAtSeat ? order.address ?? 'sídlo spoločnosti' : d.businessAddress ?? ''}. Krajiny sídla a prevádzkarní: ${d.businessCountries ?? ''}.` },
    { kind: 'text', text: `Firma koná vo vlastnom mene a na vlastný účet: ${d.ownBehalf ? 'áno' : 'nie'}.` })
  if (!d.ownBehalf && d.principal) blocks.push({ kind: 'text', text: `Osoba, v ktorej mene firma koná: ${d.principal.name}, ${d.principal.kind === 'company' ? `IČO ${d.principal.ico}, sídlo ${d.principal.address}` : d.principal.birthNumber ? `rodné číslo ${d.principal.birthNumber}` : `dátum narodenia ${d.principal.birthDate}`}.` })
  const plan = d.contract ? planById(d.contract.plan) : null
  if (d.contract && plan) blocks.push({ kind: 'heading', text: 'Prijatie ponuky' },
    { kind: 'text', text: `Ako osoba konajúca za firmu prijímam ponuku služby Firmony spoločnosti ${OPERATOR.name}, IČO ${OPERATOR.companyId}: balík ${plan.name} za ${formatEur(plan.price * 100)} mesačne bez DPH, prvý mesiac služby ${d.contract.startOn.slice(5, 7)}/${d.contract.startOn.slice(0, 4)}, podľa obchodných podmienok vo verzii ${d.contract.terms} (${BRAND.origin}/podmienky).` },
    { kind: 'text', text: 'Zmluva vznikne až po dokončení overenia podľa § 8 ods. 2 zákona č. 297/2008 Z. z., keď ju potvrdíte na stránke objednávky, a iba v tomto znení. Inú ponuku, iný balík alebo iný začiatok toto vyhlásenie nepokrýva.' })
  blocks.push({ kind: 'heading', text: 'Potvrdenie' },
    { kind: 'text', text: `Záväzne vyhlasujem, že uvedené údaje sú pravdivé a úplné. Zmenu oznámim službe Firmony bez zbytočného odkladu.${d.contract ? '' : ' Toto vyhlásenie nie je uzavretím zmluvy o účtovných službách.'}` },
    { kind: 'text', text: AML_NO_CONSENT },
    { kind: 'text', text: `Odtlačok údajov SHA-256: ${await declarationFingerprint(facts, d)}` },
    { kind: 'text', text: inPerson
      ? 'Vyhlásenie vyplnila osoba konajúca za firmu v aplikácii Firmony na osobnom stretnutí. Jej totožnosť overil poskytovateľ za jej fyzickej prítomnosti podľa dokladu totožnosti (§ 8 ods. 1 písm. a) zákona č. 297/2008 Z. z.).'
      : 'Dokument podpíšte kvalifikovaným elektronickým podpisom. Podpísaný súbor nahrajte vo formulári, z ktorého ste vyhlásenie stiahli.' })
  return pdfText({ title: 'Firmony: vyhlásenie pred uzavretím zmluvy', header: { left: 'Firmony | Vyhlásenie', right: `IČO ${order.ico}` }, blocks })
}
