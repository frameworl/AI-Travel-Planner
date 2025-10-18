import type { TripInput, Itinerary, ItineraryDay, PlanItem } from '../types'

const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

export async function generateItinerary(input: TripInput): Promise<Itinerary> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini'

  if (!apiKey) {
    // 无 API Key 时，返回本地模拟结果（可用于演示）
    return mockGenerateItinerary(input)
  }

  const system = `你是一名资深中文旅行规划助手。根据用户提供的目的地、天数、预算、人数和偏好，生成结构化的日程安排。
返回 JSON，字段：{destination, days, budget, estimateTotal, daysPlan: [{day, summary, items: [{title, location, category, timing, costEstimate, notes}], accommodation, transport, meals, totalEstimate}], tips}`

  const user = `目的地: ${input.destination}\n天数: ${input.days}\n预算: ${input.budget}\n人数: ${input.people}\n偏好: ${input.preferences.join(', ')}`

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    console.warn('LLM 调用失败，使用本地模拟', await res.text())
    return mockGenerateItinerary(input)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  try {
    const parsed: Itinerary = JSON.parse(content)
    return parsed
  } catch (e) {
    console.warn('解析失败，使用本地模拟', e)
    return mockGenerateItinerary(input)
  }
}

function mockGenerateItinerary(input: TripInput): Itinerary {
  const prefs = new Set(input.preferences)
  const daysPlan: ItineraryDay[] = []
  const dailyBudget = Math.round((input.budget || 5000) / (input.days || 5))

  const prefItem = (title: string, category: PlanItem['category']): PlanItem => ({
    title,
    category,
    timing: '10:00-12:00',
    costEstimate: Math.round(dailyBudget * 0.2),
  })

  for (let d = 1; d <= (input.days || 5); d++) {
    const items: PlanItem[] = [
      { title: '地标景点打卡', category: 'sightseeing', timing: '09:00-11:30' },
      prefs.has('food') ? prefItem('本地美食探索', 'food') : { title: '城市漫步', category: 'culture' },
      prefs.has('kids') ? { title: '亲子乐园/水族馆', category: 'kids', timing: '14:00-16:00' } : { title: '博物馆参观', category: 'culture', timing: '14:00-16:00' },
      prefs.has('anime') ? { title: '动漫相关打卡店铺/展馆', category: 'other', timing: '16:30-18:00' } : { title: '商圈逛街', category: 'shopping', timing: '16:30-18:00' },
      { title: '特色餐厅晚餐', category: 'food', timing: '18:30-20:00' },
    ]

    daysPlan.push({
      day: d,
      summary: `${input.destination} 第 ${d} 天行程，兼顾${prefs.has('kids') ? '亲子' : '文化'}与美食体验`,
      items,
      accommodation: '市中心交通便捷酒店',
      transport: d % 2 === 0 ? '地铁+步行' : '公交+步行',
      meals: ['早餐：便利店或面包店', '午餐：本地餐馆', '晚餐：特色餐厅'],
      totalEstimate: dailyBudget,
    })
  }

  return {
    destination: input.destination,
    days: input.days,
    budget: input.budget,
    estimateTotal: dailyBudget * (input.days || 5),
    daysPlan,
    tips: [
      '高峰期提前预约热门景点/餐厅',
      '灵活调整行程以适应天气与体力',
      '亲子出行建议准备简易医药包',
    ],
  }
}