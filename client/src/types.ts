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