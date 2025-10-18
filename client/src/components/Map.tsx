import { useEffect, useRef, useState } from 'react'
import type { Itinerary } from '../types'
import AMapLoader from '@amap/amap-jsapi-loader'
import { searchPlaceText } from '../services/amap'

// 声明高德安全码全局（如配置了 securityJsCode）
declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

export default function Map({ data, activeDay }: { data: Itinerary; activeDay: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const key = import.meta.env.VITE_AMAP_KEY as string | undefined
  const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined

  // 地图交互增强所需的缓存与状态
  const amapClassRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)

  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    if (!key) {
      // 如果未配置 Key，则给出提示占位
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div style="padding:12px;color:#dc2626">未配置 VITE_AMAP_KEY，无法加载高德地图。</div>'
      }
      return
    }

    // 配置安全码（如果有）——需在 load 前设置
    if (sec) {
      window._AMapSecurityConfig = { securityJsCode: sec }
    }

    let destroyed = false

    AMapLoader.load({
      key,
      version: '2.0',
      plugins: ['AMap.Geocoder', 'AMap.ToolBar', 'AMap.InfoWindow', 'AMap.Polyline'],
    })
      .then((AMap: any) => {
        if (destroyed) return
        mapRef.current = new AMap.Map(containerRef.current!, {
          viewMode: '2D',
          zoom: 11,
        })

        // 加控件
        try {
          mapRef.current.addControl(new AMap.ToolBar())
        } catch {}

        // 地理编码器
        const geocoder = new AMap.Geocoder()
        // 缓存 AMap 与 Geocoder 供后续按日渲染使用
        amapClassRef.current = AMap
        geocoderRef.current = geocoder
        setMapReady(true)

        // 先尝试目的地中心
        if (data.destination) {
          geocoder.getLocation(data.destination, (status: string, result: any) => {
            const loc = result?.geocodes?.[0]?.location
            if (status === 'complete' && loc) {
              mapRef.current.setCenter(loc)
            }
          })
        }
      })
      .catch((e) => {
        console.error('AMap load error', e)
        if (containerRef.current) {
          containerRef.current.innerHTML = '<div style="padding:12px;color:#dc2626">高德地图加载失败，请检查 Key、安全码与域名白名单。</div>'
        }
      })

    return () => {
      destroyed = true
      setMapReady(false)
      try {
        mapRef.current?.destroy?.()
      } catch {}
    }
  }, [key, sec, data])

  // 按日渲染：根据 activeDay 在地图上展示当日标记、信息窗与路线连线
  useEffect(() => {
    const AMap = amapClassRef.current
    const map = mapRef.current
    if (!AMap || !map || !mapReady) return

    // 清理旧覆盖物
    try {
      if (polylineRef.current) map.remove(polylineRef.current)
    } catch {}
    markersRef.current.forEach((m) => {
      try {
        map.remove(m)
      } catch {}
    })
    markersRef.current = []
    infoWindowRef.current?.close?.()

    // 兼容 day 字段为字符串的情况，并在找不到时回退按索引
    const dayObj = (data.daysPlan.find((d) => Number(d.day) === Number(activeDay))
      || data.daysPlan[Math.max(0, Number(activeDay) - 1)])
    if (!dayObj) return

    const coords: any[] = []

    const parseLonLat = (loc?: string) => {
      if (!loc || typeof loc !== 'string') return null
      const m = loc.match(/\s*([\-\d.]+)\s*,\s*([\-\d.]+)\s*/)
      if (!m) return null
      const lon = Number(m[1])
      const lat = Number(m[2])
      if (!isFinite(lon) || !isFinite(lat)) return null
      return new AMap.LngLat(lon, lat)
    }

    const makeMarker = (lngLat: any, idx: number, it: any) => {
      const marker = new AMap.Marker({ position: lngLat, title: it.title })
      marker.setLabel({
        direction: 'top',
        offset: new AMap.Pixel(0, -20),
        content: `<div style="background:#111827;color:#fff;padding:2px 6px;border-radius:6px;font-size:12px">#${idx + 1}</div>`,
      })
      marker.on('click', () => {
        const html = `<div style=\"font-size:13px\"><strong>${it.title}</strong><div>${it.timing ? it.timing + ' · ' : ''}${it.category || ''}${typeof it.costEstimate === 'number' ? ' · ¥' + it.costEstimate : ''}</div>${it.description ? `<div style='color:#4b5563;margin-top:4px'>${it.description}</div>` : ''}</div>`
        if (!infoWindowRef.current)
          infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) })
        infoWindowRef.current.setContent(html)
        infoWindowRef.current.open(map, lngLat)
      })
      map.add(marker)
      markersRef.current.push(marker)
      coords.push(lngLat)
    }

    const geocoder = geocoderRef.current || new AMap.Geocoder()
    const queue: Array<{ it: any; addr1: string; addr2?: string; idx: number }> = []

    dayObj.items.forEach((it, idx) => {
      const parsed = parseLonLat(it.location)
      if (parsed) {
        makeMarker(parsed, idx, it)
      } else {
        const locText = (it.location || '').trim()
        const ttlText = (it.title || '').trim()
        const addr1 = `${data.destination} ${locText || ttlText}`.trim()
        const addr2 = locText && ttlText ? `${data.destination} ${ttlText}` : undefined
        queue.push({ it, addr1, addr2, idx })
      }
    })

    let i = 0
    const tick = () => {
      if (i >= queue.length) {
        // 若标记少于2个，兜底补足到至少2个以绘制路线
        if (markersRef.current.length < 2) {
          (async () => {
            try {
              const missing = Math.max(0, 2 - markersRef.current.length)
              if (missing > 0) {
                const pois = await searchPlaceText(`${data.destination || ''} 旅游景点`, data.destination)
                const picks = pois.filter(p => p.location).slice(0, missing)
                picks.forEach((p, idx) => {
                  const ll = parseLonLat(p.location)
                  if (!ll) return
                  const addr = `${p.adname || ''} ${p.address || ''}`.trim()
                  const pseudo = { title: p.name || '旅游景点', category: 'sightseeing', description: addr }
                  makeMarker(ll, idx, pseudo)
                })
              }
              if (coords.length >= 2) {
                polylineRef.current = new AMap.Polyline({
                  path: coords,
                  strokeColor: '#2563eb',
                  strokeWeight: 5,
                  strokeOpacity: 0.9,
                })
                map.add(polylineRef.current)
              }
              if (markersRef.current.length) {
                try { map.setFitView(markersRef.current) } catch {}
              }
            } catch {}
          })()
          return
        }
        if (coords.length >= 2) {
          polylineRef.current = new AMap.Polyline({
            path: coords,
            strokeColor: '#2563eb',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          })
          map.add(polylineRef.current)
        }
        if (markersRef.current.length) {
          try {
            map.setFitView(markersRef.current)
          } catch {}
        }
        return
      }
      const { it, addr1, addr2, idx } = queue[i++]
      geocoder.getLocation(addr1, (status: string, result: any) => {
        const lngLat = result?.geocodes?.[0]?.location
        if (status === 'complete' && lngLat) {
          makeMarker(lngLat, idx, it)
          setTimeout(tick, 120)
        } else if (addr2) {
          geocoder.getLocation(addr2, (st2: string, res2: any) => {
            const lngLat2 = res2?.geocodes?.[0]?.location
            if (st2 === 'complete' && lngLat2) {
              makeMarker(lngLat2, idx, it)
            }
            setTimeout(tick, 120)
          })
        } else {
          setTimeout(tick, 120)
        }
      })
    }
    tick()

    if (queue.length === 0) {
      if (markersRef.current.length < 2) {
        (async () => {
          try {
            const missing = Math.max(0, 2 - markersRef.current.length)
            if (missing > 0) {
              const pois = await searchPlaceText(`${data.destination || ''} 旅游景点`, data.destination)
              const picks = pois.filter(p => p.location).slice(0, missing)
              picks.forEach((p, idx) => {
                const ll = parseLonLat(p.location)
                if (!ll) return
                const addr = `${p.adname || ''} ${p.address || ''}`.trim()
                const pseudo = { title: p.name || '旅游景点', category: 'sightseeing', description: addr }
                makeMarker(ll, idx, pseudo)
              })
            }
            if (coords.length >= 2) {
              polylineRef.current = new AMap.Polyline({
                path: coords,
                strokeColor: '#2563eb',
                strokeWeight: 5,
                strokeOpacity: 0.9,
              })
              map.add(polylineRef.current)
            }
            if (markersRef.current.length) {
              try { map.setFitView(markersRef.current) } catch {}
            }
          } catch {}
        })()
      } else {
        if (coords.length >= 2) {
          polylineRef.current = new AMap.Polyline({
            path: coords,
            strokeColor: '#2563eb',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          })
          map.add(polylineRef.current)
        }
        if (markersRef.current.length) {
          try {
            map.setFitView(markersRef.current)
          } catch {}
        }
      }
    }
  }, [activeDay, data, mapReady])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 600,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        marginTop: 16,
        overflow: 'hidden',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}