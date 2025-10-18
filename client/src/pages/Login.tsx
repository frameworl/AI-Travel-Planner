import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { initAuth, onAuthStateChanged, signIn, signUp } from '../services/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    initAuth()
    const unsub = onAuthStateChanged((u) => {
      if (u) navigate('/', { replace: true })
    })
    return () => { unsub && unsub() }
  }, [navigate])

  const isEmailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email])
  const canSubmit = isEmailValid && (password?.length || 0) >= 6

  return (
    <div className="page">
      <div className="card">
        <div style={{ textAlign: 'center' }}>
          <h2 className="heading">欢迎登录</h2>
          <p className="text-muted" style={{ marginTop: 8 }}>使用邮箱和密码登录或注册一个账号</p>
        </div>
        <div className="grid-auto" style={{ marginTop: 16 }}>
          <label className="label">邮箱</label>
          <input
            className="input"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            placeholder="you@example.com"
            type="email"
          />
          <label className="label" style={{ marginTop: 6 }}>密码</label>
          <input
            className="input"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
            placeholder="至少 6 位"
            type="password"
          />
          {error && <div className="text-danger" style={{ marginTop: 6 }}>{error}</div>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              disabled={loading || !canSubmit}
              onClick={async () => { setLoading(true); try { await signIn(email, password); setError(null) } catch (e) { const msg = (e as Error)?.message || '登录失败'; setError(msg) } finally { setLoading(false) } }}
              style={{ flex: 1 }}
            >{loading ? '登录中...' : '登录'}</button>
            <button
              className="btn btn-secondary"
              disabled={loading || !canSubmit}
              onClick={async () => { setLoading(true); try { await signUp(email, password); setError(null) } catch (e) { const msg = (e as Error)?.message || '注册失败'; setError(msg) } finally { setLoading(false) } }}
              style={{ flex: 1 }}
            >{loading ? '注册中...' : '注册'}</button>
          </div>
          <button className="btn btn-outline" onClick={() => navigate('/', { replace: true })} style={{ marginTop: 12 }}>返回首页</button>
        </div>
      </div>
    </div>
  )
}