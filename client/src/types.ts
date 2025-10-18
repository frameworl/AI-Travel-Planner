export interface TripInput {
  destination: string
  days: number
  budget: number
  people: number
  preferences: string[]
  startDate?: string
}

export interface PlanItem {
  title: string
  location?: string
  category?: 'sightseeing' | 'food' | 'shopping' | 'culture' | 'kids' | 'relax' | 'other'
  timing?: string
  costEstimate?: number
  notes?: string
}

export interface ItineraryDay {
  day: number
  summary: string
  items: PlanItem[]
  accommodation?: string
  transport?: string
  meals?: string[]
  totalEstimate?: number
}

export interface Itinerary {
  destination: string
  days: number
  budget: number
  estimateTotal: number
  daysPlan: ItineraryDay[]
  tips?: string[]
}

// 费用预算与管理
export type ExpenseCategory = 'transport' | 'accommodation' | 'food' | 'tickets' | 'shopping' | 'other'

export interface Expense {
  id: string
  day?: number // 关联行程第几天，可选
  category: ExpenseCategory
  amount: number
  note?: string
  createdAt: number
}

// AI 预算分析输出结构
export interface BudgetAnalysisCategory {
  category: ExpenseCategory
  spent: number
  suggestion: string
}

export interface BudgetAnalysisDay {
  day: number
  spent?: number
  estimated?: number
  warning?: string
}

export interface BudgetAnalysis {
  overall: string
  categories: BudgetAnalysisCategory[]
  daily: BudgetAnalysisDay[]
  tips: string[]
}