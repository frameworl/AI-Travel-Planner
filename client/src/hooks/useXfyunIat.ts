import CryptoJS from 'crypto-js'
import { Base64 } from 'js-base64'

export function useXfyunIat(options?: { lang?: string }) {
  const appId = import.meta.env.VITE_XFYUN_APP_ID as string | undefined
  const apiKey = import.meta.env.VITE_XFYUN_API_KEY as string | undefined
  const apiSecret = import.meta.env.VITE_XFYUN_API_SECRET as string | undefined
  const lang = options?.lang ?? 'zh_cn'

  const state = {
    listening: false,
    transcript: '',
    error: '' as string | null,
  }
  const listeners: Array<() => void> = []
  const notify = () => listeners.forEach((fn) => fn())
  function subscribe(listener: () => void) {
    listeners.push(listener)
    return () => {
      const idx = listeners.indexOf(listener)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }

  let audioCtx: AudioContext | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let ws: WebSocket | null = null
  let sentFirstFrame = false
  let stopRequested = false

  function assembleAuthUrl() {
    // 参考讯飞文档：wss://iat-api.xfyun.cn/v2/iat
    const host = 'iat-api.xfyun.cn'
    const path = '/v2/iat'
    const date = new Date().toUTCString()
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret!)
    const signature = CryptoJS.enc.Base64.stringify(signatureSha)
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
    const authorization = Base64.encode(authorizationOrigin)
    return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`
  }

  function floatTo16PCM(input: Float32Array) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }

  function resampleTo16k(float32: Float32Array, sourceRate: number) {
    const targetRate = 16000
    const ratio = sourceRate / targetRate
    const newLen = Math.round(float32.length / ratio)
    const result = new Float32Array(newLen)
    let pos = 0
    for (let i = 0; i < newLen; i++) {
      pos = Math.round(i * ratio)
      result[i] = float32[pos] || 0
    }
    return result
  }

  function pcm16ToBase64(int16: Int16Array) {
    const bytes = new Uint8Array(int16.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  async function start() {
    if (!appId || !apiKey || !apiSecret) {
      state.error = '未配置讯飞语音识别密钥（VITE_XFYUN_APP_ID/API_KEY/API_SECRET）'
      notify()
      return
    }
    stopRequested = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      sourceNode = audioCtx.createMediaStreamSource(stream)
      processor = audioCtx.createScriptProcessor(4096, 1, 1)

      const url = assembleAuthUrl()
      ws = new WebSocket(url)

      ws.onopen = () => {
        state.listening = true
        state.error = null
        state.transcript = ''
        notify()
      }

      ws.onmessage = (e) => {
        try {
          const json = JSON.parse(e.data)
          if (json.code !== 0) {
            state.error = json.message || '识别错误'
            notify()
            return
          }
          const data = json.data || json.payload // 不同文档版本字段略有差异
          if (!data) return
          // 旧版：data.result.ws / 新版：payload.result.text（需解压与解码，这里简单处理旧版）
          const result = data.result
          if (result?.ws) {
            const text = result.ws.map((w: any) => w.cw.map((c: any) => c.w).join('')).join('')
            state.transcript += text
            notify()
          } else if (result?.text) {
            // 如果是新版 text，需要 Base64 + UTF8 解码；此处直接尝试解码
            try {
              const jsonStr = Base64.decode(result.text)
              const obj = JSON.parse(jsonStr)
              const text = (obj?.cn?.st?.rt || []).map((seg: any) => seg.ws.map((w: any) => w.cw[0].w).join('')).join('')
              state.transcript += text
              notify()
            } catch {}
          }
        } catch {}
      }

      ws.onerror = () => {
        state.error = 'WebSocket 错误或鉴权失败'
        state.listening = false
        notify()
      }

      ws.onclose = () => {
        state.listening = false
        notify()
      }

      processor.onaudioprocess = (event) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || stopRequested) return
        const input = event.inputBuffer.getChannelData(0)
        const resampled = resampleTo16k(input, audioCtx!.sampleRate)
        const int16 = floatTo16PCM(resampled)
        const audio = pcm16ToBase64(int16)
        const frame = {
          common: { app_id: appId },
          business: {
            language: lang,
            domain: 'iat',
            accent: 'mandarin',
            vad_eos: 5000,
            dwa: 'wpgs', // 开启动态修正
          },
          data: {
            status: sentFirstFrame ? 1 : 0,
            format: 'audio/L16;rate=16000',
            encoding: 'raw',
            audio,
          },
        }
        ws.send(JSON.stringify(frame))
        sentFirstFrame = true
      }

      sourceNode.connect(processor)
      processor.connect(audioCtx.destination)
    } catch (e) {
      state.error = '无法访问麦克风或初始化失败'
      notify()
    }
  }

  function stop() {
    stopRequested = true
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const endFrame = {
          data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' },
        }
        try { ws.send(JSON.stringify(endFrame)) } catch {}
        ws.close()
      }
    } catch {}
    try { processor?.disconnect() } catch {}
    try { sourceNode?.disconnect() } catch {}
    try { audioCtx?.close() } catch {}
    state.listening = false
    notify()
  }

  return { state, start, stop, subscribe }
}