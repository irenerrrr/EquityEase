'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

type ScreenTag = 'sm' | 'lg'

type ScreenState = {
  isMobile: boolean
  screenTag: ScreenTag
  width: number
  height: number
}

const ScreenContext = createContext<ScreenState>({ isMobile: false, screenTag: 'lg', width: 0, height: 0 })

export function ScreenProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScreenState>({ isMobile: false, screenTag: 'lg', width: 0, height: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const compute = (): ScreenState => {
      const isMobile = window.matchMedia('(max-width: 767.98px)').matches
      const screenTag: ScreenTag = isMobile ? 'sm' : 'lg'
      const width = window.innerWidth
      const height = window.innerHeight
      try {
        sessionStorage.setItem('screen', screenTag)
      } catch {}
      try {
        document.documentElement.dataset.screen = screenTag
      } catch {}
      return { isMobile, screenTag, width, height }
    }

    // 初始
    setState(compute())

    // 监听断点跨越（只在跨过 md 边界时触发）
    const mq = window.matchMedia('(max-width: 767.98px)')
    const onChange = () => setState(prev => ({ ...prev, ...compute() }))
    mq.addEventListener?.('change', onChange)

    // resize 防抖（用于宽高变化同步，避免高频 setState）
    let timer: number | null = null
    const onResize = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setState(prev => ({ ...prev, ...compute() })), 150)
    }
    window.addEventListener('resize', onResize)

    return () => {
      mq.removeEventListener?.('change', onChange)
      window.removeEventListener('resize', onResize)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const value = useMemo(() => state, [state.isMobile, state.screenTag, state.width, state.height])

  return (
    <ScreenContext.Provider value={value}>
      {children}
    </ScreenContext.Provider>
  )
}

export function useScreen(): ScreenState {
  return useContext(ScreenContext)
}


