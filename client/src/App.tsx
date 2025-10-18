import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { parseChineseTrip } from './utils/parseInput'
import type { TripInput, Itinerary } from './types'
import ItineraryView from './components/ItineraryView'
import { generateItinerary } from './services/llm'

function App() {
  const [input, setInput] = useState<TripInput>({
    destination: '',
    days: 5,
    budget: 10000,
    people: 2,
    preferences: [],
  })
  const [voiceText, setVoiceText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Itinerary | null>(null)
  const sr = useMemo(() => useSpeechRecognition({ lang: 'zh-CN' }), [])

  useEffect(() => {
    return sr.subscribe(() => {
      setVoiceText(sr.state.transcript)
    })
  }, [sr])

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
    if (!input.destination || !input.days || !input.budget || !input.people) {
      alert('请完整填写：目的地、天数、预算、人数。偏好可选。')
      return
    }
    setLoading(true)
    try {
      const data = await generateItinerary(input)
      setResult(data)
    } catch (e) {
      alert('生成行程失败，请稍后重试。')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
      <h1>AI 旅行规划师 · 智能行程规划</h1>

      <section style={{ marginTop: 16, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label>目的地</label>
          <input
            value={input.destination}
            onChange={(e) => setInput({ ...input, destination: e.target.value })}
            placeholder="例如：日本东京"
          />
        </div>
        <div>
          <label>天数</label>
          <input
            type="number"
            value={input.days}
            onChange={(e) => setInput({ ...input, days: Number(e.target.value) })}
            min={1}
          />
        </div>
        <div>
          <label>预算（元）</label>
          <input
            type="number"
            value={input.budget}
            onChange={(e) => setInput({ ...input, budget: Number(e.target.value) })}
            min={0}
          />
        </div>
        <div>
          <label>同行人数</label>
          <input
            type="number"
            value={input.people}
            onChange={(e) => setInput({ ...input, people: Number(e.target.value) })}
            min={1}
          />
        </div>
        <div style={{ gridColumn: '1 / span 2' }}>
          <label>偏好（用逗号分隔，如：美食,动漫,亲子）</label>
          <input
            value={input.preferences.join(',')}
            onChange={(e) => setInput({ ...input, preferences: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="可选：美食, 动漫, 亲子, 购物, 文化, 放松"
          />
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => sr.start()} disabled={sr.state.listening}>🎤 开始语音</button>
          <button onClick={() => sr.stop()} disabled={!sr.state.listening}>⏹️ 停止语音</button>
          <span style={{ color: sr.state.listening ? '#16a34a' : '#555' }}>
            {sr.state.listening ? '正在听...' : '未录音'}
          </span>
          {sr.state.error && <span style={{ color: '#dc2626' }}>错误：{sr.state.error}</span>}
        </div>
        <textarea
          style={{ width: '100%', height: 90, marginTop: 8 }}
          placeholder="语音/文字自由描述，例如：我想去日本，5天，预算1万元，喜欢美食和动漫，带孩子。"
          value={voiceText}
          onChange={(e) => setVoiceText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={applyVoiceParse}>解析到表单</button>
          <button onClick={onGenerate} disabled={loading}>{loading ? '生成中...' : '生成行程'}</button>
        </div>
        {!import.meta.env.VITE_OPENAI_API_KEY && (
          <p style={{ marginTop: 8, color: '#6b7280' }}>
            当前未配置 AI API Key，生成结果使用本地模拟。配置方法见 client/.env.example。
          </p>
        )}
      </section>

      {result && <ItineraryView data={result} />}
    </div>
  )
}

export default App
