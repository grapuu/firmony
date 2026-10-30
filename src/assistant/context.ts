import { now } from '../db'
import { amlToday } from '../aml/retention'
import { autoReviewedSql } from '../aml/auto-review-model'
import { MISSING, getDocument, type Company } from '../app/store'
import { clientDeadlines } from '../app/deadlines'
import { dayName, dayShort, plural } from '../app/copy'
import { companyDeadlines } from '../team/deadlines-store'
import { billRows, tariffForClient } from '../team/billing-store'
import { managedHandover } from '../migration/store'
import { formatEurExact } from '../format'
import { MONEY_DAYS, moneyWindow, payoutVerdict, type MoneyFacts } from '../app/money'
import { readMoney } from '../calc'
import { addDays } from '../app/ending'
import { moneyOutgoings, unpaidIssued, unpaidReceived } from '../app/money-store'
import { assistantAllowed, type AssistantScope } from './store'
import { ASSISTANT_TOPICS, type AssistantAnswer, type AssistantTopic } from './model'

export interface AssistantDocument { id:string; label:string }
export async function assistantDocuments(db:D1Database,s:AssistantScope,selected=''):Promise<AssistantDocument[]> {
  if(!await assistantAllowed(db,s))return []
  const rows=await db.prepare(`SELECT id,number,file_name FROM documents WHERE company_id=? AND deleted_at IS NULL
    AND duplicate_of IS NULL ORDER BY created_at DESC,id LIMIT 20`).bind(s.company).all<{id:string;number:string|null;file_name:string|null}>()
  const documents=rows.results.map(r=>({id:r.id,label:r.number??r.file_name??'Doklad bez čísla'}))
  if(selected&&!documents.some(d=>d.id===selected)){
    const d=await getDocument(db,s.company,selected);if(!d)return []
    documents.unshift({id:d.id,label:d.number??d.fileName??'Vybraný doklad'})
  }
  return await assistantAllowed(db,s)?documents:[]
}

/** All values and links are read by Firmony. The external model receives none of this context. */
/** The verdict paragraphs for a question that names a payout amount; null when the question names none. The amount
 *  is the number nearest to the word "vyplatiť", checked by the same rule as the home page's form, so the assistant
 *  can never disagree with it. Pure: the facts come in, the paragraphs go out. */
export function payoutAskedAnswer(question: string, facts: MoneyFacts): string[] | null {
  if (!/vyplat|výplat/i.test(question)) return null
  const anchor = question.match(/vyplat|výplat/i)!.index ?? 0
  const numbers = [...question.matchAll(/(?:\d{1,3}(?:\s\d{3})+|\d+)(?:[.,]\d{1,2})?/g)]
  if (numbers.length === 0) return null
  numbers.sort((a, b) => Math.abs((a.index ?? 0) - anchor) - Math.abs((b.index ?? 0) - anchor))
  const asked = readMoney(numbers[0]![0])
  if (asked === null || asked <= 0) return null
  const verdict = payoutVerdict(facts, asked)
  if (!verdict.ok && !verdict.known) {
    return ['Na to potrebujeme zostatok na účte. Po prepojení banky alebo pridaní výpisu Vám povieme presne, či si túto sumu môžete vyplatiť.']
  }
  if (verdict.ok) {
    return [`Sumu ${formatEurExact(asked)} si môžete vyplatiť. Po nej ostáva ${formatEurExact(verdict.reserveCents)} na známe záväzky.`]
  }
  return [
    verdict.immediate
      ? `Sumu ${formatEurExact(asked)} by zostatok na účte dnes uniesol, ale známe záväzky by po nej presiahli o ${formatEurExact(verdict.shortCents)}.`
      : `Suma ${formatEurExact(asked)} je vyššia ako zostatok na účte${verdict.shortCents > 0 ? ` a známe záväzky by navyše presiahli o ${formatEurExact(verdict.shortCents)}` : ''}.`,
    verdict.uncovered.length > 0 ? `Prvý neuhradený by bol: ${verdict.uncovered[0]!.label}.` : 'Pred rozhodnutím sa poraďte s účtovníčkou.',
  ]
}

