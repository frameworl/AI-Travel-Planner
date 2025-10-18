import type { Itinerary, Expense } from '../types'
import { aggregateExpenses } from '../utils/expenses'

export default function ItineraryView({ data, expenses }: { data: Itinerary, expenses?: Expense[] }) {
  const exp = expenses || []
  const { total, byCategory, byDay } = aggregateExpenses(exp)
  const remaining = Math.max((data.budget || 0) - total, 0)

  return (
    <div style={{ marginTop: 24 }}>
      <h2>行程规划结果：{data.destination}（{data.days} 天）</h2>
      <p>总预算：{data.budget} 元，估算总花费：{data.estimateTotal} 元</p>

      {exp.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 12 }}>
          <strong>费用预算与管理</strong>
          <p>已记录开销：{total} 元；剩余预算：{remaining} 元</p>
          <p>分类统计：
            交通 {byCategory.transport} 元；
            住宿 {byCategory.accommodation} 元；
            餐饮 {byCategory.food} 元；
            门票 {byCategory.tickets} 元；
            购物 {byCategory.shopping} 元；
            其他 {byCategory.other} 元
          </p>
        </div>
      )}

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
          <p>当日预估：{day.totalEstimate} 元{byDay[day.day] ? `；已记录：${byDay[day.day]} 元` : ''}</p>
          {byDay[day.day] && day.totalEstimate && byDay[day.day] > (day.totalEstimate + 50) && (
            <p style={{ color: '#b91c1c' }}>提醒：当日已超出建议预算约 {byDay[day.day] - (day.totalEstimate || 0)} 元</p>
          )}
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