'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// 交易记录接口（基于transactions表结构）
interface Transaction {
  id: number
  created_at: string
  bigserial?: number
  qty: number
  price: number
  amount: number
  tx_type: 'buy' | 'sell'
  account_id: number
  UUID: string
  symbol: string
}

export default function TradesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)

  // supabase 已经在顶部导入
  const router = useRouter()

  useEffect(() => {
    checkUser()
    getCurrentAccountId()
  }, [])

  useEffect(() => {
    if (currentAccountId) {
      fetchTransactions()
    }
  }, [currentAccountId])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth')
    }
  }

  const getCurrentAccountId = () => {
    const accountId = localStorage.getItem('currentAccountId')
    setCurrentAccountId(accountId)
  }

  const fetchTransactions = async () => {
    if (!currentAccountId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/transactions?account_id=${currentAccountId}`)
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions || [])
      } else {
        console.error('获取交易记录失败:', response.statusText)
      }
    } catch (error) {
      console.error('获取交易记录失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
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

  if (!currentAccountId) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ backgroundColor: '#c8e4cc' }}>
        <div className="text-center">
          <p className="text-gray-600">请先选择一个基金账号</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">交易记录</h1>
        <p className="text-gray-600">查看您的股票交易历史</p>
      </div>

      {/* 交易记录列表 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">交易历史</h2>
        </div>
        
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">暂无交易记录</h3>
            <p className="mt-1 text-sm text-gray-500">开始您的第一笔交易吧！</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                   <thead className="bg-gray-50">
                     <tr>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">股票代码</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">交易类型</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单价</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总金额</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">交易时间</th>
                     </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-gray-200">
                     {transactions.map((transaction) => (
                       <tr key={transaction.id} className="hover:bg-gray-50">
                         <td className="px-6 py-4 whitespace-nowrap">
                           <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                             {transaction.symbol}
                           </span>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                           <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                             transaction.tx_type === 'buy'
                               ? 'bg-green-100 text-green-800'
                               : 'bg-red-100 text-red-800'
                           }`}>
                             {transaction.tx_type === 'buy' ? '买入' : '卖出'}
                           </span>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                           {transaction.qty.toLocaleString()} 股
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                           {formatCurrency(transaction.price)}
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                           {formatCurrency(transaction.amount)}
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                           {formatDate(transaction.created_at)}
                         </td>
                       </tr>
                     ))}
                   </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
