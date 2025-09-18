'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // 处理 OAuth 回调
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          router.push('/auth?error=' + encodeURIComponent(error.message))
          return
        }

        if (data.session) {
          // 登录成功，跳转到仪表板
          router.push('/dashboard')
        } else {
          // 没有会话，返回登录页面
          router.push('/auth')
        }
      } catch (error) {
        console.error('Callback handling error:', error)
        router.push('/auth?error=callback_error')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ backgroundColor: '#c8e4cc' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在处理登录...</p>
      </div>
    </div>
  )
}
