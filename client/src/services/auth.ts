import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged as firebaseOnAuthStateChanged, signInWithEmailAndPassword as firebaseSignIn, createUserWithEmailAndPassword as firebaseSignUp, signOut as firebaseSignOut, type Auth } from 'firebase/auth'

export type AuthUser = { uid: string; email: string | null; provider: 'firebase' | 'local' }

let firebaseApp: FirebaseApp | null = null
let auth: Auth | null = null
let currentUser: AuthUser | null = null
let subscribers: Array<(u: AuthUser | null) => void> = []

// 本地用户模型与工具
type LocalUser = { id: string; email: string; passwordHash: string }
const KEY_AUTH_USER = 'mock_auth_user'
const KEY_USERS = 'mock_auth_users'

function isFirebaseEnabled() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  return Boolean(apiKey && authDomain && projectId && appId)
}

async function hashPassword(password: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    const arr = Array.from(new Uint8Array(buf))
    return arr.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // 回退：非安全，仅用于本地模拟
    try { return btoa(password) } catch { return password }
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
function validatePassword(password: string): boolean { return (password || '').length >= 6 }

function loadUsers(): LocalUser[] {
  const raw = localStorage.getItem(KEY_USERS)
  if (!raw) return []
  try { return JSON.parse(raw) as LocalUser[] } catch { return [] }
}
function saveUsers(users: LocalUser[]) { localStorage.setItem(KEY_USERS, JSON.stringify(users)) }
function findUser(email: string): LocalUser | undefined { return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) }
function setCurrentUserLocal(u: LocalUser) {
  currentUser = { uid: u.id, email: u.email, provider: 'local' }
  localStorage.setItem(KEY_AUTH_USER, JSON.stringify(currentUser))
}

export function initAuth() {
  if (isFirebaseEnabled() && !firebaseApp) {
    firebaseApp = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
      appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
    })
    auth = getAuth(firebaseApp)
    firebaseOnAuthStateChanged(auth, (u) => {
      currentUser = u ? { uid: u.uid, email: u.email, provider: 'firebase' } : null
      subscribers.forEach(fn => fn(currentUser))
    })
  } else {
    // 本地模拟账户：从 localStorage 读取当前登录态
    const raw = localStorage.getItem(KEY_AUTH_USER)
    if (raw) {
      try { currentUser = JSON.parse(raw) as AuthUser } catch {}
    }
    subscribers.forEach(fn => fn(currentUser))
  }
}

export function onAuthStateChanged(fn: (u: AuthUser | null) => void) {
  subscribers.push(fn)
  fn(currentUser)
  return () => { subscribers = subscribers.filter(s => s !== fn) }
}

export async function signUp(email: string, password: string): Promise<AuthUser> {
  if (isFirebaseEnabled() && auth) {
    const cred = await firebaseSignUp(auth, email, password)
    currentUser = { uid: cred.user.uid, email: cred.user.email, provider: 'firebase' }
    subscribers.forEach(fn => fn(currentUser))
    return currentUser!
  }
  // 本地注册（严格校验）
  if (!validateEmail(email)) throw new Error('请输入有效邮箱地址')
  if (!validatePassword(password)) throw new Error('密码至少6位')
  const exists = findUser(email)
  if (exists) throw new Error('该邮箱已注册')
  const users = loadUsers()
  const id = crypto.randomUUID ? crypto.randomUUID() : `local_${Date.now()}`
  const passwordHash = await hashPassword(password)
  const localUser: LocalUser = { id, email, passwordHash }
  users.push(localUser)
  saveUsers(users)
  setCurrentUserLocal(localUser)
  subscribers.forEach(fn => fn(currentUser))
  return currentUser!
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (isFirebaseEnabled() && auth) {
    const cred = await firebaseSignIn(auth, email, password)
    currentUser = { uid: cred.user.uid, email: cred.user.email, provider: 'firebase' }
    subscribers.forEach(fn => fn(currentUser))
    return currentUser!
  }
  // 本地登录（校验邮箱与密码匹配）
  if (!validateEmail(email)) throw new Error('请输入有效邮箱地址')
  if (!validatePassword(password)) throw new Error('密码至少6位')
  const u = findUser(email)
  if (!u) throw new Error('邮箱或密码错误')
  const inputHash = await hashPassword(password)
  if (u.passwordHash !== inputHash) throw new Error('邮箱或密码错误')
  setCurrentUserLocal(u)
  subscribers.forEach(fn => fn(currentUser))
  return currentUser!
}

export async function signOut(): Promise<void> {
  if (isFirebaseEnabled() && auth) {
    await firebaseSignOut(auth)
    currentUser = null
    subscribers.forEach(fn => fn(currentUser))
    return
  }
  localStorage.removeItem(KEY_AUTH_USER)
  currentUser = null
  subscribers.forEach(fn => fn(currentUser))
}

export function getCurrentUser(): AuthUser | null { return currentUser }
export function isCloudAuth(): boolean { return isFirebaseEnabled() }