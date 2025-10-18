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
  const prefs = new Set(input.preferences)
  const daysPlan: ItineraryDay[] = []
  const days = input.days || 5
  const totalBudget = input.budget || 5000
  const dailyBudget = Math.round(totalBudget / days)

  // 粗分配：住宿约占40%/天
  const perNightBudget = Math.round(dailyBudget * 0.4)
  const hotelTier = perNightBudget < 300 ? '经济型' : perNightBudget < 600 ? '舒适型' : '高端型'
  const hotelBase = `${input.destination || '市中心'}便捷酒店（${hotelTier}，约¥${perNightBudget}/晚，评分4.4/5，近地铁/景点）`

  const templates: Array<PlanItem[]> = [
    [
      { title: '市中心地标广场', location: '市中心/地铁1号线', category: 'sightseeing', timing: '09:00-11:00', costEstimate: 0, notes: '适合拍照打卡' },
      { title: '历史博物馆', location: '文化区', category: 'culture', timing: '11:30-13:00', costEstimate: 60, notes: '典藏丰富，室内备选' },
      { title: '老街步行街逛街', location: '商业街', category: 'shopping', timing: '14:30-16:30', costEstimate: 50, notes: '特色伴手礼' },
      { title: '本地人气餐厅', location: '城央', category: 'food', timing: '18:00-19:30', costEstimate: 80, notes: '排队建议预约' },
    ],
    [
      { title: '城市观景塔/摩天轮', location: '滨江/滨海区', category: 'sightseeing', timing: '09:00-10:30', costEstimate: 120, notes: '视野开阔' },
      { title: '当代美术馆', location: '文化区', category: 'culture', timing: '11:00-12:30', costEstimate: 70, notes: '适合雨天' },
      { title: '公园慢行与咖啡', location: '绿地公园', category: 'other', timing: '14:00-16:00', costEstimate: 40, notes: '亲子/放松日' },
      { title: '特色餐厅晚餐', location: '城央/地铁沿线', category: 'food', timing: '18:30-20:00', costEstimate: 100, notes: '尝试地方菜系' },
    ],
    [
      { title: '古城/寺庙文化探访', location: '历史街区', category: 'culture', timing: '09:00-11:30', costEstimate: 30, notes: '礼仪注意' },
      { title: '亲子乐园/水族馆', location: '新城片区', category: 'kids', timing: '13:30-15:30', costEstimate: 180, notes: '适合亲子' },
      { title: '商圈逛街', location: 'CBD商圈', category: 'shopping', timing: '16:00-17:30', costEstimate: 60, notes: '综合购物' },
      { title: '城市夜景拍照', location: '地标周边', category: 'other', timing: '19:00-20:00', costEstimate: 0, notes: '夜景建议' },
    ],
    [
      { title: '主题乐园/科技馆', location: '郊区/地铁可达', category: 'other', timing: '09:30-12:00', costEstimate: 200, notes: '预约优先' },
      { title: '本地美食探索', location: '老城区', category: 'food', timing: '12:30-13:30', costEstimate: 80, notes: '地道口味' },
      { title: '特色文化展馆', location: '文化区', category: 'culture', timing: '14:30-16:00', costEstimate: 60, notes: '展陈优秀' },
      { title: '江边/海边漫步', location: '滨江/滨海区', category: 'other', timing: '18:00-19:00', costEstimate: 0, notes: '舒展放松' },
    ],
    [
      { title: '自然公园/山景步道', location: '郊野/环线', category: 'other', timing: '09:00-11:30', costEstimate: 20, notes: '轻徒步' },
      { title: '特色午餐小馆', location: '社区口碑店', category: 'food', timing: '12:00-13:00', costEstimate: 60, notes: '人均友好' },
      { title: '博物馆深度展区', location: '文化区', category: 'culture', timing: '14:00-16:00', costEstimate: 70, notes: '深度了解城市' },
      { title: '夜市/文创市集', location: '城央', category: 'shopping', timing: '18:30-20:00', costEstimate: 80, notes: '氛围浓厚' },
    ],
  ]

  for (let d = 1; d <= days; d++) {
    const tpl = templates[(d - 1) % templates.length]
    const items: PlanItem[] = tpl.map((i) => ({
      title: `${input.destination ? '' : ''}${i.title}`,
      location: i.location,
      category: i.category,
      timing: i.timing,
      costEstimate: i.costEstimate ?? Math.round(dailyBudget * 0.15),
      notes: i.notes,
    }))

    daysPlan.push({
      day: d,
      summary: `${input.destination || '目的地'} 第 ${d} 天行程：特色景点+美食+轻松节奏`,
      items,
      accommodation: `推荐酒店：${hotelBase}`,
      transport: d % 2 === 0 ? '地铁+步行' : '公交+步行',
      meals: ['早餐：面包店或便利店', '午餐：本地餐馆', '晚餐：特色餐厅'],
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