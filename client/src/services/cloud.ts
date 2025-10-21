import type { TripInput, Itinerary, Expense } from '../types'
import type { AuthUser } from './auth'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, query, where, orderBy } from 'firebase/firestore'

export type PlanMeta = { id: string; title: string; destination: string; days: number; budget: number; updatedAt: number }
export type LoadedPlan = { id: string; itinerary: Itinerary; input?: TripInput; expenses?: Expense[] }

let cloudUser: AuthUser | null = null

function isFirebaseEnabled() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  return Boolean(apiKey && authDomain && projectId && appId)
}

function ensureFirebase() {
  if (!isFirebaseEnabled()) return null
  const apps = getApps()
  const app = apps.length ? getApp() : initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  })
  return { app, db: getFirestore(app) }
}

export function initCloud(user: AuthUser | null) { cloudUser = user }

function planTitleFrom(itinerary: Itinerary, input?: TripInput) {
  const dest = itinerary.destination || input?.destination || '未命名目的地'
  const days = itinerary.days || input?.days || 0
  const start = input?.startDate ? `（${input.startDate} 起）` : ''
  return `${dest} ${days} 天${start}`
}

// 保存当前行程为一个「计划」
export async function savePlan(itinerary: Itinerary, input?: TripInput, expenses?: Expense[]): Promise<string> {
  const uid = cloudUser?.uid || 'guest'
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
  const title = planTitleFrom(itinerary, input)
  const record = { id, uid, title, destination: itinerary.destination, days: itinerary.days, budget: itinerary.budget, updatedAt: Date.now(), itinerary, input, expenses: expenses || [] }
  const fb = ensureFirebase()
  if (fb && cloudUser) {
    await setDoc(doc(fb.db, 'plans', id), record)
    return id
  }
  // 本地存储
  const idxKey = `plan_index:${uid}`
  const dataKey = `plan_data:${uid}:${id}`
  const indexRaw = localStorage.getItem(idxKey)
  const index: PlanMeta[] = indexRaw ? JSON.parse(indexRaw) : []
  const meta: PlanMeta = { id, title, destination: record.destination, days: record.days, budget: record.budget, updatedAt: record.updatedAt }
  const newIndex = [meta, ...index.filter(m => m.id !== id)]
  localStorage.setItem(idxKey, JSON.stringify(newIndex))
  localStorage.setItem(dataKey, JSON.stringify(record))
  return id
}

// 列出当前用户的云端计划列表
export async function listPlans(): Promise<PlanMeta[]> {
  const uid = cloudUser?.uid || 'guest'
  const fb = ensureFirebase()
  if (fb && cloudUser) {
    const q = query(collection(fb.db, 'plans'), where('uid', '==', uid), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    const arr: PlanMeta[] = []
    snap.forEach(docu => {
      const d = docu.data() as any
      arr.push({ id: d.id, title: d.title, destination: d.destination, days: d.days, budget: d.budget, updatedAt: d.updatedAt })
    })
    return arr
  }
  const idxKey = `plan_index:${uid}`
  const indexRaw = localStorage.getItem(idxKey)
  const index: PlanMeta[] = indexRaw ? JSON.parse(indexRaw) : []
  return index.sort((a, b) => b.updatedAt - a.updatedAt)
}

// 加载指定计划
export async function loadPlan(id: string): Promise<LoadedPlan | null> {
  const uid = cloudUser?.uid || 'guest'
  const fb = ensureFirebase()
  if (fb && cloudUser) {
    const ref = doc(fb.db, 'plans', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const d = snap.data() as any
    return { id: d.id, itinerary: d.itinerary as Itinerary, input: d.input as TripInput | undefined, expenses: (d.expenses || []) as Expense[] }
  }
  const dataKey = `plan_data:${uid}:${id}`
  const raw = localStorage.getItem(dataKey)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    return { id: d.id, itinerary: d.itinerary as Itinerary, input: d.input as TripInput | undefined, expenses: (d.expenses || []) as Expense[] }
  } catch {
    return null
  }
}

// 更新计划中的费用记录
export async function updatePlanExpenses(id: string, expenses: Expense[]): Promise<void> {
  const uid = cloudUser?.uid || 'guest'
  const fb = ensureFirebase()
  if (fb && cloudUser) {
    const ref = doc(fb.db, 'plans', id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      await setDoc(ref, { ...(snap.data() as any), expenses, updatedAt: Date.now() })
      return
    }
    return
  }
  const dataKey = `plan_data:${uid}:${id}`
  const raw = localStorage.getItem(dataKey)
  if (!raw) return
  try {
    const d = JSON.parse(raw)
    d.expenses = expenses
    d.updatedAt = Date.now()
    localStorage.setItem(dataKey, JSON.stringify(d))
    const idxKey = `plan_index:${uid}`
    const indexRaw = localStorage.getItem(idxKey)
    const index: PlanMeta[] = indexRaw ? JSON.parse(indexRaw) : []
    const meta = index.find(m => m.id === id)
    if (meta) meta.updatedAt = d.updatedAt
    localStorage.setItem(idxKey, JSON.stringify(index))
  } catch {}
}