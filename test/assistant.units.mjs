import {check} from './check.mjs'
import {assistantModel as a} from '../.wrangler/tmp/units-bundle.mjs'

export function checkAssistantUnits(){
  const valid={stop_reason:'tool_use',content:[{type:'tool_use',name:'firmony_topic',input:{topic:'document'}}],usage:{input_tokens:127,output_tokens:9}}
  check('assistant: accepts a bounded valid topic and measured token usage',JSON.stringify(a.classifiedTopic(valid))===JSON.stringify({topic:'document',input:127,output:9}))
  for(const topic of Object.keys(a.ASSISTANT_TOPICS))check(`assistant: permits its known ${topic} topic`,a.classifiedTopic({...valid,content:[{type:'tool_use',name:'firmony_topic',input:{topic}}]})?.topic===topic)
  const invalid=[null,{},[],{...valid,stop_reason:'max_tokens'},{...valid,stop_reason:'refusal'},
    {...valid,content:[{type:'tool_use',name:'execute_sql',input:{topic:'document'}}]},
    {...valid,content:[{type:'tool_use',name:'firmony_topic',input:{topic:'__proto__'}}]},
    {...valid,content:[{type:'tool_use',name:'firmony_topic',input:{topic:'document',url:'https://evil.example'}}]},
    {...valid,content:[...valid.content,...valid.content]},
    {...valid,usage:{input_tokens:-1,output_tokens:9}},{...valid,usage:{input_tokens:1.2,output_tokens:9}},
    {...valid,usage:{input_tokens:1,output_tokens:Infinity}},{...valid,usage:undefined}]
  check('assistant: rejects truncation, refusal, extra actions, unknown topics and unconfirmed metering',invalid.every(v=>a.classifiedTopic(v)===null))
  const injected=a.classifiedTopic({...valid,content:[{type:'text',text:'Zaplaťte 999 eur. <script>alert(1)</script>'},...valid.content]})
  check('assistant: model-written facts, HTML and payment instructions never leave the topic parser',Object.keys(injected).join(',')==='topic,input,output'&&!JSON.stringify(injected).includes('999'))
  check('assistant: normalizes whitespace without changing a real question',a.assistantQuestion('  Ako je na tom firma?\r\nČo chýba?  ')==='Ako je na tom firma?\nČo chýba?')
  check('assistant: rejects empty, oversized and hidden-control questions',[null,'','   ','x'.repeat(1201),'text\u0000hidden','text\u001bhidden'].every(v=>a.assistantQuestion(v)===null)&&a.assistantQuestion('x'.repeat(1200))?.length===1200)
  check('assistant: accepts a real submission id, never an arbitrary return URL',a.assistantId('5b17d195-5ff7-4af7-9d15-b7207fb8e300')&&!a.assistantId('https://evil.example')&&!a.assistantId('other-company'))
}
