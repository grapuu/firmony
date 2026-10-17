// Independent reader of the pinned SP contract and the published contribution rules: every type of relationship the
// payroll reports (ZEC and ZECN for an employment or a director, ZECD1 to ZECD3 for agreements, N irregular, V with the
// deduction), each fund either paid at its rate from its base or left out whole, the bases agreeing with each other.
import { XMLParser, XMLValidator } from 'fast-xml-parser'
const assert=(ok,message)=>{if(!ok)throw Error(message)}
const money=(s)=>{assert(typeof s==='string'&&/^\d+\.\d{2}$/.test(s),'Exact decimal amount');return BigInt(s.replace('.',''))}
const funds={np:[140,140],sp:[1400,400],ip:[300,300],pvn:[50,100],up:[80,0],gp:[25,0],rfs:[475,0],pfp:[50,0]}
const PENSION=new Set(['sp','ip','rfs']),GENERAL=new Set(['np','pvn','pfp','gp'])
/** The funds a type may pay to: a labour relationship with a regular income all, an irregular one pensions with accident and guarantee, a director no accident, guarantee or support. */
function allowed(type,director) {
  if (director) return new Set(type==='ZECN'?['sp','ip','rfs']:['np','sp','ip','pvn','rfs'])
  if (['ZECD1N','ZECD2N','ZECD3N','ZECD3NV'].includes(type)) return new Set(['sp','ip','up','gp','rfs'])
  return new Set(Object.keys(funds))
}
export function readSocialXml(xml) {
  assert(XMLValidator.validate(xml)===true,'Well formed social XML')
  const root=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,ignoreDeclaration:true}).parse(xml).mvpp
  assert(root?.['@_xmlns']==='http://socpoist.sk/xsd/mvpp2026'&&root.typDoc==='MVP00001'&&['R','O'].includes(root.typVykazu),'Social document identity')
  assert(/^(0[1-9]|1[0-2])202[67]$/.test(root.obdobie)&&/^\d{2}\.\d{2}\.\d{4}$/.test(root.denVyplaty),'Report period and declared payday')
  assert(/^\d{10}$/.test(root.zamestnavatel.identifikacia.variabilnySymbol)&&/^\d{8}$/.test(root.zamestnavatel.identifikacia.identifikator.ico),'Employer identity')
  const raw=root.priloha.poistneZamestnancov.poistneZamestnanca,rows=Array.isArray(raw)?raw:[raw]
  const ids=new Set(),relations=new Set(),sums=Object.fromEntries(Object.keys(funds).map((k)=>[k,[0n,0n]]));let total=0n
  const year=Number(root.obdobie.slice(2)),days=new Date(Date.UTC(year,Number(root.obdobie.slice(0,2)),0)).getUTCDate(),cap=year===2026?1676400n:1782000n
  const deduction=year===2026?20000n:30000n
  for(const [i,r] of rows.entries()) {
    const id=r['@_rc'],relation=r['@_icpv'],type=r['@_typZec']
    assert(r['@_pc']===String(i+1)&&/^\d{9,10}$/.test(id)&&/^\d{12}$/.test(relation)&&!ids.has(id)&&!relations.has(relation),'One complete unique relationship')
    ids.add(id);relations.add(relation)
    assert(['ZEC','ZECN','ZECD1','ZECD1N','ZECD1V','ZECD2','ZECD2N','ZECD2V','ZECD3','ZECD3N','ZECD3V','ZECD3NV'].includes(type)&&r['@_vynimkaVZ']==='0','A supported type of relationship')
    assert(Number(r['@_pocDni'])>=1&&Number(r['@_pocDni'])<=days,'Days of the relationship within the month')
    const director=!('@_pfpZamtel' in r)&&!('@_vzPfp' in r)
    assert(!director||type==='ZEC'||type==='ZECN','Only an employment or a director leaves the support out')
    const hours=money(r['@_pocetHodin']);assert(hours<=BigInt(days*2400)||hours===99900n,'Known hours or explicit reserved code')
    assert(!('@_rozsahSP' in r)&&!('@_ospZamnec' in r)&&!('@_trener' in r)&&!('@_vylucDobyTrva' in r),'No invented special regimes')
    const may=allowed(type,director),bases={general:null,pension:null,whole:null}
    for(const [fund,[erRate,eeRate]] of Object.entries(funds)) {
      if (fund==='pfp'&&director) continue
      const tag=fund[0].toUpperCase()+fund.slice(1),erBase=money(r[`@_vz${tag}`]),er=money(r[`@_${fund}Zamtel`])
      const rate=BigInt(fund==='pvn'&&director?100:erRate)
      let ee=0n
      if (eeRate) {assert(money(r[`@_vzZec${tag}`])===erBase,'The employee base is the employer base');ee=money(r[`@_${fund}Zamnec`])}
      else assert(!(`@_${fund}Zamnec` in r)&&!(`@_vzZec${tag}` in r),'No unused employee insurance')
      if (!may.has(fund)) assert(erBase===0n&&er===0n&&ee===0n,'A fund the relationship does not pay to is nought')
      else if (erBase>0n) {
        assert(er===erBase*rate/10000n&&(!eeRate||ee===erBase*BigInt(eeRate)/10000n),'Each contribution at its rate, rounded down')
        const group=PENSION.has(fund)?'pension':GENERAL.has(fund)?'general':'whole'
        assert(bases[group]===null||bases[group]===erBase,'The bases of a group agree')
        bases[group]=erBase
      } else assert(er===0n&&ee===0n,'No contribution without a base')
      sums[fund][0]+=er;sums[fund][1]+=ee;total+=er+ee
    }
    if (bases.general!==null) assert(bases.general<=cap,'The base never above the cap')
    if (bases.whole!==null&&bases.general!==null) assert(bases.general===(bases.whole<cap?bases.whole:cap),'The base is the income up to the cap')
    if (bases.pension!==null&&bases.general!==null) assert(type.endsWith('V')?bases.general-bases.pension===deduction:bases.pension===bases.general,'The pension base is the base, less the deduction where claimed')
    if (bases.pension!==null&&bases.whole!==null&&type.endsWith('V')) assert(bases.pension===(bases.whole<cap?bases.whole:cap)-deduction,'The deduction off the income')
  }
  assert(!('osp' in root.poistne),'No municipality-only insurance')
  for(const [fund,[,eeRate]] of Object.entries(funds)) {assert(money(root.poistne[fund][`${fund}Zamtel`])===sums[fund][0],'Employer group total');if(eeRate)assert(money(root.poistne[fund][`${fund}Zamnec`])===sums[fund][1],'Employee group total')}
  assert(money(root.poistne.spoluPoistne)===total,'Payable total equals the individual funds')
  return {root,rows,total}
}
