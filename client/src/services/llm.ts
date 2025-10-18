import type { TripInput, Itinerary, ItineraryDay, PlanItem, Expense, BudgetAnalysis } from '../types'
import { enrichItineraryWithAmap } from './amap'

const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const DASHSCOPE_API = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

export async function generateItinerary(input: TripInput): Promise<Itinerary> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.toLowerCase()
  const dsKey = import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined
  const dsModel = (import.meta.env.VITE_DASHSCOPE_MODEL as string | undefined) || 'qwen2.5'
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  const openaiModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini'

  if (provider === 'dashscope' && dsKey) {
    try {
      const it = await generateItineraryDashScope(input, dsKey, dsModel)
      return await enrichItineraryWithAmap(it)
    } catch (e) {
      console.warn('DashScope 调用失败，改用本地模拟', e)
      const it = mockGenerateItinerary(input)
      return await enrichItineraryWithAmap(it)
    }
  }

  if (openaiKey) {
    try {
      const it = await generateItineraryOpenAI(input, openaiKey, openaiModel)
      return await enrichItineraryWithAmap(it)
    } catch (e) {
      console.warn('OpenAI 调用失败，改用本地模拟', e)
      const it = mockGenerateItinerary(input)
      return await enrichItineraryWithAmap(it)
    }
  }

  const it = mockGenerateItinerary(input)
  return await enrichItineraryWithAmap(it)
}

function mockGenerateItinerary(input: TripInput): Itinerary {
  const prefsRaw = (input.preferences || []).map(s => (s || '').toLowerCase())
  const prefs = new Set<string>()
  for (const p of prefsRaw) {
    if (/美食|吃|餐厅|food/.test(p)) prefs.add('food')
    if (/文化|历史|博物馆|museum|art/.test(p)) prefs.add('culture')
    if (/亲子|儿童|家庭|kid|family/.test(p)) prefs.add('kids')
    if (/购物|买|商场|shopping|mall/.test(p)) prefs.add('shopping')
    if (/自然|户外|公园|hiking|park/.test(p)) prefs.add('relax')
    if (/夜景|夜市|夜生活|bar|night/.test(p)) prefs.add('night')
  }
  const days = Math.max(input.days || 3, 1)
  const totalBudget = Math.max(input.budget || 3000, 0)
  const dailyBudget = Math.round(totalBudget / days)

  // 住宿建议基础：按每日预算40%估算档位
  const perNightBudget = Math.round(dailyBudget * 0.4)
  const hotelTier = perNightBudget < 300 ? '经济型' : perNightBudget < 600 ? '舒适型' : '高端型'
  const hotelBase = `${input.destination || '市中心'}便捷酒店（${hotelTier}，约¥${perNightBudget}/晚）`

  const buildItem = (title: string, category: PlanItem['category'], timing: string, location: string, cost: number, notes?: string): PlanItem => ({
    title, category, timing, location, costEstimate: cost, notes
  })

  const daysPlan: ItineraryDay[] = []
  for (let d = 1; d <= days; d++) {
    const items: PlanItem[] = []
    // 上午：偏好优先（亲子>文化>地标）
    if (prefs.has('kids')) {
      items.push(buildItem('亲子友好科技馆/动物园', 'kids', '09:00-11:30', '亲子/地铁可达', 80, '亲子优先'))
    } else if (prefs.has('culture')) {
      items.push(buildItem('历史博物馆/艺术馆', 'culture', '09:00-11:30', '文化区', 60, '文化偏好'))
    } else {
      items.push(buildItem('城市地标/公园', 'sightseeing', '09:00-11:30', '市中心/地铁', 0, '拍照打卡'))
    }
    // 午餐：餐饮必配，若美食偏好则提高预算
    items.push(buildItem('本地人气餐厅', 'food', '12:00-13:30', '城央', prefs.has('food') ? 100 : 80, prefs.has('food') ? '美食优先' : '口碑店'))
    // 下午：放松/购物/文化/热门景点
    if (prefs.has('relax')) {
      items.push(buildItem('城市公园/江边步道', 'relax', '14:30-16:30', '滨江/绿地', 0, '自然/散步'))
    } else if (prefs.has('shopping')) {
      items.push(buildItem('老街步行街/商场', 'shopping', '14:30-16:30', '商业街', 50, '伴手礼/逛街'))
    } else if (prefs.has('culture')) {
      items.push(buildItem('特色历史街区', 'culture', '14:30-16:30', '文化街区', 30, '人文体验'))
    } else {
      items.push(buildItem('热门景点', 'sightseeing', '14:30-16:30', '热门商圈', 30, '人气打卡'))
    }
    // 晚餐/夜间：夜市或餐厅
    if (prefs.has('night')) {
      items.push(buildItem('夜市/夜景漫步', 'food', '18:30-20:30', '夜市/江边夜景', prefs.has('food') ? 100 : 80, '夜生活'))
    } else {
      items.push(buildItem('特色餐厅/当地美食', 'food', '18:00-19:30', '吃货区/口碑好', prefs.has('food') ? 120 : 90, '预约/口碑'))
    }

    // 交通偏好摘要：预算低倾向公交地铁，预算高适度打车
    const transport = dailyBudget <= 400 ? '公交+地铁优先，步行为辅' : (d % 2 === 0 ? '地铁+步行' : '打车+步行')
    const meals = ['早餐：附近面包店或豆浆店', '午餐：本地口碑餐馆', '晚餐：特色餐厅或夜市']

    daysPlan.push({
      day: d,
      summary: `${input.destination || '目的地'} 第 ${d} 天：${(Array.from(prefs).join('、') || '经典路线')}优先，节奏舒适`,
      items,
      accommodation: `推荐酒店：${hotelBase}`,
      transport,
      meals,
      totalEstimate: dailyBudget,
    })
  }

  return {
    destination: input.destination,
    days,
    budget: input.budget,
    estimateTotal: dailyBudget * days,
    daysPlan,
    tips: [
      '高峰期提前预约热门景点/餐厅',
      '若天气不佳可选择室内项目（博物馆/美术馆）',
      '亲子/老人行程注意午休与体力分配',
    ],
  }
}

