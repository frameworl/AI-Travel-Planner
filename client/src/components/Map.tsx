import { useEffect, useRef } from 'react'
import type { Itinerary } from '../types'
import AMapLoader from '@amap/amap-jsapi-loader'

// 声明高德安全码全局（如配置了 securityJsCode）
declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

export default function Map({ data }: { data: Itinerary }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const key = import.meta.env.VITE_AMAP_KEY as string | undefined
  const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined

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
      plugins: ['AMap.Geocoder', 'AMap.ToolBar'],
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

        // 先尝试目的地中心
        if (data.destination) {
          geocoder.getLocation(data.destination, (status: string, result: any) => {
            const loc = result?.geocodes?.[0]?.location
            if (status === 'complete' && loc) {
              mapRef.current.setCenter(loc)
            }
          })
        }

        // 为每天的项目添加标记，避免重复地名导致混乱，优先使用 location，其次 title+destination
        const queue: Array<{ address: string; title: string; day: number }> = []
        data.daysPlan.forEach((day) => {
          day.items.forEach((it) => {
            const address = it.location?.trim()
              ? `${data.destination} ${it.location}`
              : `${data.destination} ${it.title}`
            queue.push({ address, title: it.title, day: day.day })
          })
        })

        // 简单限速：每 120ms 发起一次 geocode
        let i = 0
        const tick = () => {
          if (i >= queue.length || destroyed) return
          const { address, title, day } = queue[i++]
          geocoder.getLocation(address, (status: string, result: any) => {
            const loc = result?.geocodes?.[0]?.location
            if (status === 'complete' && loc) {
              const marker = new AMap.Marker({ position: loc, title })
              marker.setLabel({
                direction: 'top',
                offset: new AMap.Pixel(0, -20),
                content: `<div style="background:#111827;color:#fff;padding:2px 6px;border-radius:6px;font-size:12px">Day ${day}</div>`,
              })
              mapRef.current.add(marker)
            }
            setTimeout(tick, 120)
          })
        }
        tick()
      })
      .catch((e) => {
        console.error('AMap load error', e)
        if (containerRef.current) {
          containerRef.current.innerHTML = '<div style="padding:12px;color:#dc2626">高德地图加载失败，请检查 Key、安全码与域名白名单。</div>'
        }
      })

    return () => {
      destroyed = true
      try {
        mapRef.current?.destroy?.()
      } catch {}
    }
  }, [key, sec, data])

  return <div ref={containerRef} style={{ width: '100%', height: 360, border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 16 }} />
}