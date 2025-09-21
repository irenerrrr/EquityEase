'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

interface FundAccount {
  id: string
  name: string
  created_at: string
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([])
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [currentAccountName, setCurrentAccountName] = useState<string>('')
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
          setCurrentAccountId(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // 当账号列表或当前账号变化时，更新显示名称（避免闪烁为空）
  useEffect(() => {
    let nameFromList: string | undefined = fundAccounts.find(acc => acc.id === currentAccountId)?.name
    let nameFromStorage: string | null = null
    try {
      const saved = localStorage.getItem('currentAccount')
      if (saved) {
        const parsed = JSON.parse(saved)
        nameFromStorage = parsed?.name || null
      }
    } catch {}

    const nextName = nameFromList || nameFromStorage || currentAccountName
    if (nextName && nextName !== currentAccountName) {
      setCurrentAccountName(nextName)
    }
    console.log('[Header] 更新当前账号名称', {
      currentAccountId,
      nameFromList: nameFromList || null,
      nameFromStorage,
      finalName: nextName || null,
      at: new Date().toISOString()
    })
  }, [fundAccounts, currentAccountId])

  // 监听 localStorage 中的账号切换事件
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentAccountId') {
        setCurrentAccountId(e.newValue)
      }
      if (e.key === 'currentAccount' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          setCurrentAccountId(parsed?.id || null)
          if (parsed?.name) setCurrentAccountName(parsed.name)
        } catch {}
      }
    }

    // 监听 localStorage 变化
    window.addEventListener('storage', handleStorageChange)

    // 监听账号列表更新事件
    const handleAccountsUpdated = () => {
      console.log('[Header] 收到 accountsUpdated 事件，重新获取账号列表', {
        at: new Date().toISOString()
      })
      fetchFundAccounts()
    }

    // 监听自定义事件（同一页面内的切换）
    const handleAccountSwitch = (e: CustomEvent) => {
      console.log('[Header] 收到 accountSwitched 事件', {
        accountId: e.detail.accountId,
        accountNameFromEvent: e.detail.accountName,
        at: new Date().toISOString()
      })
      setCurrentAccountId(String(e.detail.accountId))
      // 如果事件里带了名称，立即乐观更新名称，避免列表未刷新前出现空白
      if (e.detail.accountName) {
        setCurrentAccountName(e.detail.accountName)
        try {
          localStorage.setItem('currentAccount', JSON.stringify({ id: String(e.detail.accountId), name: e.detail.accountName, updatedAt: new Date().toISOString() }))
        } catch {}
      }
      // 不强制重新拉列表，保持轻量
    }

    window.addEventListener('accountsUpdated', handleAccountsUpdated)
    window.addEventListener('accountSwitched', handleAccountSwitch as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('accountsUpdated', handleAccountsUpdated)
      window.removeEventListener('accountSwitched', handleAccountSwitch as EventListener)
    }
  }, [])

  const fetchFundAccounts = async () => {
    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setFundAccounts([])
        setCurrentAccountId(null)
        return
      }

      // 从 Supabase 获取用户的账号列表
      const { data: accountsData, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('UUID', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('获取账号列表失败:', error)
        setFundAccounts([])
        setCurrentAccountId(null)
        return
      }

      // 转换数据格式（将 id 统一为字符串，避免与 localStorage 不一致）
      const formattedAccounts: FundAccount[] = accountsData.map(account => ({
        id: String(account.id),
        name: account.name,
        created_at: account.created_at
      }))

      console.log('[Header] 加载基金账号列表', {
        count: formattedAccounts.length,
        ids: formattedAccounts.map(a => a.id),
        savedAccountId: localStorage.getItem('currentAccountId'),
        at: new Date().toISOString()
      })

      setFundAccounts(formattedAccounts)

      // 从 localStorage 恢复当前账号（优先 JSON）
      if (formattedAccounts.length > 0) {
        const savedJson = localStorage.getItem('currentAccount')
        let savedId: string | null = null
        let savedName: string | null = null
        if (savedJson) {
          try {
            const parsed = JSON.parse(savedJson)
            savedId = parsed?.id || null
            savedName = parsed?.name || null
          } catch {}
        }
        const savedAccountId = savedId || localStorage.getItem('currentAccountId')
        if (savedAccountId && formattedAccounts.find(acc => acc.id === savedAccountId)) {
          setCurrentAccountId(savedAccountId)
          if (savedName) setCurrentAccountName(savedName)
          console.log('[Header] 恢复当前账号成功', { savedAccountId, savedName, at: new Date().toISOString() })
        } else {
          // 如果没有保存的账号或账号不存在，默认选择第一个
          setCurrentAccountId(formattedAccounts[0].id)
          localStorage.setItem('currentAccountId', formattedAccounts[0].id)
          localStorage.setItem('currentAccount', JSON.stringify({ id: formattedAccounts[0].id, name: formattedAccounts[0].name, updatedAt: new Date().toISOString() }))
          console.log('[Header] 未找到保存账号，默认选择第一个', { selected: formattedAccounts[0].id, at: new Date().toISOString() })
        }
      } else {
        setCurrentAccountId(null)
      }
    } catch (error) {
      console.error('获取基金账号失败:', error)
      setFundAccounts([])
      setCurrentAccountId(null)
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
                  : `基金账号：${currentAccountName || '未选择'}`
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
