// amap.ts - Enhance itinerary with Amap (Gaode) POIs

import type { Itinerary, PlanDay, PlanItem } from '../types';

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
  const s = `${item.title || ''} ${item.description || ''}`.trim();
  const ks: string[] = [];
  // 优先关键字
  const hotelHints = ['酒店', '宾馆', '旅舍', '客栈', '青年旅舍', '精品酒店', '商务酒店'];
  const poiHints = ['景点', '博物馆', '美食', '餐厅', '地标', '购物'];
  if (hotelHints.some(h => s.includes(h))) ks.push(...hotelHints);
  if (poiHints.some(h => s.includes(h))) ks.push(...poiHints);
  // 添加原始词
  if (item.title) ks.push(item.title);
  if (item.description) ks.push(item.description);
  return Array.from(new Set(ks)).slice(0, 6);
}

// 解析酒店价格：优先使用高德返回的最低价或人均消费，失败则返回 null
function parseHotelPrice(hotel: AMapPoi): number | null {
  const bx: any = hotel?.biz_ext ?? {};
  const tryParse = (val: any): number | null => {
    if (val == null) return null;
    if (Array.isArray(val)) {
      for (const v of val) {
        const n = tryParse(v);
        if (n != null) return n;
      }
      return null;
    }
    if (typeof val === 'number') {
      const n = Math.round(val);
      return isFinite(n) && n > 0 ? n : null;
    }
    if (typeof val === 'string') {
      const m = val.match(/(\d+(?:\.\d+)?)/);
      if (!m) return null;
      const n = Math.round(Number(m[1]));
      return isFinite(n) && n > 0 ? n : null;
    }
    return null;
  };
  return tryParse(bx?.lowest_price) ?? tryParse(bx?.cost) ?? null;
}

export async function pickSpecificPlaceForItem(item: PlanItem, city?: string): Promise<AMapPoi | null> {
  const keywords = deriveKeywords(item);
  // 如果看起来是酒店相关，限定酒店类型
  const isHotelLike = keywords.some(k => ['酒店', '宾馆', '旅舍', '客栈', '青年旅舍', '商务酒店', '精品酒店'].includes(k));
  const types = isHotelLike ? '住宿服务;宾馆酒店' : undefined;
  for (const kw of keywords) {
    const pois = await searchPlaceText(kw, city, { types });
    if (!pois.length) continue;
    // 优先 hotel 类型/编码命中
    const hotelFirst = pois.filter(p => (p.biz_type === 'hotel') || (p.typecode || '').startsWith('1001'));
    const sorted = hotelFirst.length ? hotelFirst : pois;
    const pick = sorted[0];
    if (pick) return pick;
  }
  // 兜底：使用目的地 + 通用关键词检索
  const fallback = await searchPlaceText(`${city ?? ''} 旅游景点`, city);
  return fallback[0] || null;
}

export async function enrichItineraryWithAmap(it: Itinerary): Promise<Itinerary> {
  const city = it.destination;
  const key = await getAmapKey();
  if (!key) return it; // 无 key 时直接返回原计划

  const perNightBudget = Math.round(((it.budget || 0) / Math.max(it.days || 1, 1)) * 0.4);

  const newDays: PlanDay[] = [];
  for (const day of it.daysPlan) {
    const newItems: PlanItem[] = [];

    for (const item of day.items) {
      let updated = { ...item };
      if (isGenericTitle(item.title)) {
        const poi = await pickSpecificPlaceForItem(item, city);
        if (poi) {
          const addr = `${poi.adname || ''} ${poi.address || ''}`.trim();
          const tel = poi.tel ? `，电话：${poi.tel}` : '';
          updated = {
            ...updated,
            title: poi.name || updated.title,
            description: addr ? `${addr}${tel}` : updated.description,
          };
        }
      }
      newItems.push(updated);
    }

    // 住宿替换逻辑：若为模板或通用词，尝试用真实酒店替换
    const acc = day.accommodation || '';
    const isTemplate = !acc || /便捷酒店|推荐酒店|酒店|宾馆/.test(acc);
    let newAcc = acc;
    if (isTemplate) {
      // 通过通用关键词强制检索酒店
      const hotelCandidate: PlanItem = { title: '酒店', description: '推荐酒店' } as PlanItem;
      const hotel = await pickSpecificPlaceForItem(hotelCandidate, city);
      if (hotel) {
        const addr = `${hotel.adname || ''} ${hotel.address || ''}`.trim();
        const nightly = parseHotelPrice(hotel) ?? perNightBudget;
        const ratingRaw: any = hotel.biz_ext?.rating;
        const rating = Array.isArray(ratingRaw) ? (ratingRaw[0] ?? '') : (ratingRaw ?? '');
        const ratingText = rating ? `，评分${rating}/5` : '';
        newAcc = `推荐酒店：${hotel.name}（约¥${nightly}/晚，${addr}${ratingText}）`;
      } else if (!newAcc) {
        newAcc = `推荐酒店：市中心便捷酒店（约¥${perNightBudget}/晚）`;
      }
    }

    newDays.push({ ...day, items: newItems, accommodation: newAcc });
  }

  return { ...it, daysPlan: newDays };
}