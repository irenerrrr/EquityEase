'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

interface FundAccount {
  id: string
  name: string
  amount: number
  is_active: boolean
  created_at: string
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([])
  const [currentAccount, setCurrentAccount] = useState<FundAccount | null>(null)
  const router = useRouter()

  useEffect(() => {
    // 获取当前用户信息
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        await fetchFundAccounts()
      }
    }

    getUser()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null)
        if (session?.user) {
          fetchFundAccounts()
        } else {
          setFundAccounts([])
          setCurrentAccount(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchFundAccounts = async () => {
    try {
      // 这里暂时使用模拟数据，后续可以连接真实的数据库
      // const { data, error } = await supabase.from('fund_accounts').select('*')
      
      // 模拟数据 - 你可以修改这里来测试不同的状态
      // 设置为空数组来测试"没有账号"的状态
      const mockAccounts: FundAccount[] = []
      
      // 如果要测试"有账号"的状态，可以使用下面的数据：
      // const mockAccounts: FundAccount[] = [
      //   {
      //     id: '1',
      //     name: '主要投资账户',
      //     amount: 100000,
      //     is_active: true,
      //     created_at: new Date().toISOString()
      //   }
      // ]
      
      setFundAccounts(mockAccounts)
      setCurrentAccount(mockAccounts.find(acc => acc.is_active) || null)
    } catch (error) {
      console.error('获取基金账号失败:', error)
      setFundAccounts([])
      setCurrentAccount(null)
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      router.push('/auth')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchAccount = () => {
    // 跳转到账号管理页面
    router.push('/accounts')
  }

  // 获取用户显示名称
  const getUserDisplayName = () => {
    if (!user) return ''
    
    // 优先显示用户名，如果没有则显示邮箱的用户名部分
    if (user.user_metadata?.full_name) {
      return user.user_metadata.full_name
    }
    
    if (user.email) {
      return user.email.split('@')[0]
    }
    
    return '用户'
  }

  // 如果没有用户信息，不显示 header（比如在登录页面）
  if (!user) {
    return null
  }

  return (
    <header className="shadow-sm border-b sticky top-0 z-50" style={{ backgroundColor: '#c8e4cc', borderBottomColor: '#78ae78' }}>
      <div className="flex h-16">
        {/* 左侧 Logo 区域 - 与 Sidebar 同宽 */}
        <div className="w-64 flex items-center px-4">
          <svg 
            className="w-6 h-6 mr-2" 
            fill="none" 
            stroke="#466a4a" 
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h1 className="text-xl font-bold" style={{ color: '#466a4a' }}>
            轻松看资产
          </h1>
        </div>

        {/* 右侧用户信息区域 */}
        <div className="flex-1 flex justify-end items-center px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            {/* 切换账号按钮 */}
            <button 
              onClick={handleSwitchAccount}
              className="flex items-center space-x-2 px-3 py-1 text-sm text-gray-600 hover:text-white rounded-md transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#86c262'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>
                {fundAccounts.length === 0 
                  ? '还没有基金账号，点击创建' 
                  : `当前账号 ${currentAccount?.name || '未选择'}，点击切换账号`
                }
              </span>
            </button>

            {/* 用户名 */}
            <div className="flex items-center space-x-2">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="用户头像"
                  className="w-8 h-8 rounded-full object-cover border border-gray-300"
                  onError={(e) => {
                    // 如果头像加载失败，显示首字母头像
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div className={`w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center ${user.user_metadata?.avatar_url ? 'hidden' : ''}`}>
                <span className="text-sm font-medium text-indigo-600">
                  {getUserDisplayName().charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium" style={{ color: '#466a4a' }}>
                {getUserDisplayName()}
              </span>
            </div>

            {/* 退出按钮 */}
            <button
              onClick={handleLogout}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border-0 shadow-sm text-sm leading-4 font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#78ae78' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6a9d6a'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#78ae78'}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  退出中...
                </div>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  退出登录
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
