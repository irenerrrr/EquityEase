'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface FundAccount {
  id: string
  name: string
  amount: number
  is_active: boolean
  created_at: string
}

export default function AccountsPage() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<FundAccount[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    amount: 0
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

  const fetchAccounts = async () => {
    try {
      // 这里暂时使用模拟数据，后续可以连接真实的数据库
      // const { data, error } = await supabase.from('fund_accounts').select('*')
      
      // 模拟数据
      const mockAccounts: FundAccount[] = []
      setAccounts(mockAccounts)
    } catch (error) {
      console.error('获取账号列表失败:', error)
    }
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      return
    }

    try {
      // 这里添加创建账号的逻辑
      const newAccount: FundAccount = {
        id: Date.now().toString(),
        name: formData.name,
        amount: formData.amount,
        is_active: accounts.length === 0, // 如果是第一个账号，自动设为活跃
        created_at: new Date().toISOString()
      }
      
      setAccounts([...accounts, newAccount])
      setFormData({ name: '', amount: 0 })
      setShowAddForm(false)
    } catch (error) {
      console.error('创建账号失败:', error)
    }
  }

  const handleSwitchAccount = (accountId: string) => {
    // 更新账号状态
    setAccounts(accounts.map(account => ({
      ...account,
      is_active: account.id === accountId
    })))
    
    // 切换成功后跳转到仪表板
    router.push('/dashboard')
  }

  const handleDeleteAccount = (accountId: string) => {
    if (window.confirm('确定要删除这个账号吗？此操作不可撤销。')) {
      const accountToDelete = accounts.find(acc => acc.id === accountId)
      const remainingAccounts = accounts.filter(account => account.id !== accountId)
      
      // 如果删除的是当前活跃账号，且还有其他账号，则激活第一个账号
      if (accountToDelete?.is_active && remainingAccounts.length > 0) {
        remainingAccounts[0].is_active = true
      }
      
      setAccounts(remainingAccounts)
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
                  <div className="flex items-center space-x-4">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: '#78ae78' }}
                    >
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-gray-900">{account.name}</h4>
                        {account.is_active && (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            当前使用
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        ¥{account.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        创建时间: {new Date(account.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {!account.is_active && (
                      <button
                        onClick={() => handleSwitchAccount(account.id)}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-400 rounded-md transition-colors"
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
                    onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setFormData({ name: '', amount: 0 })
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
