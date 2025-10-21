import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { parseChineseTrip } from './utils/parseInput'
import type { TripInput, Itinerary, Expense, ExpenseCategory, BudgetAnalysis } from './types'
import ItineraryView from './components/ItineraryView'
import { generateItinerary, analyzeBudget } from './services/llm'
import Map from './components/Map'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useXfyunIat } from './hooks/useXfyunIat'
import { parseChineseExpense, aggregateExpenses } from './utils/expenses'
import { initAuth, onAuthStateChanged, /* signIn, signUp,*/ signOut } from './services/auth'
import { initCloud, savePlan, listPlans, loadPlan, updatePlanExpenses, type PlanMeta } from './services/cloud'
import { useNavigate } from 'react-router-dom'

function App() {
  const [input, setInput] = useState<TripInput>({
    destination: '',
    days: 5,
    budget: 10000,
    people: 2,
    preferences: [],
  })
  const [voiceText, setVoiceText] = useState('')
  // 新增：本地 UI 状态，确保订阅回调能触发重渲染显示监听与错误
  const [asrListening, setAsrListening] = useState(false)
  const [asrError, setAsrError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Itinerary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  // 新增：用户与云端计划管理状态
  const [user, setUser] = useState<{ uid: string; email: string | null } | null>(null)
  const [plans, setPlans] = useState<PlanMeta[]>([])
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
  // 移除登录输入状态，改为在独立页面处理
  // const [authEmail, setAuthEmail] = useState('')
  // const [authPassword, setAuthPassword] = useState('')
  // const [authLoading, setAuthLoading] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  // const [authError, setAuthError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [expInput, setExpInput] = useState('')
  const [expDay, setExpDay] = useState<number | undefined>(undefined)
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('other')
  const [expAmount, setExpAmount] = useState<number>(0)
  const [expNote, setExpNote] = useState<string>('')
  // 新增：AI 预算分析状态
  const [analysis, setAnalysis] = useState<BudgetAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [activeDay, setActiveDay] = useState<number>(1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const asrProvider = ((import.meta.env.VITE_ASR_PROVIDER as string | undefined)?.toLowerCase()) || 'web'
  // 移除登录校验常量
  // const isEmailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail), [authEmail])
  // const canAuth = isEmailValid && (authPassword?.length || 0) >= 6
  const sr = useMemo(() => {
    if (asrProvider === 'xfyun') {
      return useXfyunIat({ lang: 'zh_cn' })
    }
    return useSpeechRecognition({ lang: 'zh-CN' })
  }, [asrProvider])
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)
    || (import.meta.env.VITE_DASHSCOPE_API_KEY ? 'dashscope' : (import.meta.env.VITE_OPENAI_API_KEY ? 'openai' : 'mock'))

  useEffect(() => {
    return sr.subscribe(() => {
      setVoiceText(sr.state.transcript)
      setAsrListening(sr.state.listening)
      setAsrError(sr.state.error)
    })
  }, [sr])
  // 初次生成结果后，默认选中第1日
  useEffect(() => {
    if (result?.daysPlan?.length) {
      setActiveDay(result.daysPlan[0].day)
    }
  }, [result])

  // 开发预览自动生成：支持通过 URL 参数触发
  // 用法示例：/ ?auto=1&destination=上海&days=3&budget=6000&people=2&preferences=美食,文化
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const auto = params.get('auto')
    // 仅在开发环境触发，避免线上误触
    const isDev = import.meta.env.DEV
    if (isDev && auto && !result && !loading) {
      const destination = (params.get('destination') || '上海').trim()
      const days = Number(params.get('days') || 3)
      const budget = Number(params.get('budget') || 6000)
      const people = Number(params.get('people') || 2)
      const prefsStr = (params.get('preferences') || '').trim()
      const preferences = prefsStr ? prefsStr.split(',').map(s => s.trim()).filter(Boolean) : []

      const tpl: TripInput = { destination, days, budget, people, preferences }
      setInput(tpl)
      setLoading(true)
      generateItinerary(tpl)
        .then((data) => setResult(data))
        .catch((e) => {
          console.warn('自动生成失败', e)
          alert('自动生成失败，请稍后重试')
        })
        .finally(() => setLoading(false))
    }
  }, [result, loading])

  function applyVoiceParse() {
    const parsed = parseChineseTrip(voiceText)
    setInput((prev) => ({
      ...prev,
      destination: parsed.destination ?? prev.destination,
      days: parsed.days ?? prev.days,
      budget: parsed.budget ?? prev.budget,
      people: parsed.people ?? prev.people,
      preferences: parsed.preferences?.length ? parsed.preferences : prev.preferences,
    }))
  }

  async function onGenerate() {
    setLoading(true)
    try {
      const data = await generateItinerary(input)
      setResult(data)
      setCurrentPlanId(null)
    } catch (e) {
      alert('生成失败，请稍后重试')
      console.warn(e)
    } finally {
      setLoading(false)
    }
  }

  function addExpenseFromText() {
    const parsed = parseChineseExpense(expInput)
    const newItem: Expense = {
      id: (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : String(Date.now()),
      amount: parsed.amount ?? 0,
      category: (parsed.category ?? 'other') as ExpenseCategory,
      day: parsed.day,
      note: expInput,
      createdAt: Date.now(),
    }
    setExpenses((prev) => [...prev, newItem])
    setExpInput('')
  }

  function addExpenseManual() {
    const newItem: Expense = {
      id: (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : String(Date.now()),
      amount: expAmount,
      category: expCategory,
      day: expDay,
      note: expNote,
      createdAt: Date.now(),
    }
    setExpenses((prev) => [...prev, newItem])
    setExpAmount(0)
    setExpNote('')
  }

  // 新增：触发 AI 预算分析
  async function onAnalyzeBudget() {
    if (!result) return
    setAnalysisLoading(true)
    try {
      const res = await analyzeBudget({ input, itinerary: result, expenses })
      setAnalysis(res)
    } catch (e) {
      alert('AI 预算分析失败，请稍后重试')
      console.warn(e)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const summary = aggregateExpenses(expenses)

  useEffect(() => {
    initAuth()
    const unsub = onAuthStateChanged(async (u) => {
      setUser(u ? { uid: u.uid, email: u.email } : null)
      initCloud(u || null)
      if (u) {
        try {
          const list = await listPlans()
          setPlans(list)
        } catch (e) {
          console.warn('刷新云端计划失败', e)
        }
      } else {
        setPlans([])
        setCurrentPlanId(null)
        // 未登录，跳转到登录页
        navigate('/login', { replace: true })
      }
    })
    return () => { unsub && unsub() }
  }, [navigate])

  async function saveCurrentPlan() {
    if (!user || !result) { alert('请先登录并生成行程'); return }
    setCloudLoading(true)
    try {
      const id = await savePlan(result, input, expenses)
      setCurrentPlanId(id)
      const list = await listPlans()
      setPlans(list)
      alert('已保存到云端')
    } catch (e) {
      alert('保存失败，请稍后重试')
      console.warn(e)
    } finally {
      setCloudLoading(false)
    }
  }

  async function loadPlanById(id: string) {
    setCloudLoading(true)
    try {
      const p = await loadPlan(id)
      if (!p) { alert('未找到计划'); return }
      setResult(p.itinerary)
      if (p.input) setInput(p.input)
      setExpenses(p.expenses || [])
      setCurrentPlanId(id)
    } catch (e) {
      alert('加载失败，请稍后重试')
      console.warn(e)
    } finally {
      setCloudLoading(false)
    }
  }

  // 云同步：费用变化时自动同步到当前计划
  useEffect(() => {
    if (!user || !currentPlanId) return
    updatePlanExpenses(currentPlanId, expenses).catch(e => console.warn('云同步费用失败', e))
  }, [expenses, user, currentPlanId])

  return (
    <div className="container">
      <h1>智能旅行规划</h1>
      <div className="section">
        <strong>用户管理与云同步</strong>
        {!user ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ color: '#6b7280' }}>请先登录以使用云同步与保存功能</div>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>前往登录页面</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <div>当前用户：{user.email || user.uid}</div>
            <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => { signOut() }}>退出登录</button>
              <button className="btn btn-outline" onClick={async () => { setCloudLoading(true); try { const list = await listPlans(); setPlans(list) } finally { setCloudLoading(false) } }} disabled={cloudLoading}>{cloudLoading ? '刷新中...' : '刷新云端计划'}</button>
              <button className="btn btn-primary" onClick={saveCurrentPlan} disabled={cloudLoading || !result}>{cloudLoading ? '保存中...' : '保存当前行程到云端'}</button>
            </div>
            <div style={{ gridColumn: '1 / span 2' }}>
              <label className="label">我的计划</label>
              <div className="toolbar" style={{ marginTop: 6 }}>
                {plans.map(p => (
                  <button className="btn btn-outline" key={p.id} onClick={() => loadPlanById(p.id)}>
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <section className="grid-2">
        <div>
          <label className="label">目的地</label>
          <input className="input" value={input.destination} onChange={(e) => setInput({ ...input, destination: e.target.value })} placeholder="例如：上海" />
        </div>
        <div>
          <label className="label">出行天数</label>
          <input className="input" type="number" value={input.days} onChange={(e) => setInput({ ...input, days: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">总预算（人民币）</label>
          <input className="input" type="number" value={input.budget} onChange={(e) => setInput({ ...input, budget: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">人数</label>
          <input className="input" type="number" value={input.people} onChange={(e) => setInput({ ...input, people: Number(e.target.value) })} />
        </div>
        <div style={{ gridColumn: '1 / span 2' }}>
          <label className="label">偏好（用逗号分隔，如：美食,动漫,亲子）</label>
          <input
            className="input"
            value={input.preferences.join(', ')}
            onChange={(e) => setInput({ ...input, preferences: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="例如：美食,文化,亲子"
          />
        </div>
        <div style={{ gridColumn: '1 / span 2' }}>
          {/* 新增：语音识别控制 */}
          <div className="toolbar">
            <button className="btn btn-outline" onClick={() => sr.start()} disabled={asrListening}>开始语音识别</button>
            <button className="btn btn-outline" onClick={() => sr.stop()} disabled={!asrListening}>停止语音识别</button>
            <span style={{ marginLeft: 12 }}>
              识别引擎：{asrProvider === 'xfyun' ? '科大讯飞' : '浏览器 Web Speech'}
            </span>
            <span style={{ marginLeft: 12, color: asrListening ? '#16a34a' : '#64748b' }}>
              语音状态：{asrListening ? '监听中' : '已停止'}{asrError ? `（错误：${asrError}）` : ''}
            </span>
          </div>
          {voiceText && (
            <div style={{ marginTop: 8, color: '#374151' }}>识别文本：{voiceText}</div>
          )}
        </div>
        <div style={{ gridColumn: '1 / span 2' }}>
          <div className="toolbar">
            <button className="btn btn-outline" onClick={applyVoiceParse} disabled={!voiceText}>将语音解析填充到表单</button>
            <button className="btn btn-primary" onClick={onGenerate} disabled={loading}>{loading ? '生成中...' : '生成行程'}</button>
            <span style={{ marginLeft: 12, color: '#64748b' }}>
              大模型引擎：{provider === 'dashscope' ? 'DashScope' : provider === 'openai' ? 'OpenAI' : '本地示例'}
            </span>
          </div>
        </div>
      </section>

      {result && (
        <section style={{ marginTop: 24, display: 'grid', gap: 12, gridTemplateColumns: sidebarCollapsed ? '1fr' : '2fr 1fr' }}>
          <div style={{ gridColumn: '1 / span 2', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
            >
              {sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            </button>
          </div>
          <div>
            <Map data={result} activeDay={activeDay} />
          </div>
          {!sidebarCollapsed && (
          <aside style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>日切换</strong>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {result.daysPlan.map((d) => (
                  <button
                    key={d.day}
                    onClick={() => setActiveDay(d.day)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      background: activeDay === d.day ? '#2563eb' : '#fff',
                      color: activeDay === d.day ? '#fff' : '#111827',
                      cursor: 'pointer',
                    }}
                  >
                    第{d.day}天
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2>费用预算与管理</h2>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label>快速录入（中文，如：午餐 120 元 第2天）</label>
                  <input value={expInput} onChange={(e) => setExpInput(e.target.value)} placeholder="示例：晚餐 85 元 第1天" />
                  <button onClick={addExpenseFromText} style={{ marginTop: 8 }}>解析并记录</button>
                </div>
                <div>
                  <label>手动录入</label>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <label>金额（元）</label>
                      <input type="number" value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value))} />
                    </div>
                    <div>
                      <label>分类</label>
                      <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}>
                        <option value="transport">交通</option>
                        <option value="accommodation">住宿</option>
                        <option value="food">餐饮</option>
                        <option value="tickets">门票</option>
                        <option value="shopping">购物</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div>
                      <label>第几天（可选）</label>
                      <input type="number" value={expDay ?? ''} onChange={(e) => setExpDay(e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                    <div>
                      <label>备注（可选）</label>
                      <input value={expNote} onChange={(e) => setExpNote(e.target.value)} placeholder="如：午餐、纪念品等" />
                    </div>
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <button onClick={addExpenseManual}>添加记录</button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <h3>费用汇总</h3>
                  <p>已记录总额：¥{summary.total}</p>
                  <p>剩余预算：¥{Math.max(0, input.budget - summary.total)}</p>
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                    {Object.entries(summary.byCategory).map(([cat, amt]) => (
                      <div key={cat}>{cat}：¥{amt}</div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button onClick={onAnalyzeBudget} disabled={analysisLoading}>{analysisLoading ? '分析中...' : 'AI 预算分析'}</button>
                  </div>

                  {analysis && (
                    <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                      <strong>AI 分析结论</strong>
                      <p style={{ marginTop: 6 }}>{analysis.overall}</p>
                      <div style={{ marginTop: 8 }}>
                        <strong>分类建议：</strong>
                        {analysis.categories.map((c, idx) => (
                          <p key={idx}>
                            {({
                              transport: '交通', accommodation: '住宿', food: '餐饮', tickets: '门票', shopping: '购物', other: '其他',
                            } as Record<ExpenseCategory, string>)[c.category]}：已用 ¥{c.spent}；建议：{c.suggestion}
                          </p>
                        ))}
                      </div>
                      {analysis.daily && analysis.daily.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <strong>每日提醒：</strong>
                          {analysis.daily.map((d, idx) => (
                            <p key={idx}>第 {d.day} 天：已用 ¥{d.spent ?? 0}，预估 ¥{d.estimated ?? 0}{d.warning ? `；提醒：${d.warning}` : ''}</p>
                          ))}
                        </div>
                      )}
                      {analysis.tips && analysis.tips.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <strong>小贴士：</strong>
                          <ul style={{ marginTop: 4 }}>
                            {analysis.tips.map((t, i) => (<li key={i}>{t}</li>))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <ItineraryView data={result} expenses={expenses} />
            </div>
          </aside>
          )}
        </section>
      )}
      </div>
    )

}

export default App
