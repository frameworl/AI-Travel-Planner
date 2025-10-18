import type { Itinerary, Expense } from '../types'
import { aggregateExpenses } from '../utils/expenses'

export default function ItineraryView({ data, expenses }: { data: Itinerary, expenses?: Expense[] }) {
  const exp = expenses || []
  const { total, byCategory, byDay } = aggregateExpenses(exp)
  const remaining = Math.max((data.budget || 0) - total, 0)

  const buildAmapLink = (name?: string, location?: string) => {
    if (location && name) {
      return `https://uri.amap.com/marker?position=${location}&name=${encodeURIComponent(name)}`
    }
    if (name) {
      return `https://www.amap.com/search?query=${encodeURIComponent(name)}`
    }
    return ''
  }

  // 新增：构造携程酒店搜索链接（城市+酒店关键词）
  const buildCtripHotelLink = (_city?: string, _hotelName?: string) => {
    // 已删除携程搜索链接功能，返回空字符串占位
    return ''
  }
  // 新增：计算当晚预算在 UI 中的展示值
  const computePerNightBudgetUI = (it: Itinerary, day: Itinerary['daysPlan'][number]) => {
    const baseDaily = (day.totalEstimate && day.totalEstimate > 0) ? day.totalEstimate : Math.round(((it.budget || 0) / Math.max(it.days || 1, 1)) || 0)
    let perNight = Math.round((baseDaily || 0) * 0.4)
    if (!isFinite(perNight) || perNight <= 0) perNight = 300
    return perNight
  }

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
              <li key={idx} style={{ marginBottom: 8 }}>
                <strong>{it.title}</strong>
                {it.timing ? `（${it.timing}）` : ''}
                {it.category ? ` · ${it.category}` : ''}
                {it.costEstimate ? ` · 约 ${it.costEstimate} 元` : ''}
                {it.description && (
                  <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>{it.description}</div>
                )}
                {it.category === 'food' && it.candidates && it.candidates.length > 0 && (
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}>
                    <em>其他候选餐厅：</em>
                    <ul style={{ margin: '4px 0 0 16px' }}>
                      {it.candidates.map((c, i) => {
                        const link = buildAmapLink(c.name, c.location)
                        return (
                          <li key={c.id || i}>
                            {c.name}
                            {c.costEstimate ? ` · 人均约 ¥${c.costEstimate}` : ''}
                            {c.address ? ` · ${c.address}` : ''}
                            {link && (
                              <>
                                {' '}
                                <a href={link} target="_blank" rel="noopener noreferrer">在高德打开</a>
                              </>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p>交通：{day.transport}；住宿：{day.accommodation}
            {day.accommodationName && (
              null
            )}
          </p>
          {day.accommodationCandidates && day.accommodationCandidates.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <em>候选酒店：</em>
              <ul style={{ margin: '4px 0 0 16px' }}>
                {day.accommodationCandidates.map((c) => (
                  <li key={c.id}>
                    {c.name}{typeof c.costEstimate === 'number' ? `（约¥${c.costEstimate}/晚）` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
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