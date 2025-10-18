import type { Expense, ExpenseCategory } from '../types'

export function parseChineseExpense(text: string): Partial<Expense> {
  const t = (text || '').trim()
  const exp: Partial<Expense> = {}

  // 金额：匹配“120 元/块/人民币”等
  const amountMatch = t.match(/(\d+[.]?\d*)\s*(元|块|人民币)?/)
  if (amountMatch) exp.amount = Number(amountMatch[1])

  // 天数：如“第3天”“Day 2”“D2”
  const dayMatch = t.match(/第\s*(\d+)\s*天|[Dd]ay\s*(\d+)|[Dd](\d+)/)
  if (dayMatch) exp.day = Number(dayMatch[1] || dayMatch[2] || dayMatch[3])

  // 分类关键词映射
  const map: Array<[RegExp, ExpenseCategory]> = [
    [/地铁|公交|打车|出租|高铁|机票|交通|滴滴/, 'transport'],
    [/酒店|宾馆|旅舍|客栈|民宿|住宿/, 'accommodation'],
    [/餐|午餐|晚餐|早餐|小吃|美食|咖啡|饮料/, 'food'],
    [/门票|票|入场|观演|展览|博物馆|乐园|景区/, 'tickets'],
    [/购物|买|礼物|特产|纪念品|服装|鞋/, 'shopping'],
  ]
  for (const [re, cat] of map) {
    if (re.test(t)) { exp.category = cat; break }
  }
  if (!exp.category) exp.category = 'other'

  // 备注：去除已识别片段后剩余文本
  exp.note = t
  return exp
}

export function aggregateExpenses(expenses: Expense[]) {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const byCategory: Record<ExpenseCategory, number> = {
    transport: 0, accommodation: 0, food: 0, tickets: 0, shopping: 0, other: 0,
  }
  const byDay: Record<number, number> = {}
  for (const e of expenses) {
    const cat = e.category || 'other'
    byCategory[cat] += e.amount || 0
    if (e.day) byDay[e.day] = (byDay[e.day] || 0) + (e.amount || 0)
  }
  return { total, byCategory, byDay }
}