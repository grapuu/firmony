import { READER } from '../config'

export const ASSISTANT = {
  model: READER.model, questionChars: 1200, questionBytes: 3600, maxTokens: 128, timeoutMs: 12_000,
  userDaily: 12, companyDaily: 40, globalDaily: 200, pendingSeconds: 60,
} as const
export const ASSISTANT_TOPICS = {
  overview: 'Ako je na tom účtovníctvo?', missing: 'Čo ešte potrebujete odo mňa?',
  deadlines: 'Aké termíny ma čakajú?', document: 'Čo sa deje s dokladom?',
  price: 'Čo je v cene služby?', next: 'Kde vybavím ďalší krok?', expert: 'Potrebujem odbornú odpoveď',
  money: 'Koľko si môžem vyplatiť?',
} as const
export type AssistantTopic = keyof typeof ASSISTANT_TOPICS
export const assistantTopic = (v: unknown): AssistantTopic | null => typeof v === 'string' && Object.hasOwn(ASSISTANT_TOPICS,v) ? v as AssistantTopic : null
export const assistantId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export function assistantQuestion(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\r\n?/g,'\n').trim()
  return s && s.length <= ASSISTANT.questionChars && new TextEncoder().encode(s).length <= ASSISTANT.questionBytes && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s) ? s : null
}
export interface AssistantSource { title: string; detail: string; href: string }
export interface AssistantAnswer { topic: AssistantTopic; title: string; paragraphs: string[]; sources: AssistantSource[]; at: number; document?: string }

/** Only a topic can cross the model boundary. No model-written answer, URL, SQL, amount or action is executed. */
export function classifiedTopic(body: unknown): { topic: AssistantTopic; input: number; output: number } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string,unknown>
  if (b.stop_reason !== 'tool_use' || !Array.isArray(b.content)) return null
  const tools = b.content.filter(x => x && typeof x === 'object' && (x as Record<string,unknown>).type === 'tool_use')
  if (tools.length !== 1) return null
  const tool = tools[0] as Record<string,unknown>, value = tool.input
  if (tool.name !== 'firmony_topic' || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return null
  const topic = assistantTopic((value as Record<string,unknown>).topic)
  const usage = b.usage as Record<string,unknown> | undefined
  const meter = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000
  return topic && meter(usage?.input_tokens) && meter(usage?.output_tokens) ? {topic,input:usage.input_tokens,output:usage.output_tokens} : null
}
