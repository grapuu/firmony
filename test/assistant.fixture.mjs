/** Local provider only. It cannot contact Anthropic, log a real key or send a real message. */
export function assistantProviderFixture(){
  const fixture={requests:[],next:null,async answer(request){
    if(new URL(request.url).hostname!=='api.anthropic.com')return null
    const payload=await request.clone().json()
    if(!payload.tools?.some(t=>t.name==='firmony_topic'))return null
    const next=fixture.next??{};fixture.next=null;fixture.requests.push(payload)
    if(next.before)await next.before()
    if(next.status)return new Response('TEST-ONLY unavailable',{status:next.status})
    if(next.raw)return new Response(next.raw,{headers:{'content-type':'application/json'}})
    return Response.json(next.body??{stop_reason:'tool_use',content:[{type:'text',text:'TEST-ONLY Untrusted advice: pay 999 eur.'},{type:'tool_use',name:'firmony_topic',input:{topic:next.topic??'overview'}}],usage:{input_tokens:127,output_tokens:9}})
  }}
  return fixture
}

