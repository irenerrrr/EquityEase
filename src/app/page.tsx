'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // 如果已登录，跳转到仪表板
        router.push('/dashboard')
      } else {
        // 如果未登录，跳转到登录页面
        router.push('/auth')
      }
    }

    checkAuth()
  }, [router])

  // 显示加载状态
  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ backgroundColor: '#c8e4cc' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在检查登录状态...</p>
      </div>
    </div>
  )
}