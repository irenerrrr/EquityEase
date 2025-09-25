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

interface TxSummary {
  netQty: number
  avgCost: number
  invested: number
  realizedPnL: number
  realizedToday: number
  unrealizedPnL: number
  todayPnL: number
}

export default function TradesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<'TQQQ' | 'SQQQ'>('TQQQ')
  const [summary, setSummary] = useState<TxSummary>({ netQty: 0, avgCost: 0, invested: 0, realizedPnL: 0, realizedToday: 0, unrealizedPnL: 0, todayPnL: 0 })
  const [priceInfo, setPriceInfo] = useState<{ currentPrice: number; prevClose: number }>({ currentPrice: 0, prevClose: 0 })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dailyStats, setDailyStats] = useState<{ totalTrades: number; totalVolume: number; today: { trades: number; volume: number; date: string }; yesterday: { trades: number; volume: number; date: string }; dayBefore: { trades: number; volume: number; date: string } }>({
    totalTrades: 0,
    totalVolume: 0,
    today: { trades: 0, volume: 0, date: '' },
    yesterday: { trades: 0, volume: 0, date: '' },
    dayBefore: { trades: 0, volume: 0, date: '' }
  })

  // supabase 已经在顶部导入
  const router = useRouter()

  useEffect(() => {
    checkUser()
    getCurrentAccountId()
  }, [])

  useEffect(() => {
    if (currentAccountId) {
      fetchTransactions(undefined, false)
    }
  }, [currentAccountId])

  // 监听交易完成与账号切换
  useEffect(() => {
    const onTx = () => { console.log('[Trades] transactionComplete'); fetchTransactions(undefined, true) }
    const onAcc = () => { console.log('[Trades] accountSwitched'); getCurrentAccountId(); fetchTransactions(undefined, true) }
    window.addEventListener('transactionComplete', onTx as EventListener)
    window.addEventListener('accountSwitched', onAcc as EventListener)
    return () => {
      window.removeEventListener('transactionComplete', onTx as EventListener)
      window.removeEventListener('accountSwitched', onAcc as EventListener)
    }
  }, [])

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

  const fetchTransactions = async (symbolOverride?: 'TQQQ' | 'SQQQ', localOnly: boolean = true) => {
    if (!currentAccountId) return
    
    try {
      if (localOnly) setListLoading(true); else setInitialLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/transactions?account_id=${currentAccountId}` , {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      if (response.ok) {
        const data = await response.json()
        const all: Transaction[] = data.transactions || []
        const symbol = symbolOverride ?? selectedSymbol
        // 仅当前标的，并按时间升序用于成本计算
        const filtered = all
          .filter(tx => tx.symbol === symbol)
          .sort((a: Transaction, b: Transaction) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        console.log('[Trades] fetched:', { total: all.length, filtered: filtered.length, selectedSymbol: symbol })
        setTransactions(filtered)

        // 基于 transactions 计算汇总（不依赖 positions）
        const calc = computeSummary(filtered)
        setSummary(prev => ({ ...prev, ...calc }))
        setDailyStats(computeDailyStats(filtered))
        // 价格信息用于未实现与今日盈亏
        const p = await fetchPriceInfo(symbol)
        const unrealized = calc.netQty * (p.currentPrice - calc.avgCost)
        const todayUnrealized = calc.netQty * (p.currentPrice - p.prevClose)
        const todayPnL = calc.realizedToday + todayUnrealized
        setPriceInfo(p)
        setSummary(prev => ({ ...prev, unrealizedPnL: unrealized, todayPnL }))
      } else {
        console.error('获取交易记录失败:', response.statusText)
      }
    } catch (error) {
      console.error('获取交易记录失败:', error)
    } finally {
      if (localOnly) setListLoading(false); else setInitialLoading(false)
    }
  }

  const computeSummary = (txs: Transaction[]): TxSummary => {
    let netQty = 0
    let invested = 0
    let avgCost = 0
    let realizedPnL = 0
    let realizedToday = 0
    const todayStr = new Date().toISOString().split('T')[0]

    for (const tx of txs) {
      const qty = Number(tx.qty) || 0
      const price = Number(tx.price) || 0
      if (tx.tx_type === 'buy') {
        invested += qty * price
        netQty += qty
        avgCost = netQty > 0 ? invested / netQty : 0
      } else {
        // 卖出按当前平均成本扣减投入
        const costOut = avgCost * qty
        const gain = (price - avgCost) * qty
        realizedPnL += gain
        if (tx.created_at && tx.created_at.startsWith(todayStr)) {
          realizedToday += gain
        }
        invested = Math.max(0, invested - costOut)
        netQty = Math.max(0, netQty - qty)
        avgCost = netQty > 0 ? invested / netQty : 0
      }
    }

    return { netQty, avgCost, invested, realizedPnL, realizedToday, unrealizedPnL: 0, todayPnL: 0 }
  }

  const toDateStr = (iso: string) => new Date(iso).toISOString().split('T')[0]
  const startOf = (d: Date) => new Date(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString())
  const computeDailyStats = (txs: Transaction[]) => {
    const today = startOf(new Date())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dayBefore = new Date(today)
    dayBefore.setDate(dayBefore.getDate() - 2)

    const toKey = (dt: string) => toDateStr(dt)
    const group = new Map<string, { trades: number; volume: number }>()
    let totalTrades = 0
    let totalVolume = 0
    for (const tx of txs) {
      const key = toKey(tx.created_at)
      const vol = Math.abs(Number(tx.amount) || 0)
      const cur = group.get(key) || { trades: 0, volume: 0 }
      cur.trades += 1
      cur.volume += vol
      group.set(key, cur)
      totalTrades += 1
      totalVolume += vol
    }

    const get = (d: Date) => {
      const key = toDateStr(d.toISOString())
      const g = group.get(key) || { trades: 0, volume: 0 }
      return { trades: g.trades, volume: g.volume, date: key }
    }

    return {
      totalTrades,
      totalVolume,
      today: get(today),
      yesterday: get(yesterday),
      dayBefore: get(dayBefore)
    }
  }

  const fetchPriceInfo = async (symbol: 'TQQQ' | 'SQQQ'): Promise<{ currentPrice: number; prevClose: number }> => {
    try {
      const res = await fetch('/api/stocks/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol], timeRange: '6m' })
      })
      if (res.ok) {
        const arr = await res.json()
        const row = Array.isArray(arr) ? arr.find((r: { symbol: string; chartData?: { close?: number[] }; currentPrice?: number }) => r.symbol === symbol) : null
        const closes: number[] = row?.chartData?.close || []
        const currentPrice = Number(row?.currentPrice) || (closes.length ? Number(closes[closes.length - 1]) : 0)
        const prevClose = closes.length > 1 ? Number(closes[closes.length - 2]) : currentPrice
        return { currentPrice, prevClose }
      }
    } catch (e) {
      console.error('[Trades] fetchPriceInfo error', e)
    }
    return { currentPrice: 0, prevClose: 0 }
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


  if (initialLoading) {
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

  // 依据日期筛选展示的记录
  const displayed = selectedDate ? transactions.filter(tx => tx.created_at.startsWith(selectedDate)) : transactions

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">交易记录</h1>
        <p className="text-gray-600">查看您的股票交易历史</p>
      </div>

      {/* 顶部切换与刷新 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(['TQQQ','SQQQ'] as const).map(sym => (
            <button
              key={sym}
              onClick={() => { if (sym !== selectedSymbol) { setSelectedSymbol(sym); fetchTransactions(sym, true) } }}
              disabled={selectedSymbol === sym || listLoading}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:cursor-default disabled:opacity-100 ${
                selectedSymbol === sym ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <button
          onClick={() => fetchTransactions(undefined, true)}
          disabled={listLoading}
          className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          {listLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
              刷新中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 主列表区域 */}
        <div className="lg:col-span-3 space-y-6">
      {/* 交易记录列表 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">交易历史</h2>
            {selectedDate && (
              <button onClick={() => setSelectedDate(null)} className="text-sm text-gray-600 hover:text-gray-900">清除日期筛选</button>
            )}
          </div>
        </div>
        
        {listLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">正在加载交易记录...</p>
          </div>
        ) : displayed.length === 0 ? (
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
                     {displayed.map((transaction) => (
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
                           ${transaction.price.toFixed(2)}
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                           ${transaction.amount.toFixed(2)}
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

      {/* 汇总（基于交易记录计算） */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">持仓汇总（{selectedSymbol}）</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">持有股票数</p>
            <p className="text-xl font-semibold text-gray-900">{summary.netQty.toLocaleString()} 股</p>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">平均成本</p>
            <p className="text-xl font-semibold text-gray-900">${summary.avgCost.toFixed(2)}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">投资总额</p>
            <p className="text-xl font-semibold text-gray-900">${summary.invested.toFixed(2)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">已实现盈亏（累计）</p>
            <p className={`text-xl font-semibold ${summary.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.realizedPnL >= 0 ? '+' : ''}${summary.realizedPnL.toFixed(2)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">未实现盈亏（当前）</p>
            <p className={`text-xl font-semibold ${summary.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.unrealizedPnL >= 0 ? '+' : ''}${summary.unrealizedPnL.toFixed(2)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">今日盈亏</p>
            <p className={`text-xl font-semibold ${summary.todayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.todayPnL >= 0 ? '+' : ''}${summary.todayPnL.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* 右侧侧栏：按日统计 */}
      <aside className="lg:col-span-1">
        <div className="sticky top-20 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">按日统计（{selectedSymbol}）</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">总交易</span>
                <span className="text-sm text-gray-900">{dailyStats.totalTrades} 笔｜${dailyStats.totalVolume.toFixed(2)}</span>
              </div>
              <button onClick={() => setSelectedDate(dailyStats.today.date)} className={`w-full text-left px-3 py-2 rounded ${selectedDate===dailyStats.today.date ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">今日</span>
                  <span className="text-sm text-gray-900">{dailyStats.today.trades}｜${dailyStats.today.volume.toFixed(2)}</span>
                </div>
              </button>
              <button onClick={() => setSelectedDate(dailyStats.yesterday.date)} className={`w-full text-left px-3 py-2 rounded ${selectedDate===dailyStats.yesterday.date ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">昨日</span>
                  <span className="text-sm text-gray-900">{dailyStats.yesterday.trades}｜${dailyStats.yesterday.volume.toFixed(2)}</span>
                </div>
              </button>
              <button onClick={() => setSelectedDate(dailyStats.dayBefore.date)} className={`w-full text-left px-3 py-2 rounded ${selectedDate===dailyStats.dayBefore.date ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">前日</span>
                  <span className="text-sm text-gray-900">{dailyStats.dayBefore.trades}｜${dailyStats.dayBefore.volume.toFixed(2)}</span>
                </div>
              </button>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="w-full mt-2 text-xs text-gray-600 hover:text-gray-900">清除日期筛选</button>
              )}
            </div>
          </div>
        </div>
      </aside>
      </div>
    </div>
  )
}
