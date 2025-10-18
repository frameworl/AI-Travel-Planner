type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: (e: SpeechRecognitionEvent) => void
  onerror: (e: any) => void
}

export function useSpeechRecognition(options?: { lang?: string }) {
  const lang = options?.lang ?? 'zh-CN'
  let recognition: Recognition | null = null

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

  function init() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      state.error = '当前浏览器不支持语音识别（建议使用 Chrome）'
      notify()
      return
    }
    recognition = new SR() as Recognition
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const res = event.results[event.resultIndex]
      if (res && res[0]) {
        state.transcript = res[0].transcript
        notify()
      }
    }
    recognition.onerror = (e: any) => {
      state.error = e?.error || '语音识别错误'
      state.listening = false
      notify()
    }
  }

  function start() {
    if (!recognition) init()
    try {
      recognition?.start()
      state.listening = true
      state.transcript = ''
      state.error = null
      notify()
    } catch (e) {
      state.error = '无法启动语音识别'
      notify()
    }
  }

  function stop() {
    try {
      recognition?.stop()
      state.listening = false
      notify()
    } catch (e) {
      // noop
    }
  }

  return { state, start, stop, subscribe }
}