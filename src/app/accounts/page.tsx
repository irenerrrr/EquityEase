'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface FundAccount {
  id: string
  name: string
  created_at: string
  equity?: number // 账户净值（可选，从快照表获取）
}

export default function AccountsPage() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<FundAccount[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    amount: ''
  })

  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchAccounts()
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  // 当账号列表加载完成后，设置当前账号
  useEffect(() => {
    if (accounts.length > 0 && !currentAccountId) {
      // 尝试从 localStorage 恢复上次选择的账号
      const savedAccountId = localStorage.getItem('currentAccountId')
      if (savedAccountId && accounts.find(acc => acc.id === savedAccountId)) {
        setCurrentAccountId(savedAccountId)
      } else {
        // 如果没有保存的账号或账号不存在，默认选择第一个
        setCurrentAccountId(accounts[0].id)
        localStorage.setItem('currentAccountId', accounts[0].id)
      }
    }
  }, [accounts, currentAccountId])

  const fetchAccounts = async () => {
    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
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
        setLoading(false)
        return
      }

      // 获取每个账号的最新净值
      const formattedAccounts: FundAccount[] = await Promise.all(
        accountsData.map(async (account) => {
          // 获取该账号的最新快照
          const { data: latestSnapshot } = await supabase
            .from('account_snapshots_daily')
            .select('equity')
            .eq('account_id', account.id)
            .order('as_of_date', { ascending: false })
            .limit(1)
            .single()

          return {
            id: account.id,
            name: account.name,
            created_at: account.created_at,
            equity: latestSnapshot?.equity || 0
          }
        })
      )

      setAccounts(formattedAccounts)
      setLoading(false)
    } catch (error) {
      console.error('获取账号列表失败:', error)
      setLoading(false)
    }
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log('创建账号表单提交:', formData)
    
    if (!formData.name.trim()) {
      alert('请输入账号名称')
      return
    }

    const amount = parseFloat(formData.amount) || 0
    if (amount < 0) {
      alert('初始金额不能为负数')
      return
    }

    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('用户未登录')
        return
      }

      // 插入到 Supabase accounts 表
      const { data: insertedAccount, error } = await supabase
        .from('accounts')
        .insert([
          {
            UUID: user.id, // 关联用户 UUID
            name: formData.name
          }
        ])
        .select()
        .single()

      if (error) {
        console.error('创建账号失败:', error)
        alert(`创建账号失败: ${error.message}`)
        return
      }

      console.log('账号创建成功:', insertedAccount)

      // 同时在 account_snapshots_daily 表中创建初始快照
      const today = new Date().toISOString().split('T')[0] // 获取今天的日期 (YYYY-MM-DD)
      const { error: snapshotError } = await supabase
        .from('account_snapshots_daily')
        .insert([
          {
            account_id: insertedAccount.id, // 绑定账号 ID
            as_of_date: today, // 设置当前日期
            equity: amount, // 总权益等于输入的金额
            cash: amount, // 现金等于输入的金额
            market_value: 0, // 初始市值为 0
            realized_pnl_to_date: 0 // 初始已实现盈亏为 0
          }
        ])

      if (snapshotError) {
        console.error('创建账号快照失败:', snapshotError)
        alert(`创建账号快照失败: ${snapshotError.message}`)
        // 注意：这里我们不返回，因为账号已经创建成功了
        // 只是快照创建失败，用户仍然可以使用账号
      } else {
        console.log('账号快照创建成功')
      }

      // 更新本地状态
      const newAccount: FundAccount = {
        id: insertedAccount.id,
        name: insertedAccount.name,
        created_at: insertedAccount.created_at,
        equity: amount // 新账号的净值等于初始金额
      }
      
      const updatedAccounts = [...accounts, newAccount]
      setAccounts(updatedAccounts)
      
      // 如果这是第一个账号，自动设为当前账号
      if (accounts.length === 0) {
        console.log('创建第一个账号，设置为当前账号:', newAccount.id)
        setCurrentAccountId(newAccount.id)
        localStorage.setItem('currentAccountId', newAccount.id)
        
        // 延迟触发事件，确保状态更新完成
        setTimeout(() => {
          console.log('触发账号切换事件:', newAccount.id)
          // 触发账号列表更新事件
          window.dispatchEvent(new CustomEvent('accountsUpdated'))
          // 触发账号切换事件
          window.dispatchEvent(new CustomEvent('accountSwitched', {
            detail: { accountId: newAccount.id }
          }))
        }, 100)
      }
      
      setFormData({ name: '', amount: '' })
      setShowAddForm(false)
    } catch (error) {
      console.error('创建账号失败:', error)
      alert(`创建账号时发生错误: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const handleSwitchAccount = (accountId: string) => {
    // 纯前端操作：更新当前账号ID
    setCurrentAccountId(accountId)
    localStorage.setItem('currentAccountId', accountId)
    
    // 触发自定义事件，通知 Header 组件更新
    window.dispatchEvent(new CustomEvent('accountSwitched', {
      detail: { accountId }
    }))
    
    // 只做局部刷新，不跳转页面
  }

  const handleDeleteAccount = async (accountId: string) => {
    console.log('开始删除账号:', accountId)
    
    if (window.confirm('确定要删除这个账号吗？此操作不可撤销。')) {
      try {
        // 获取当前用户
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.error('用户未登录')
          alert('用户未登录')
          return
        }

        console.log('用户已登录，开始删除账号:', accountId)

        // 先删除相关的快照记录
        console.log('删除账号快照记录...')
        const { error: snapshotError } = await supabase
          .from('account_snapshots_daily')
          .delete()
          .eq('account_id', accountId)

        if (snapshotError) {
          console.error('删除账号快照失败:', snapshotError)
          alert(`删除账号快照失败: ${snapshotError.message}`)
          return
        }

        console.log('账号快照删除成功')

        // 再删除账号记录
        console.log('删除账号记录...')
        const { error: accountError } = await supabase
          .from('accounts')
          .delete()
          .eq('id', accountId)
          .eq('UUID', user.id)

        if (accountError) {
          console.error('删除账号失败:', accountError)
          alert(`删除账号失败: ${accountError.message}`)
          return
        }

        console.log('账号删除成功')

        // 更新本地状态
        const remainingAccounts = accounts.filter(account => account.id !== accountId)
        setAccounts(remainingAccounts)
        
        // 如果删除的是当前选中的账号，需要切换到其他账号
        if (currentAccountId === accountId) {
          if (remainingAccounts.length > 0) {
            // 切换到第一个剩余账号
            const newCurrentId = remainingAccounts[0].id
            setCurrentAccountId(newCurrentId)
            localStorage.setItem('currentAccountId', newCurrentId)
            
            // 触发自定义事件，通知 Header 组件更新
            window.dispatchEvent(new CustomEvent('accountSwitched', {
              detail: { accountId: newCurrentId }
            }))
          } else {
            // 没有剩余账号了
            setCurrentAccountId(null)
            localStorage.removeItem('currentAccountId')
            
            // 触发自定义事件，通知 Header 组件更新
            window.dispatchEvent(new CustomEvent('accountSwitched', {
              detail: { accountId: null }
            }))
          }
        }
      } catch (error) {
        console.error('删除账号失败:', error)
        alert(`删除账号时发生错误: ${error instanceof Error ? error.message : '未知错误'}`)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ backgroundColor: '#c8e4cc' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">管理基金账号</h1>
        <p className="text-gray-600">管理您的投资账号，切换不同的基金账户</p>
      </div>

      {/* 账号列表 */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">账号列表</h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white transition-colors"
              style={{ backgroundColor: '#78ae78' }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              添加账号
            </button>
          </div>
        </div>

        {accounts.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {accounts.map((account) => (
              <div key={account.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: '#78ae78' }}
                    >
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex items-center space-x-4">
                      <h4 className="font-medium text-gray-900">{account.name}</h4>
                      {currentAccountId === account.id && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          当前使用
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        账户净值：${account.equity?.toLocaleString() || '0'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {currentAccountId !== account.id && (
                      <button
                        onClick={() => handleSwitchAccount(account.id)}
                        className="px-3 py-1 text-sm text-white rounded-md transition-colors"
                        style={{ backgroundColor: '#78ae78' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6a9d6a'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#78ae78'}
                      >
                        切换使用
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteAccount(account.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="删除账号"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">还没有基金账号</h3>
            <p className="text-gray-500 mb-6">创建您的第一个基金账号来开始管理投资</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white transition-colors"
              style={{ backgroundColor: '#78ae78' }}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              创建第一个账号
            </button>
          </div>
        )}
      </div>

      {/* 添加账号弹窗 */}
      {showAddForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="p-0.5 rounded-xl max-w-md" style={{ backgroundColor: '#b1d8b7' }}>
            <div className="p-6 w-96 rounded-lg border border-gray-200" style={{ backgroundColor: '#d0e7d4' }}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">添加基金账号</h3>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">账号名称</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="例如：主要投资账户"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">初始金额</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">$</span>
                  </div>
                   <input
                     type="number"
                     required
                     min="0"
                     step="0.01"
                     className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                 onClick={() => {
                   setShowAddForm(false)
                   setFormData({ name: '', amount: '' })
                 }}
                  className="bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="font-bold py-2 px-4 rounded text-white transition-colors"
                  style={{ backgroundColor: '#78ae78' }}
                >
                  创建账号
                </button>
               </div>
             </form>
           </div>
         </div>
       </div>
       )}
    </div>
  )
}
