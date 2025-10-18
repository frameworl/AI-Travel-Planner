import type { TripInput } from '../types'

export function parseChineseTrip(text: string): Partial<TripInput> {
  const result: Partial<TripInput> = {}
  let t = text.trim()

  // 目的地：匹配“去XX”或“目的地XX”或“去日本东京”等
  const destMatch = t.match(/(去|目的地|想去)([\u4e00-\u9fa5A-Za-z\s]+)/)
  if (destMatch) {
    const raw = destMatch[2].trim()
    result.destination = raw.replace(/(玩|旅游|旅行|市|省)$/,'').trim()
  }

  // 天数：如“5天”“七天”或“3 日”
  const daysMatch = t.match(/(\d+|[一二三四五六七八九十]+)\s*(天|日)/)
  if (daysMatch) {
    const numStr = daysMatch[1]
    result.days = chineseNumberToArabic(numStr)
  }

  // 预算：如“预算1万元”“10000元”“一万块”
  const budgetMatch = t.match(/(预算|大概|约|大约)?\s*(\d+[.]?\d*)\s*(万|千)?\s*(元|块)?/)
  if (budgetMatch) {
    const base = parseFloat(budgetMatch[2])
    const unit = budgetMatch[3]
    result.budget = unit === '万' ? base * 10000 : unit === '千' ? base * 1000 : base
  }

  // 人数：如“同行3人”“两大一小”“带孩子”
  const peopleMatch = t.match(/(\d+)\s*人/)
  if (peopleMatch) {
    result.people = parseInt(peopleMatch[1])
  } else if (/带孩子|亲子|两大一小|一家(三口|四口)/.test(t)) {
    result.people = 3
  }

  // 偏好：关键词映射
  const prefs: string[] = []
  if (/美食|吃|餐厅/.test(t)) prefs.push('food')
  if (/动漫|二次元|ACG/.test(t)) prefs.push('anime')
  if (/亲子|孩子|家庭|乐园/.test(t)) prefs.push('kids')
  if (/购物|商场|买买买/.test(t)) prefs.push('shopping')
  if (/文化|历史|博物馆|遗址/.test(t)) prefs.push('culture')
  if (/放松|度假|轻松|泡温泉/.test(t)) prefs.push('relax')
  result.preferences = prefs

  return result
}

function chineseNumberToArabic(numStr: string): number {
  if (/^\d+$/.test(numStr)) return parseInt(numStr)
  const map: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  }
  if (numStr.length === 1) return map[numStr] || 1
  if (numStr === '十') return 10
  if (numStr.startsWith('十')) return 10 + (map[numStr[1]] || 0)
  if (numStr.endsWith('十')) return (map[numStr[0]] || 1) * 10
  return 5
}