async function generateItineraryOpenAI(input: TripInput, apiKey: string, model: string): Promise<Itinerary> {
  const system = `你是一名资深中文旅行规划助手。请生成包含“具体景点与酒店细节”的中文日程：\n- 每天列出不同且不重复的具体 POI（真实/常见景点中文名），包含：title（景点名）、location（区域/临近地铁/地址简述）、category（sightseeing/shopping/food/culture/kids等）、timing（如09:00-11:30）、costEstimate（¥数字）、notes（一句话理由/注意事项）。\n- accommodation 字段需给出具体酒店名与价格区间（每晚）、评分与位置描述，并根据预算匹配档位（经济/舒适/高端）。\n- transport 字段给出当天主要出行方式（如：地铁X号线/公交路线/步行）。\n- meals 列出当天推荐餐饮安排（午晚餐可给店名或菜系）。\n- 全部输出为严格 JSON：{destination, days, budget, estimateTotal, daysPlan: [{day, summary, items: [{title, location, category, timing, costEstimate, notes}], accommodation, transport, meals, totalEstimate}], tips}。`
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
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  return JSON.parse(content)
}

async function generateItineraryDashScope(input: TripInput, apiKey: string, model: string): Promise<Itinerary> {
  const system = `你是一名资深中文旅行规划助手。请生成包含“具体景点与酒店细节”的中文日程：\n- 每天列出不同且不重复的具体 POI（真实/常见景点中文名），包含：title（景点名）、location（区域/临近地铁/地址简述）、category（sightseeing/shopping/food/culture/kids等）、timing（如09:00-11:30）、costEstimate（¥数字）、notes（一句话理由/注意事项）。\n- accommodation 字段需给出具体酒店名与价格区间（每晚）、评分与位置描述，并根据预算匹配档位（经济/舒适/高端）。\n- transport 字段给出当天主要出行方式（如：地铁X号线/公交路线/步行）。\n- meals 列出当天推荐餐饮安排（午晚餐可给店名或菜系）。\n- 全部输出为严格 JSON：{destination, days, budget, estimateTotal, daysPlan: [{day, summary, items: [{title, location, category, timing, costEstimate, notes}], accommodation, transport, meals, totalEstimate}], tips}。`
  const user = `目的地: ${input.destination}\n天数: ${input.days}\n预算: ${input.budget}\n人数: ${input.people}\n偏好: ${input.preferences.join(', ')}`

  const res = await fetch(DASHSCOPE_API, {
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
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  return JSON.parse(content)
}

export async function analyzeBudget(params: { input: TripInput; itinerary?: Itinerary; expenses: Expense[] }): Promise<BudgetAnalysis> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.toLowerCase()
  const dsKey = import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined
  const dsModel = (import.meta.env.VITE_DASHSCOPE_MODEL as string | undefined) || 'qwen2.5'
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  const openaiModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini'

  try {
    if (provider === 'dashscope' && dsKey) {
      return await analyzeBudgetDashScope(params, dsKey, dsModel)
    }
    if (openaiKey) {
      return await analyzeBudgetOpenAI(params, openaiKey, openaiModel)
    }
  } catch (e) {
    console.warn('预算AI分析调用失败，改用本地模拟', e)
  }
  return mockAnalyzeBudget(params)
}

function mockAnalyzeBudget({ input, itinerary, expenses }: { input: TripInput; itinerary?: Itinerary; expenses: Expense[] }): BudgetAnalysis {
  const totalSpent = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const byCat: Record<'transport'|'accommodation'|'food'|'tickets'|'shopping'|'other', number> = {
    transport: 0, accommodation: 0, food: 0, tickets: 0, shopping: 0, other: 0,
  }
  const byDay: Record<number, number> = {}
  for (const e of expenses) {
    const cat = (e.category || 'other') as keyof typeof byCat
    byCat[cat] += e.amount || 0
    if (e.day) byDay[e.day] = (byDay[e.day] || 0) + (e.amount || 0)
  }
  const recRatio: Record<keyof typeof byCat, number> = {
    transport: 0.15, accommodation: 0.4, food: 0.25, tickets: 0.1, shopping: 0.06, other: 0.04,
  }
  const catLabels: Record<keyof typeof byCat, string> = {
    transport: '交通', accommodation: '住宿', food: '餐饮', tickets: '门票', shopping: '购物', other: '其他',
  }

  const categories = (Object.keys(byCat) as Array<keyof typeof byCat>).map((k) => {
    const spent = byCat[k]
    const rec = Math.round((input.budget || 0) * recRatio[k])
    let suggestion = `${catLabels[k]}建议预算约 ¥${rec}；当前已用 ¥${spent}。`
    if (spent > rec * 1.15) {
      const over = spent - rec
      suggestion += `已超过建议约 ¥${over}。可通过提前购票/选择高性价比店铺/优化路线减少该项支出。`
    } else if (spent < rec * 0.6) {
      suggestion += `低于建议区间，若行程关注度较高，可适度提高体验品质（如餐饮与景点）。`
    } else {
      suggestion += `处于合理区间，保持当前消费节奏即可。`
    }
    return { category: k, spent, suggestion }
  })

  const daily: BudgetAnalysis['daily'] = []
  const days = itinerary?.days || Math.max( ...[0, ...Object.keys(byDay).map(Number)] ) || 0
  for (let d = 1; d <= days; d++) {
    const spent = byDay[d] || 0
    const estimated = itinerary?.daysPlan?.find(x => x.day === d)?.totalEstimate || Math.round((input.budget || 0) / (itinerary?.days || days || 1))
    let warning: string | undefined
    if (spent > (estimated + 100)) {
      warning = `第${d}天可能超支约 ¥${spent - estimated}，考虑减少购物/选择免费景点或更经济餐饮。`
    } else if (spent && spent < estimated * 0.5) {
      warning = `第${d}天支出较低，若时间允许可补充特色体验（展馆/餐厅）。`
    }
    daily.push({ day: d, spent, estimated, warning })
  }

  const remain = (input.budget || 0) - totalSpent
  const perCapitaRemain = Math.round(remain / Math.max(1, input.people || 1))
  const overall = remain >= 0
    ? `整体剩余预算约 ¥${remain}（人均约 ¥${perCapitaRemain}）。建议保留 10%-15% 机动资金应对临时开销。`
    : `整体已超预算约 ¥${Math.abs(remain)}。建议调整住宿/餐饮档位或减少购物开销以回到预算范围。`

  const tips = [
    '门票尽量使用官方/平台优惠并提前预约，节省排队与费用',
    '餐饮选择本地口碑好且人均友好的店铺，避开网红溢价',
    '交通优先公共交通，跨城/机场可提前订购享受折扣',
  ]

  return { overall, categories, daily, tips }
}

async function analyzeBudgetOpenAI({ input, itinerary, expenses }: { input: TripInput; itinerary?: Itinerary; expenses: Expense[] }, apiKey: string, model: string): Promise<BudgetAnalysis> {
  const byCat = {
    transport: 0, accommodation: 0, food: 0, tickets: 0, shopping: 0, other: 0,
  }
  const byDay: Record<number, number> = {}
  for (const e of expenses) {
    // @ts-ignore
    byCat[e.category || 'other'] += e.amount || 0
    if (e.day) byDay[e.day] = (byDay[e.day] || 0) + (e.amount || 0)
  }
  const dailyEstimated: Record<number, number> = {}
  for (const d of itinerary?.daysPlan || []) {
    if (d.day) dailyEstimated[d.day] = d.totalEstimate || 0
  }

  const system = `你是一名中文旅行预算分析助手。根据用户预算、已记录开销与每日预估，给出结构化建议。严格输出 JSON：{overall, categories: [{category, spent, suggestion}], daily: [{day, spent, estimated, warning}], tips}`
  const user = `目的地: ${input.destination}\n天数: ${input.days}\n预算: ${input.budget}\n人数: ${input.people}\n偏好: ${input.preferences.join(', ')}\n分类支出: ${JSON.stringify(byCat)}\n每日支出: ${JSON.stringify(byDay)}\n每日预估: ${JSON.stringify(dailyEstimated)}`

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
      temperature: 0.5,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  try {
    return JSON.parse(content)
  } catch {
    return mockAnalyzeBudget({ input, itinerary, expenses })
  }
}

export async function generateItineraryText({ input, itinerary }: { input: TripInput; itinerary?: Itinerary }): Promise<string> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.toLowerCase()
  const dsKey = import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined
  const dsModel = (import.meta.env.VITE_DASHSCOPE_MODEL as string | undefined) || 'qwen2.5'
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  const openaiModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini'

  try {
    if (provider === 'dashscope' && dsKey) {
      return await generateItineraryTextDashScope({ input, itinerary }, dsKey, dsModel)
    }
    if (openaiKey) {
      return await generateItineraryTextOpenAI({ input, itinerary }, openaiKey, openaiModel)
    }
  } catch (e) {
    console.warn('生成详细行程文本失败，降级使用本地模拟', e)
  }
  return mockGenerateItineraryText({ input, itinerary })
}

