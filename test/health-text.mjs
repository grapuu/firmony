// Independent reader of the MZ SR 2026 text contract: 10 identification, 13 employer,
// 20 summary and 17 employee fields, with a trailing separator on every UTF-8 line.
const amount=(s)=>{if(!/^\d{1,10},\d{2}$/.test(s))throw Error('Invalid decimal amount');return BigInt(s.replace(',',''))}
const assert=(ok,message)=>{if(!ok)throw Error(message)}
export function readHealthText(text) {
  assert(!text.startsWith('\uFEFF')&&text.endsWith('\r\n'),'UTF-8 file endings')
  const lines=text.slice(0,-2).split('\r\n').map((s)=>{assert(s.endsWith('|'),'Missing final delimiter');return s.slice(0,-1).split('|')})
  assert(lines.length>=4&&lines[0].length===10&&lines[1].length===13&&lines[2].length===20,'Header field count')
  const [id,employer,summary,...rows]=lines
  assert(['N','O'].includes(id[0])&&id[1]==='514'&&/^\d{8}$/.test(id[2])&&id[2]===employer[3]&&/^\d{10}$/.test(id[3])&&id[3]===employer[4]&&/^\d{4}$/.test(id[4]),'Payer identity')
  assert(Number(id[7])===rows.length&&Number(summary[0])===rows.length&&Number(summary[19])>=rows.length&&summary[18]==='PO','Employee counts')
  assert(/^[0-9]{6}$/.test(employer[0])&&Number(employer[1])>=1&&Number(employer[1])<=31&&id[8]==='1'&&id[9]==='1','One complete file')
  const groups=[{count:0,days:0,gross:0n,base:0n,employer:0n,employee:0n},{count:0,days:0,gross:0n,base:0n,employer:0n,employee:0n}]
  for(const [i,r] of rows.entries()) {
    assert(r.length===17&&Number(r[0])===i+1&&/^\d{9,10}$/.test(r[1])&&Number(r[2])>=1&&Number(r[2])<=31,'Employee field shape')
    const disabled=r[3]==='5,50'&&r[4]==='2,50';assert(disabled||r[3]==='11,00'&&r[4]==='5,00','Supported rates')
    const e=amount(r[8]),er=amount(r[7]),top=amount(r[16]);assert(er+e+top===amount(r[9]),'Employee total includes separate minimum top-up')
    assert(['0','1'].includes(r[15])&&(r[15]!=='1'||top===0n),'Minimum exception')
    for(const k of [5,6,10,11,12])amount(r[k])
    assert(r[13]===''&&r[14]===''&&amount(r[11])===0n,'No exempt or short-time-work adjustments')
    const g=groups[disabled?1:0];g.count++;g.days+=Number(r[2]);g.gross+=amount(r[5]);g.base+=amount(r[6]);g.employer+=er;g.employee+=e+top
  }
  for(const [i,g] of groups.entries()) {
    assert(g.count===Number(summary[5+i])&&g.days===Number(summary[7+i]),'Group counts and days')
    assert(g.gross===amount(summary[9+i])&&g.base===amount(summary[11+i]),'Group assessment bases')
    assert(g.employer===amount(summary[13+i*2])&&g.employee===amount(summary[14+i*2]),'Group advances')
  }
  assert(groups.reduce((a,g)=>a+g.employee+g.employer,0n)===amount(summary[17]),'Summary total')
  return {id,employer,summary,rows}
}
