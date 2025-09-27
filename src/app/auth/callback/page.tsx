'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const screen = searchParams.get('screen') || (typeof window !== 'undefined' ? sessionStorage.getItem('screen') : null) || 'lg'
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          router.push('/auth?error=' + encodeURIComponent(error.message))
          return
        }

        if (data.session) {
          router.push('/dashboard')
        } else {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              router.push('/dashboard')
            }
          })

          setTimeout(async () => {
            subscription.unsubscribe()
            const { data: re } = await supabase.auth.getSession()
            if (re.session) {
              router.push('/dashboard')
            } else {
              router.push('/auth?error=' + encodeURIComponent(screen === 'sm' ? '登录未完成，请在小屏重试' : '登录未完成，请重试'))
            }
          }, 4000)
        }
      } catch (error) {
        console.error('Callback handling error:', error)
        router.push('/auth?error=callback_error')
      }
    }

    handleAuthCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#c8e4cc' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在处理登录...</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#c8e4cc' }}><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div><p className="mt-4 text-gray-600">正在处理登录...</p></div></div>}>
      <CallbackContent />
    </Suspense>
  )
}