function mockGenerateItineraryText({ input, itinerary }: { input: TripInput; itinerary?: Itinerary }): string {
  const lines: string[] = []
  lines.push(`【行程概览】目的地：${input.destination}；天数：${input.days}；人数：${input.people}；预算：¥${input.budget}`)
  if (input.preferences?.length) {
    lines.push(`偏好：${input.preferences.join('、')}`)
  }
  for (const d of itinerary?.daysPlan || []) {
    lines.push(`\n第${d.day}天｜预算约 ¥${d.totalEstimate}`)
    lines.push(`上午：${d.items?.[0]?.title ?? '城市地标'}（${d.items?.[0]?.location ?? '市中心/地铁可达'}）`)
    if (d.items?.[1]) lines.push(`中午：${d.items[1].title}（餐饮/当地口碑店）`)
    if (d.items?.[2]) lines.push(`下午：${d.items[2].title}（${d.items[2].category ?? '体验'}）`)
    if (d.items?.[3]) lines.push(`晚上：${d.items[3].title}（拍照/漫步/夜景）`)
    if (d.accommodation) lines.push(`住宿：${d.accommodation}`)
    if (d.transport) lines.push(`交通：${d.transport}`)
    if (d.meals?.length) lines.push(`餐饮：${d.meals.join('；')}`)
    if (d.summary) lines.push(`备注：${d.summary}`)
  }
  if (itinerary?.tips?.length) {
    lines.push(`\n【贴士】${itinerary.tips.join('；')}`)
  }
  return lines.join('\n')
}

