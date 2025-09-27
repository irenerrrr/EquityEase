'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { NAV_ITEMS } from '@/components/navItems'
import { User } from '@supabase/supabase-js'

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    // 获取当前用户信息
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }

    getUser()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // 如果没有用户信息，不显示侧边栏（比如在登录页面）
  if (!user) {
    return null
  }

  const navigation = NAV_ITEMS

  return (
    <div className="w-64 h-screen sticky top-16 overflow-y-auto" style={{ backgroundColor: '#c8e4cc' }}>
      <div className="flex flex-col h-full">
        <div className="flex-1 pt-5 pb-4 overflow-y-auto">
          <nav className="mt-5 px-2">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-gray-700 hover:text-white hover:bg-opacity-75'
                    }`}
                    style={{
                      backgroundColor: isActive ? '#86c262' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(134, 194, 98, 0.3)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <div className="mr-3">
                      {item.icon}
                    </div>
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  )
}
