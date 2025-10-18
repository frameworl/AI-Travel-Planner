// recommender.ts - Ask LLM for hotel suggestions

export type HotelSuggestion = {
  name: string
  address?: string
  referencePrice?: number
}

const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const DASHSCOPE_API = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

function safeParseHotels(text: string): HotelSuggestion[] {
  try {
    const trimmed = (text || '').trim()
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    const jsonStr = start >= 0 && end >= 0 ? trimmed.slice(start, end + 1) : trimmed
    const arr = JSON.parse(jsonStr)
    if (Array.isArray(arr)) {
      return arr
        .filter((x) => x && typeof x.name === 'string')
        .map((x) => ({ name: String(x.name), address: x.address ? String(x.address) : undefined, referencePrice: x.referencePrice != null ? Number(x.referencePrice) : undefined }))
        .slice(0, 3)
    }
  } catch {}
  return []
}

async function askHotelsOpenAI(city: string, budget: number, count: number, apiKey: string, model: string): Promise<HotelSuggestion[]> {
  const system = `你是一名中文旅行推荐助手。只返回 JSON 数组，不要任何解释或文字。数组长度 1-${count}，城市为“${city}”，每晚预算约 ¥${budget}。每项包含：name, address(可选), referencePrice(人民币，可选)。优先选择评分高且口碑好，避免重复或无效数据。`
  const user = `请推荐酒店：城市=${city}；每晚预算=¥${budget}；最多数量=${count}`
  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ], temperature: 0.3 })
  })
  if (!res.ok) return []
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  return safeParseHotels(content)
}

async function askHotelsDashScope(city: string, budget: number, count: number, apiKey: string, model: string): Promise<HotelSuggestion[]> {
  const system = `你是一名中文旅行推荐助手。只返回 JSON 数组，不要任何解释或文字。数组长度 1-${count}，城市为“${city}”，每晚预算约 ¥${budget}。每项包含：name, address(可选), referencePrice(人民币，可选)。优先选择评分高且口碑好，避免重复或无效数据。`
  const user = `请推荐酒店：城市=${city}；每晚预算=¥${budget}；最多数量=${count}`
  const res = await fetch(DASHSCOPE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ], temperature: 0.3 })
  })
  if (!res.ok) return []
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  return safeParseHotels(content)
}

export async function askLLMHotels(city: string, budget: number, count: number = 3): Promise<HotelSuggestion[]> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.toLowerCase()
  const dsKey = import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined
  const dsModel = (import.meta.env.VITE_DASHSCOPE_MODEL as string | undefined) || 'qwen2.5'
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  const openaiModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini'

  try {
    if (provider === 'dashscope' && dsKey) {
      return await askHotelsDashScope(city, budget, count, dsKey, dsModel)
    }
    if (openaiKey) {
      return await askHotelsOpenAI(city, budget, count, openaiKey, openaiModel)
    }
  } catch (e) {
    console.warn('askLLMHotels 调用失败', e)
  }
  return []
}