async function generateItineraryTextOpenAI({ input, itinerary }: { input: TripInput; itinerary?: Itinerary }, apiKey: string, model: string): Promise<string> {
  const system = `你是一名中文旅行规划专家。请输出「更详细的中文行程文本」，要求：
- 逐日安排（早/午/晚），具体到真实/常见 POI 名称、交通方式（地铁/步行/公交/打车）、时间段、餐饮建议、住宿建议及预算提示
- 融合已提供的结构化行程信息并具体化（如有）
- 语气友好实用，便于直接照着玩；仅输出纯文本，不要 JSON 或代码块`
  const user = `基础信息：
目的地: ${input.destination}
天数: ${input.days}
预算: ${input.budget}
人数: ${input.people}
偏好: ${input.preferences.join(', ')}

结构化行程（如有）:
${itinerary ? JSON.stringify(itinerary) : '无'}`

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

async function generateItineraryTextDashScope({ input, itinerary }: { input: TripInput; itinerary?: Itinerary }, apiKey: string, model: string): Promise<string> {
  const system = `你是一名中文旅行规划专家。请输出「更详细的中文行程文本」，要求：
- 逐日安排（早/午/晚），具体到真实/常见 POI 名称、交通方式（地铁/步行/公交/打车）、时间段、餐饮建议、住宿建议及预算提示
- 融合已提供的结构化行程信息并具体化（如有）
- 语气友好实用，便于直接照着玩；仅输出纯文本，不要 JSON 或代码块`
  const user = `基础信息：
目的地: ${input.destination}
天数: ${input.days}
预算: ${input.budget}
人数: ${input.people}
偏好: ${input.preferences.join(', ')}

结构化行程（如有）:
${itinerary ? JSON.stringify(itinerary) : '无'}`

  const res = await fetch(DASHSCOPE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

async function analyzeBudgetDashScope({ input, itinerary, expenses }: { input: TripInput; itinerary?: Itinerary; expenses: Expense[] }, apiKey: string, model: string): Promise<BudgetAnalysis> {
  const byCat = {
    transport: 0, accommodation: 0, food: 0, tickets: 0, shopping: 0, other: 0,
  }
  const byDay: Record<number, number> = {}
  for (const e of expenses) {
    // @ts-ignore
    byCat[e.category || 'other'] += e.amount || 0
    if (e.day) byDay[e.day] = (byDay[e.day] || 0) + (e.amount || 0)
  }
  const dailyEstimated: Record<number, number> = {}
  for (const d of itinerary?.daysPlan || []) {
    if (d.day) dailyEstimated[d.day] = d.totalEstimate || 0
  }

  const system = `你是一名中文旅行预算分析助手。根据用户预算、已记录开销与每日预估，给出结构化建议。严格输出 JSON：{overall, categories: [{category, spent, suggestion}], daily: [{day, spent, estimated, warning}], tips}`
  const user = `目的地: ${input.destination}\n天数: ${input.days}\n预算: ${input.budget}\n人数: ${input.people}\n偏好: ${input.preferences.join(', ')}\n分类支出: ${JSON.stringify(byCat)}\n每日支出: ${JSON.stringify(byDay)}\n每日预估: ${JSON.stringify(dailyEstimated)}`

  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
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
      temperature: 0.5,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  try {
    return JSON.parse(content)
  } catch {
    return mockAnalyzeBudget({ input, itinerary, expenses })
  }
}