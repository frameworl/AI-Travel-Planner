// amap.ts - Enhance itinerary with Amap (Gaode) POIs

import type { Itinerary, ItineraryDay as PlanDay, PlanItem, TransportSegment } from '../types';

export type AMapPoi = {
  id: string;
  name: string;
  address?: string;
  adname?: string;
  location?: string; // "lon,lat"
  type?: string;
  typecode?: string;
  biz_type?: string;
  tel?: string;
  // 增加可选的扩展字段，便于解析酒店价格与评分
  biz_ext?: {
    cost?: string | string[];
    rating?: string | string[];
    lowest_price?: string | string[];
    star?: string | string[];
  };
};

export async function getAmapKey(): Promise<string | null> {
  const key = import.meta.env.VITE_AMAP_KEY;
  if (!key || typeof key !== 'string' || key.trim() === '') return null;
  return key.trim();
}

export async function searchPlaceText(query: string, city?: string, extra?: { types?: string; }): Promise<AMapPoi[]> {
  const key = await getAmapKey();
  if (!key) return [];
  const params = new URLSearchParams({
    key,
    keywords: query,
  });
  if (city) params.set('city', city);
  if (extra?.types) params.set('types', extra.types);
  // 强制中文输出，提升国内检索一致性
  params.set('output', 'JSON');
  const url = `https://restapi.amap.com/v5/place/text?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pois = (data?.pois ?? []) as AMapPoi[];
    return pois;
  } catch {
    return [];
  }
}

export function isGenericTitle(title: string): boolean {
  const t = (title || '').trim();
  return [
    '便捷酒店', '推荐酒店', '酒店', '宾馆',
    '市中心地标广场', '热门商圈', '特色街区',
    '本地人气餐厅', '必打卡景点', '经典博物馆',
  ].some(k => t.includes(k));
}

export function deriveKeywords(item: PlanItem): string[] {
  const s = `${item.title || ''} ${item.description || ''} ${item.location || ''}`.trim();
  const ks: string[] = [];
  // 优先关键字
  const hotelHints = ['酒店', '宾馆', '旅舍', '客栈', '青年旅舍', '商务酒店', '精品酒店'];
  const poiHints = ['景点', '博物馆', '美食', '餐厅', '地标', '购物'];
  if (hotelHints.some(h => s.includes(h))) ks.push(...hotelHints);
  if (poiHints.some(h => s.includes(h))) ks.push(...poiHints);
  // 添加原始词
  if (item.title) ks.push(item.title);
  if (item.description) ks.push(item.description);
  if (item.location) ks.push(item.location);
  return Array.from(new Set(ks)).slice(0, 6);
}

// 解析酒店最低价：仅使用 biz_ext.lowest_price，不再回落到 cost，加入合理区间校验
function parseHotelLowestPrice(hotel: AMapPoi): number | null {
  const bx: any = hotel?.biz_ext ?? {};
  const val = bx?.lowest_price;
  const tryParse = (v: any): number | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
      for (const e of v) {
        const n = tryParse(e);
        if (n != null) return n;
      }
      return null;
    }
    if (typeof v === 'number') {
      const n = Math.round(v);
      return isFinite(n) && n >= 60 && n <= 10000 ? n : null;
    }
    if (typeof v === 'string') {
      const m = v.match(/(\d+(?:\.\d+)?)/);
      if (!m) return null;
      const n = Math.round(Number(m[1]));
      return isFinite(n) && n >= 60 && n <= 10000 ? n : null;
    }
    return null;
  };
  return tryParse(val);
}

// 解析评分（0-5）
function parseRating(poi: AMapPoi): number | null {
  const bx: any = poi?.biz_ext ?? {};
  const val = bx?.rating;
  const tryParse = (v: any): number | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
      for (const e of v) {
        const n = tryParse(e);
        if (n != null) return n;
      }
      return null;
    }
    if (typeof v === 'number') {
      const n = Number(v);
      return isFinite(n) && n > 0 && n <= 5 ? n : null;
    }
    if (typeof v === 'string') {
      const m = v.match(/(\d+(?:\.\d+)?)/);
      if (!m) return null;
      const n = Number(m[1]);
      return isFinite(n) && n > 0 && n <= 5 ? n : null;
    }
    return null;
  };
  return tryParse(val);
}

// 计算每晚住宿预算：优先使用每日估算均值，其次使用总预算/天，再次使用兜底值
function computePerNightBudget(it: Itinerary): number {
  const dailyEstimates = (it.daysPlan || []).map(d => d.totalEstimate || 0).filter(n => n > 0);
  const daily = dailyEstimates.length
    ? Math.round(dailyEstimates.reduce((a, b) => a + b, 0) / dailyEstimates.length)
    : Math.round(((it.budget || 0) / Math.max(it.days || 1, 1)) || 0);
  let perNight = Math.round((daily || 0) * 0.4);
  if (!isFinite(perNight) || perNight <= 0) perNight = 300;
  return perNight;
}

// 解析餐饮人均消费：优先使用 biz_ext.cost
function parsePoiCost(poi: AMapPoi): number | null {
  const bx: any = poi?.biz_ext ?? {};
  const val = bx?.cost;
  if (val == null) return null;
  const tryParse = (v: any): number | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
      for (const e of v) {
        const n = tryParse(e);
        if (n != null) return n;
      }
      return null;
    }
    if (typeof v === 'number') {
      const n = Math.round(v);
      return isFinite(n) && n > 0 ? n : null;
    }
    if (typeof v === 'string') {
      const m = v.match(/(\d+(?:\.\d+)?)/);
      if (!m) return null;
      const n = Math.round(Number(m[1]));
      return isFinite(n) && n > 0 ? n : null;
    }
    return null;
  };
  return tryParse(val);
}

// 计算每餐预算：按每日预算的30%为餐饮，平均到当日餐饮条目数
function computePerMealBudget(it: Itinerary, day: PlanDay): number {
  const daily = (day.totalEstimate && day.totalEstimate > 0)
    ? day.totalEstimate
    : Math.round(((it.budget || 0) / Math.max(it.days || 1, 1)) || 0);
  const foodCount = day.items.filter(i => i.category === 'food').length || 1;
  let perMeal = Math.round((daily * 0.3) / foodCount);
  if (!isFinite(perMeal) || perMeal <= 0) perMeal = 50;
  return perMeal;
}

// 推荐餐饮候选：按预算接近度排序，返回前 N 个
async function recommendFoodCandidates(keywords: string[], city?: string, budget?: number, max: number = 3, excludeId?: string): Promise<AMapPoi[]> {
  const seen = new Set<string>();
  const all: AMapPoi[] = [];
  for (const kw of keywords) {
    const pois = await searchPlaceText(kw, city, { types: '餐饮服务' });
    for (const p of pois) {
      if (excludeId && p.id === excludeId) continue;
      if (seen.has(p.id)) continue;
      const tc = p.typecode || '';
      if (!tc.startsWith('05')) continue; // 只保留餐饮类
      seen.add(p.id);
      all.push(p);
    }
  }
  if (budget && isFinite(budget) && budget > 0) {
    all.sort((a, b) => {
      const ca = parsePoiCost(a);
      const cb = parsePoiCost(b);
      const da = ca == null ? Number.POSITIVE_INFINITY : Math.abs(ca - budget);
      const db = cb == null ? Number.POSITIVE_INFINITY : Math.abs(cb - budget);
      return da - db;
    });
  }
  return all.slice(0, max);
}

export async function pickSpecificPlaceForItem(item: PlanItem, city?: string, budgetHint?: number): Promise<AMapPoi | null> {
  const keywords = deriveKeywords(item);
  // 如果看起来是酒店相关或餐饮相关，限定类型
  const isHotelLike = keywords.some(k => ['酒店', '宾馆', '旅舍', '客栈', '青年旅舍', '商务酒店', '精品酒店'].includes(k));
  const isFoodLike = (item.category === 'food') || keywords.some(k => ['餐厅', '美食', '小吃', '咖啡馆'].includes(k));
  const types = isHotelLike ? '住宿服务;宾馆酒店' : (isFoodLike ? '餐饮服务' : undefined);
  const budget = typeof budgetHint === 'number' && isFinite(budgetHint) && budgetHint > 0 ? budgetHint : undefined;

  for (const kw of keywords) {
    const pois = await searchPlaceText(kw, city, { types });
    if (!pois.length) continue;
    // 优先 hotel/food 类型命中
    const filtered = pois.filter(p => {
      const tc = (p.typecode || '');
      const tp = (p.type || '');
      const isHotelPoi = (p.biz_type === 'hotel') || tc.startsWith('10') || tp.includes('酒店') || tp.includes('宾馆');
      return isHotelLike ? isHotelPoi
        : isFoodLike ? tc.startsWith('05') /* 餐饮大类 */
        : true;
    });
    const sortedBase = filtered.length ? filtered : pois;

    // 按预算最大化策略（酒店按最低价，餐饮按人均）：尽量“花满预算”
    if (budget) {
      const scored = sortedBase.map(p => ({
        poi: p,
        price: isHotelLike ? parseHotelLowestPrice(p) : (isFoodLike ? parsePoiCost(p) : null),
        rating: parseRating(p) ?? 0,
      }));
      const withPrice = scored.filter(x => x.price != null) as Array<{poi: AMapPoi; price: number; rating: number}>;
      if (withPrice.length) {
        const under = withPrice.filter(x => x.price <= (budget as number))
        if (under.length) {
          under.sort((a, b) => {
            if (a.price !== b.price) return (b.price as number) - (a.price as number) // 预算内越贵越优
            return b.rating - a.rating
          })
          return under[0].poi
        }
        const over = withPrice.filter(x => x.price > (budget as number))
        if (over.length) {
          over.sort((a, b) => {
            if (a.price !== b.price) return (a.price as number) - (b.price as number) // 预算外尽量接近
            return b.rating - a.rating
          })
          return over[0].poi
        }
      }
      // 无价格时，按评分降序作为备选
      if (isHotelLike || isFoodLike) {
        const byRating = scored.sort((a, b) => b.rating - a.rating);
        if (byRating[0]) return byRating[0].poi;
      }
    }

    const pick = sortedBase[0];
    if (pick) return pick;
  }

  // 兜底：酒店用城市+酒店检索并优先选择有最低价的项
  const isHotelOverall = keywords.some(k => ['酒店', '宾馆', '旅舍', '客栈', '青年旅舍', '商务酒店', '精品酒店'].includes(k));
  if (isHotelOverall) {
    const pois = await searchPlaceText(`${city ?? ''} 酒店`, city, { types: '住宿服务;宾馆酒店' });
    const withPrice = pois
      .map(p => ({ poi: p, price: parseHotelLowestPrice(p) }))
      .filter(x => x.price != null) as Array<{poi: AMapPoi; price: number}>;
    if (withPrice.length) {
      // 预算内尽量贵，否则预算外尽量接近
      const under = withPrice.filter(x => (budget != null) ? (x.price as number) <= budget : true)
      if (under.length) {
        under.sort((a, b) => (b.price as number) - (a.price as number))
        return under[0].poi
      }
      withPrice.sort((a, b) => Math.abs((a.price as number) - (budget as number)) - Math.abs((b.price as number) - (budget as number)))
      return withPrice[0].poi
    }
    if (pois[0]) return pois[0];
  }

  // 通用兜底
  const fallback = await searchPlaceText(`${city ?? ''} 旅游景点`, city);
  return fallback[0] || null;
}

export async function enrichItineraryWithAmap(it: Itinerary): Promise<Itinerary> {
  const city = it.destination;
  const key = await getAmapKey();
  if (!key) return it; // 无 key 时直接返回原计划

  const perNightBudget = computePerNightBudget(it);
  const dailyBudget = Math.round((it.budget || 0) / Math.max(it.days || 1, 1));

  const newDays: PlanDay[] = [];
  for (const day of it.daysPlan) {
    const newItems: PlanItem[] = [];
    const perMealBudget = computePerMealBudget(it, day);

    for (const item of day.items) {
      let updated = { ...item };
      const budgetHint = item.category === 'food' ? perMealBudget : undefined;
      const shouldReplace = isGenericTitle(item.title) || ['food','sightseeing','culture','shopping'].includes((item.category || '') as string);
      if (shouldReplace) {
        const poi = await pickSpecificPlaceForItem(item, city, budgetHint);
        if (poi) {
          const addr = `${poi.adname || ''} ${poi.address || ''}`.trim();
          const tel = poi.tel ? `，电话：${poi.tel}` : '';
          const foodCost = item.category === 'food' ? parsePoiCost(poi) : null;
          updated = {
            ...updated,
            title: isGenericTitle(item.title) ? (poi.name || updated.title) : updated.title,
            description: addr ? `${addr}${tel}` : updated.description,
            costEstimate: foodCost ?? updated.costEstimate,
            location: poi.location || updated.location,
          };
          // 附加其他候选餐厅
          if (item.category === 'food') {
            const candidates = await recommendFoodCandidates(deriveKeywords(item), city, budgetHint, 3, poi.id);
            const names = candidates.map(c => c.name).filter(Boolean);
            if (names.length) {
              const extra = `。其他候选：${names.join('、')}`;
              updated.description = updated.description ? `${updated.description}${extra}` : extra;
            }
            // 结构化候选用于 UI 展示
            updated.candidates = candidates.map(c => ({
              id: c.id,
              name: c.name,
              location: c.location,
              address: `${c.adname || ''} ${c.address || ''}`.trim(),
              tel: c.tel,
              costEstimate: parsePoiCost(c) ?? undefined,
            }));
          }
        }
      }
      newItems.push(updated);
    }

    // 住宿替换逻辑：若为模板或通用词，尝试用真实酒店替换
    const acc = day.accommodation || '';
    const isTemplate = !acc || /便捷酒店|推荐酒店|酒店|宾馆/.test(acc);
    let newAcc = acc;
    let accCost: number | null = null;
    // 新增：住宿酒店名称供 UI 外部链接使用
    let accName: string | undefined = undefined;
    // 新增：候选酒店列表用于 UI 展示
    let accCandidates: PlanItem['candidates'] | undefined = undefined;
    if (isTemplate) {
      // 先向大模型要 1-3 个酒店建议
      const llmList = await askLLMHotels(city || '', perNightBudget, 3).catch(() => [])
      if (llmList && llmList.length) {
        // 用高德查找每个建议的 POI，丰富价格/地址/坐标
        const cand: PlanItem['candidates'] = []
        for (const s of llmList) {
          const pois = await searchPlaceText(s.name, city, { types: '住宿服务;宾馆酒店' })
          const poi = pois[0]
          cand.push({
            id: poi?.id || s.name,
            name: s.name,
            location: poi?.location,
            address: poi ? `${poi.adname || ''} ${poi.address || ''}`.trim() : s.address,
            tel: poi?.tel,
            costEstimate: (poi ? parseHotelLowestPrice(poi) ?? undefined : undefined) ?? (s.referencePrice ?? undefined),
          })
        }
        // 选择预算内越贵越优，否则预算外尽量接近
        const withPrice = cand.filter(c => c.costEstimate != null) as Array<Required<CandidatePlace>>
        if (withPrice.length) {
          const under = withPrice.filter(x => (x.costEstimate as number) <= perNightBudget)
          let pick: typeof withPrice[0]
          if (under.length) {
            under.sort((a, b) => (b.costEstimate as number) - (a.costEstimate as number))
            pick = under[0]
          } else {
            withPrice.sort((a, b) => Math.abs((a.costEstimate as number) - perNightBudget) - Math.abs((b.costEstimate as number) - perNightBudget))
            pick = withPrice[0]
          }
          accCandidates = cand
          accName = pick.name
          accCost = pick.costEstimate as number
          newAcc = `推荐酒店（LLM）：${pick.name}（约¥${accCost}/晚；价格来源：高德/LLM）`
        } else {
          // 没有价格信息时，取首个建议作为展示
          const pick = cand[0] || { id: llmList[0].name, name: llmList[0].name }
          accCandidates = cand
          accName = pick.name
          newAcc = `推荐酒店（LLM）：${pick.name}（价格来源：LLM；待确认）`
        }
      } else {
        // 回落到原先的高德选择逻辑
        const hotelCandidate: PlanItem = { title: '酒店', description: '推荐酒店' } as PlanItem;
        const hotel = await pickSpecificPlaceForItem(hotelCandidate, city, perNightBudget);
        if (hotel) {
          const addr = `${hotel.adname || ''} ${hotel.address || ''}`.trim();
          const nightlyLowest = parseHotelLowestPrice(hotel);
          accCost = nightlyLowest ?? null;
          const rating = parseRating(hotel);
          const ratingText = rating ? `，评分${rating}/5` : '';
          accName = hotel.name;
          if (nightlyLowest != null) {
            newAcc = `推荐酒店：${hotel.name}（约¥${nightlyLowest}/晚，${addr}${ratingText}；价格来源：高德最低价）`;
          } else {
            newAcc = `推荐酒店：${hotel.name}（${addr}${ratingText}；价格来源：未知）`;
          }
        } else if (!newAcc) {
          newAcc = `推荐酒店：市中心便捷酒店（价格来源：未知）`;
        }
      }
    }

    // 交通估算：基于当日已选 POI 的经纬度，假设每段打车
    const transportEst = computeDayTransportEstimate(newItems)
    const transportText = transportEst.fare > 0
      ? `城市内交通：总距离约 ${transportEst.distanceKm} km，估算打车合计约 ¥${transportEst.fare}（价格来源：估算）`
      : (day.transport || '城市内交通：暂无估算（待地点具体化）')

    // 新增：生成交通段详情列表（基于距离与预算的启发式）
    const segments = computeTransportSegments(newItems, dailyBudget)

    // 更新当日总估算：以“实际项目+交通+住宿最低价”为准，避免预算/天重复计入
    const itemsSum = newItems.reduce((sum, it) => sum + (it.costEstimate || 0), 0)
    const accDaily = (accCost != null) ? accCost : perNightBudget
    const dailyEstimate = Math.max(0, Math.round(itemsSum + (transportEst.fare || 0) + (accDaily || 0)))

    newDays.push({ ...day, items: newItems, accommodation: newAcc, accommodationName: accName, accommodationCandidates: accCandidates, transport: transportText, transportSegments: segments, totalEstimate: dailyEstimate });
  }

  return { ...it, daysPlan: newDays };
}

// 解析经纬度字符串为数值
function parseLonLat(loc?: string): [number, number] | null {
  if (!loc || typeof loc !== 'string') return null
  const m = loc.match(/\s*([\-\d.]+)\s*,\s*([\-\d.]+)\s*/)
  if (!m) return null
  const lon = Number(m[1]); const lat = Number(m[2])
  if (!isFinite(lon) || !isFinite(lat)) return null
  return [lon, lat]
}

// 计算两点球面距离（km）
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)))
  return Math.round(R * c * 10) / 10
}

// 粗略估算出租车费用（人民币）：3km内起步¥13，其后每公里¥2.6；深夜等未计入
function estimateTaxiFare(distanceKm: number): number {
  if (!isFinite(distanceKm) || distanceKm <= 0) return 0
  const base = 13
  const perKm = 2.6
  const beyond = Math.max(distanceKm - 3, 0)
  const price = base + beyond * perKm
  return Math.max(13, Math.round(price))
}

// 计算当日基于已选 POI 的累计打车距离与费用
function computeDayTransportEstimate(items: PlanItem[]): { distanceKm: number; fare: number } {
  const coords: [number, number][] = []
  for (const it of items) {
    const c = parseLonLat(it.location)
    if (c) coords.push(c)
  }
  if (coords.length < 2) return { distanceKm: 0, fare: 0 }
  let totalKm = 0
  let totalFare = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineKm(coords[i], coords[i + 1])
    totalKm += d
    totalFare += estimateTaxiFare(d)
  }
  totalKm = Math.round(totalKm * 10) / 10
  return { distanceKm: totalKm, fare: Math.round(totalFare) }
}

// 新增：按两两相邻项目生成交通段详情
function computeTransportSegments(items: PlanItem[], dailyBudget: number): TransportSegment[] {
  const segments: TransportSegment[] = []
  const coords: { idx: number; title: string; loc?: [number, number]; raw?: string }[] = items.map((it, idx) => ({
    idx,
    title: it.title,
    loc: parseLonLat(it.location) || undefined,
    raw: it.location,
  }))
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]
    const b = coords[i + 1]
    if (!a.loc || !b.loc) continue
    const d = haversineKm(a.loc, b.loc)
    let mode: TransportSegment['mode']
    let timeMin = 0
    let fare: number | undefined
    let notes: string | undefined
    const budgetLow = dailyBudget <= 400
    const hasMetroHint = (a.raw || '')?.includes('地铁') || (b.raw || '')?.includes('地铁')
    if (d <= 1.5) {
      mode = 'walk'
      timeMin = Math.round(d * 14)
      notes = '距离较近，建议步行'
    } else if (d <= 6) {
      mode = hasMetroHint ? 'metro' : 'bus'
      timeMin = Math.round(d / 18 * 60 + 10) // 城内平均速度+候车换乘
      fare = mode === 'metro' ? Math.max(4, Math.round(4 + d / 10)) : 3
      notes = mode === 'metro' ? '优先地铁，稳定准时' : '公交更经济'
    } else {
      mode = budgetLow ? (hasMetroHint ? 'metro' : 'bus') : 'taxi'
      timeMin = Math.round(d / 24 * 60 + (mode === 'taxi' ? 4 : 12))
      fare = mode === 'taxi' ? Math.round(estimateTaxiFare(d)) : (mode === 'metro' ? Math.max(4, Math.round(4 + d / 10)) : 4)
      notes = mode === 'taxi' ? '距离较远，打车更省时' : '预算优先，公共交通更划算'
    }
    segments.push({
      from: a.title,
      to: b.title,
      fromLocation: a.raw,
      toLocation: b.raw,
      mode,
      distanceKm: Math.round(d * 10) / 10,
      timeMin,
      fare,
      notes,
    })
  }
  return segments
}

// 新增：引入 LLM 酒店推荐服务（避免循环依赖）
import { askLLMHotels } from './recommender'