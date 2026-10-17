// Independent reader of the pinned SP contract and the published ordinary contribution rules.
import { XMLParser, XMLValidator } from 'fast-xml-parser'
const assert=(ok,message)=>{if(!ok)throw Error(message)}
const money=(s)=>{assert(typeof s==='string'&&/^\d+\.\d{2}$/.test(s),'Exact decimal amount');return BigInt(s.replace('.',''))}
const funds={np:[140,140],sp:[1400,400],ip:[300,300],pvn:[50,100],up:[80,0],gp:[25,0],rfs:[475,0],pfp:[50,0]}
export function readSocialXml(xml) {
  assert(XMLValidator.validate(xml)===true,'Well formed social XML')
  const root=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,ignoreDeclaration:true}).parse(xml).mvpp
  assert(root?.['@_xmlns']==='http://socpoist.sk/xsd/mvpp2026'&&root.typDoc==='MVP00001'&&['R','O'].includes(root.typVykazu),'Social document identity')
  assert(/^(0[1-9]|1[0-2])202[67]$/.test(root.obdobie)&&/^\d{2}\.\d{2}\.\d{4}$/.test(root.denVyplaty),'Report period and declared payday')
  assert(/^\d{10}$/.test(root.zamestnavatel.identifikacia.variabilnySymbol)&&/^\d{8}$/.test(root.zamestnavatel.identifikacia.identifikator.ico),'Employer identity')
  const raw=root.priloha.poistneZamestnancov.poistneZamestnanca,rows=Array.isArray(raw)?raw:[raw]
  const ids=new Set(),relations=new Set(),sums=Object.fromEntries(Object.keys(funds).map((k)=>[k,[0n,0n]]));let total=0n
  const year=Number(root.obdobie.slice(2)),days=new Date(Date.UTC(year,Number(root.obdobie.slice(0,2)),0)).getUTCDate(),cap=year===2026?1676400n:1782000n
  for(const [i,r] of rows.entries()) {
    const id=r['@_rc'],relation=r['@_icpv']
    assert(r['@_pc']===String(i+1)&&/^\d{9,10}$/.test(id)&&/^\d{12}$/.test(relation)&&!ids.has(id)&&!relations.has(relation),'One complete unique ordinary relationship')
    ids.add(id);relations.add(relation)
    assert(r['@_typZec']==='ZEC'&&r['@_vynimkaVZ']==='0'&&r['@_pocDni']===String(days),'Ordinary full-month insurance')
    const hours=money(r['@_pocetHodin']);assert(hours<=BigInt(days*2400)||hours===99900n,'Known hours or explicit reserved code')
    assert(!('@_rozsahSP' in r)&&!('@_ospZamnec' in r)&&!('@_trener' in r)&&!('@_vylucDobyTrva' in r),'No invented special regimes')
    const gross=money(r['@_vzUp']),base=gross<cap?gross:cap
    for(const [fund,[erRate,eeRate]] of Object.entries(funds)) {
      const tag=fund[0].toUpperCase()+fund.slice(1),erBase=money(r[`@_vz${tag}`]),er=money(r[`@_${fund}Zamtel`])
      assert(erBase===(fund==='up'?gross:base)&&er===erBase*BigInt(erRate)/10000n,'Separate employer base and rounded contribution')
      let ee=0n
      if(eeRate) {assert(money(r[`@_vzZec${tag}`])===base,'Separate employee base');ee=money(r[`@_${fund}Zamnec`]);assert(ee===base*BigInt(eeRate)/10000n,'Employee contribution')}
      else assert(!(`@_${fund}Zamnec` in r)&&!(`@_vzZec${tag}` in r),'No unused employee insurance')
      sums[fund][0]+=er;sums[fund][1]+=ee;total+=er+ee
    }
  }
  assert(!('osp' in root.poistne),'No municipality-only insurance')
  for(const [fund,[,eeRate]] of Object.entries(funds)) {assert(money(root.poistne[fund][`${fund}Zamtel`])===sums[fund][0],'Employer group total');if(eeRate)assert(money(root.poistne[fund][`${fund}Zamnec`])===sums[fund][1],'Employee group total')}
  assert(money(root.poistne.spoluPoistne)===total,'Payable total equals the individual funds')
  return {root,rows,total}
}