export async function assistantAnswer(db:D1Database,s:AssistantScope,company:Company,topic:AssistantTopic,document='',question=''):Promise<AssistantAnswer|null> {
  if(company.id!==s.company||!await assistantAllowed(db,s))return null
  const team=s.side==='team',root=team?`/ucto/klienti/${company.id}`:'/app'
  const answer:AssistantAnswer={topic,title:ASSISTANT_TOPICS[topic],paragraphs:[],sources:[],at:now()}
  const source=(title:string,detail:string,href:string)=>answer.sources.push({title,detail,href})
  if(topic==='overview'||topic==='missing'||topic==='next') {
    const [count,missing,h]=await Promise.all([
      db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(booked_at IS NOT NULL),0) AS booked,
        COALESCE(SUM(booked_at IS NULL AND status='reading'),0) AS reading,
        COALESCE(SUM(booked_at IS NULL AND status IN ('read','manual')),0) AS review,
        COALESCE(SUM(booked_by='auto' AND NOT (${autoReviewedSql('d')})),0) AS auto_review
        FROM documents d WHERE company_id=? AND deleted_at IS NULL AND duplicate_of IS NULL`).bind(company.id).first<{total:number;booked:number;reading:number;review:number;auto_review:number}>(),
      db.prepare(`SELECT COUNT(*) AS n FROM payments p WHERE p.company_id=? AND ${MISSING}`).bind(company.id).first<{n:number}>(),
      managedHandover(db,company.id),
    ])
    if(topic==='overview') {
      const total=count?.total??0,reading=count?.reading??0,review=count?.review??0,auto=count?.auto_review??0
      answer.paragraphs.push(`V evidencii ${plural(total,'je','sú','je')} ${total} ${plural(total,'doklad','doklady','dokladov')}. Záznam o zaúčtovaní má ${count?.booked??0} z nich.`,
        `Čítanie práve prebieha pri ${reading} ${plural(reading,'doklade','dokladoch','dokladoch')}. Na zaúčtovanie ${plural(review,'čaká','čakajú','čaká')} ${review} ${plural(review,'doklad','doklady','dokladov')}. Odborná kontrola aktuálnej verzie ešte nie je potvrdená pri ${auto} automaticky ${plural(auto,'zaúčtovanom doklade','zaúčtovaných dokladoch','zaúčtovaných dokladoch')}.`,
        'Tento prehľad opisuje evidované doklady. Nepotvrdzuje úplnosť podkladov, správnosť celej knihy ani vybavenie všetkých povinností.')
      source('Doklady','Originály, stav čítania a zaúčtovania.',team?root:'/app/doklady')
    }
    const missingCount=missing?.n??0
    answer.paragraphs.push(`K ${missingCount} ${plural(missingCount,'evidovanej platbe','evidovaným platbám','evidovaným platbám')} ešte chýba doklad alebo odborné vyriešenie.`)
    source('Chýbajúce podklady','Konkrétne platby a bezpečné pridanie dokladu.',team?root:'/app/platby')
    if(h&&h.state!=='cancelled'&&h.state!=='completed'&&h.clientAction)source('Doplnenie k prevzatiu',h.clientAction,team?`${root}/prevzatie`:'/app/prechod#koordinacia')
    if(topic==='next') {
      answer.paragraphs.push(team?'Pracovisko firmy obsahuje aktuálne podklady a odborné úkony.':'Na prehľade firmy sú aj ostatné aktuálne úlohy vrátane banky, schvaľovania a povinností na úhradu. Otvorte ho pred rozhodnutím, čo má prednosť.')
      source(team?'Pracovisko firmy':'Vaše aktuálne úlohy','Úlohy vybavíte priamo na pôvodnom pracovisku.',root)
    }
  } else if(topic==='deadlines') {
    const day=amlToday(),[dues,byMonth,bills]=await Promise.all([
      companyDeadlines(db,company.id,day),
      db.prepare(`SELECT substr(p.booked_on,1,7) AS month,COUNT(*) AS n FROM payments p WHERE p.company_id=? AND ${MISSING} GROUP BY 1`).bind(company.id).all<{month:string;n:number}>(),
      billRows(db,day,company.id,24),
    ])
    // The existing client projection deliberately excludes internal AML reports and other team-only facts.
    const deadlines=clientDeadlines(company,dues,day,new Map(byMonth.results.map(r=>[r.month,r.n])),bills.filter(b=>b.state!=='paid'))
    answer.paragraphs.push(deadlines.length?'Tu sú najbližšie termíny z existujúceho prehľadu. Stav rozlišuje Vašu úlohu a prácu Firmony.':'V tomto prehľade teraz nie je evidovaný ďalší termín. Úplnosť agendy overuje Vaša účtovníčka.')
    for(const d of deadlines.slice(0,8))source(`${dayName(d.day)}: ${d.label}`,d.state,team?root:d.href??'/app')
    source('Celý prehľad termínov','Prečítajte si aj ďalšie povinnosti a aktuálny stav.',root)
  } else if(topic==='document') {
    if(!document) {
      answer.paragraphs.push('Vyberte konkrétny doklad vo formulári. Pri doklade ukážeme jeho skutočný stav; meno dodávateľa alebo číslo v otázke samo nevyberá záznam.')
      source('Všetky doklady','Ak doklad nie je medzi poslednými dvadsiatimi, nájdete ho tu.',team?root:'/app/doklady')
    } else {
      const d=await getDocument(db,company.id,document);if(!d)return null
      const checked=await db.prepare(`SELECT ${autoReviewedSql('d')} AS ok FROM documents d WHERE d.id=? AND d.company_id=?`).bind(d.id,company.id).first<{ok:number}>()
      const auto=await db.prepare("SELECT booked_by FROM documents WHERE id=? AND company_id=?").bind(d.id,company.id).first<{booked_by:string|null}>()
      answer.document=d.id
      answer.paragraphs.push(d.duplicateOf?'Doklad je označený ako možná duplicita. Pôvod a správnosť preverí účtovníčka.':d.bookedAt?
        auto?.booked_by==='auto'&&!checked?.ok?'Doklad zaúčtovala automatika. Odborná kontrola aktuálnej verzie ešte nie je potvrdená.':'Pri doklade je evidované zaúčtovanie. To samo nepotvrdzuje jeho úhradu ani vybavenie celej účtovnej agendy.':
        d.status==='reading'?'Doklad je prijatý a prebieha jeho čítanie. Prijatie ešte nie je zaúčtovanie.':d.status==='manual'?'Doklad potrebuje ručné spracovanie účtovníčkou.':'Údaje z dokladu sú pripravené na spracovanie. Zaúčtovanie ešte nie je evidované.')
      source(d.number??d.fileName??'Vybraný doklad',d.party??'Originál a aktuálne evidované údaje.',team?`/ucto/doklady/${d.id}`:`/app/doklady/${d.id}`)
    }
  } else if(topic==='price') {
    const owner=team||Boolean(await db.prepare("SELECT 1 AS ok FROM members WHERE company_id=? AND user_id=? AND role='owner'").bind(company.id,s.actor).first())
    if(!owner) {
      answer.paragraphs.push('Konkrétnu zmluvnú cenu si overí vlastník firemného účtu. Verejný cenník a rozsah balíkov sú dostupné na webe.')
      source('Verejný cenník','Ceny a rozsah balíkov pred objednaním služby.','/#cennik')
    } else {
      const tariff=await tariffForClient(db,company),plan=tariff==='corrupt'?null:tariff.plans.find(p=>p.id===company.plan)
      if(tariff==='corrupt'||!plan)answer.paragraphs.push('Konkrétnu cenu z uložených podkladov teraz nevieme spoľahlivo potvrdiť. Overíme ju s Vami podľa zmluvy; asistent ju nedopĺňa odhadom.')
      else {
        answer.paragraphs.push(tariff.source==='pricelist'?'Nasledujúce sumy sú z verejného cenníka; uloženú individuálnu dohodu treba overiť.':'Nasledujúce sumy vychádzajú z uloženého zmluvného cenníka, ktorý používa aj fakturácia.',
          `Základ balíka ${plan.name}: ${formatEurExact(plan.monthlyCents)} mesačne. Závierka s daňovým priznaním: ${formatEurExact(tariff.closingCents)}. Mzdy: ${formatEurExact(tariff.payrollCents)} za človeka a mesiac.`,
          'Nie je to nová faktúra ani konečná suma za konkrétny mesiac. Vyšší počet dokladov, mzdy a dohodnuté práce môžu výsledok zmeniť. Rozsah a daňový režim nájdete v zmluve a na skutočnej faktúre.')
      }
      source('Zmluva a faktúry','Overte si rozsah, dohodnuté podmienky a skutočné vyúčtovanie.',team?root:'/app/firma#faktury-firmony')
    }
  } else if (topic === 'money') {
    // The same computation as the home page's money view, so the assistant can never disagree with it. A question
    // that names an invoice or asks what comes or goes gets the specific answer first; the payout question keeps
    // the summary. All of it is written from the company's data by Firmony's code, never by the model.
    const day = amlToday()
    const [balance, issued, received, dues] = await Promise.all([
      db.prepare('SELECT SUM(balance_cents) AS cents, MAX(balance_on) AS on_day FROM accounts WHERE company_id = ? AND balance_cents IS NOT NULL').bind(company.id).first<{ cents: number | null; on_day: string | null }>(),
      unpaidIssued(db, company.id),
      unpaidReceived(db, company.id),
      companyDeadlines(db, company.id, day),
    ])
    const bills = (await billRows(db, day, company.id, 24)).filter((b) => b.state !== 'paid')
    const facts: MoneyFacts = {
      today: day,
      balanceCents: typeof balance?.cents === 'number' ? balance.cents : null,
      balanceOn: balance?.on_day ?? null,
      incoming: issued,
      outgoing: moneyOutgoings(dues, bills, received),
    }
    const w = moneyWindow(facts, MONEY_DAYS)
    const upTo = addDays(day, MONEY_DAYS)
    const dueIn = facts.incoming.filter((i) => i.day >= day && i.day < upTo)
    const dueOut = facts.outgoing.filter((o) => o.day >= day && o.day < upTo)
    // A question that names an invoice: its number is a run of digits the person typed, matched in the evidence.
    const named = /fakt[úu]r/i.test(question) ? (question.match(/\d{4,}/g) ?? []) : []
    const hit = named.map((n) => facts.incoming.find((i) => i.label.includes(n))).find((i) => i !== undefined)
    if (hit) {
      answer.paragraphs.push(
        `${hit.label} je splatná ${dayName(hit.day, day)} na ${formatEurExact(hit.cents)}.`,
        hit.day >= day
          ? `Od ${dayShort(hit.day)} s ňou počíta prehľad Peniaze vopred.`
          : 'Dátum splatnosti už prešiel; do prehľadu sa vráti s úhradou.',
      )
      source('Vystavená faktúra', 'Splatnosť a suma z evidencie faktúr.', '/app/faktury')
    } else if (named.length > 0) {
      answer.paragraphs.push('Faktúru s týmto číslom medzi nezaplatenými vystavenými faktúrami nevidíme. Skontrolujte číslo; zaplatené a zrušené faktúry potvrdí účtovníčka.')
      source('Faktúry', 'Vystavené faktúry a ich úhrady.', '/app/faktury')
    } else if (/kedy.*príde|príde.*kedy|kedy.*platb|platb.*kedy/i.test(question) && /fakt[úu]r|platb/i.test(question)) {
      answer.paragraphs.push(dueIn.length ? 'Na najbližších 30 dní čakáme tieto úhrady vystavených faktúr:' : 'Na najbližších 30 dní nečakáme úhradu žiadnej vystavenej faktúry.')
      for (const i of dueIn.slice(0, 6)) answer.paragraphs.push(`${i.label} - ${dayName(i.day, day)}, ${formatEurExact(i.cents)}`)
      if (dueIn.length > 6) answer.paragraphs.push('Celý zoznam je na prehľade Peniaze vopred.')
      source('Peniaze vopred', 'Očakávané úhrady z evidencie faktúr.', '/app')
    } else if (/čo.*odíde|odíde.*čo|kedy.*zaplatiť|zaplatiť.*kedy|čo.*zaplatiť|zaplatiť.*čo/i.test(question)) {
      answer.paragraphs.push(dueOut.length ? 'Na najbližších 30 dní sú známe tieto platby von:' : 'Na najbližších 30 dní nie je známa žiadna platba von.')
      for (const o of dueOut.slice(0, 6)) answer.paragraphs.push(`${o.label} - ${dayName(o.day, day)}, ${formatEurExact(o.cents)}`)
      if (dueOut.length > 6) answer.paragraphs.push('Celý zoznam je na prehľade Peniaze vopred.')
      source('Peniaze vopred', 'Známe záväzky z termínov a faktúr.', '/app')
    } else {
      // A question that names a payout amount gets the verdict; without an amount, the window itself answers.
      const asked = payoutAskedAnswer(question, facts)
      if (asked) {
        answer.paragraphs.push(...asked)
      } else if (w.reserveCents === null) {
        answer.paragraphs.push('Na to potrebujeme zostatok na účte. Po prepojení banky alebo pridaní výpisu Vám povieme presne, koľko si môžete vyplatiť.', 'Čo Vám príde, čo odíde a známe záväzky nájdete medzitým na prehľade firmy.')
      } else {
        answer.paragraphs.push(`Voľné peniaze na najbližších 30 dní: ${formatEurExact(w.reserveCents)}. Počíta sa zostatok na účte, plus čo očakávame, že príde, mínus známe záväzky.`)
        if (w.mood === 'short') answer.paragraphs.push(`Známe záväzky presahujú o ${formatEurExact(-w.reserveCents)}.`)
        else if (w.mood === 'tight') answer.paragraphs.push('Známe záväzky kryjú aj očakávané platby.')
        else answer.paragraphs.push('Všetko známe máte kryté.')
        answer.paragraphs.push('Toto je pohľad na peniaze, nie na zisk, a ráta len s tým, čo je v evidencii. Presnú sumu výplaty si skúste na prehľade; pred rozhodnutím sa poraďte s účtovníčkou.')
      }
    }
    source('Peniaze vopred','Výpočet z účtov, faktúr a termínov na prehľade firmy.',team?root:'/app')
  } else {
    answer.paragraphs.push('Táto otázka potrebuje odborné posúdenie. Asistent Vám nebude určovať daň, účtovný predpis alebo právny postup bez kontroly. Otázku môžete odovzdať účtovníčke; pred odoslaním uvidíte celý text.')
    source(team?'Pracovisko firmy':'Správy s účtovníčkou','Odborná odpoveď a potrebné doplnenia zostanú v aplikácii.',team?root:'/app/spravy')
  }
  // A long API/deadline read cannot publish facts after membership or the accountant's assignment has changed.
  return await assistantAllowed(db,s)?answer:null
}
