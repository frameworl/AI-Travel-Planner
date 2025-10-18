import type { Itinerary } from '../types'

export default function ItineraryView({ data }: { data: Itinerary }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h2>行程规划结果：{data.destination}（{data.days} 天）</h2>
      <p>总预算：{data.budget} 元，估算总花费：{data.estimateTotal} 元</p>
      {data.daysPlan.map((day) => (
        <div key={day.day} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 12 }}>
          <h3>第 {day.day} 天</h3>
          <p>{day.summary}</p>
          <ul>
            {day.items.map((it, idx) => (
              <li key={idx}>
                <strong>{it.title}</strong>
                {it.timing ? `（${it.timing}）` : ''}
                {it.category ? ` · ${it.category}` : ''}
                {it.costEstimate ? ` · 约 ${it.costEstimate} 元` : ''}
              </li>
            ))}
          </ul>
          <p>交通：{day.transport}；住宿：{day.accommodation}</p>
          <p>用餐：{day.meals?.join(' / ')}</p>
          <p>当日预估：{day.totalEstimate} 元</p>
        </div>
      ))}
      {data.tips && data.tips.length > 0 && (
        <div style={{ background: '#f7fafc', border: '1px dashed #ddd', padding: 12, marginTop: 12 }}>
          <strong>小贴士：</strong>
          <ul>
            {data.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}