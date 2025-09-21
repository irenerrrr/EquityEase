'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

interface AssetData {
  equity: number
  market_value: number
  cash: number
}

interface PositionData {
  symbol: string
  name: string
  net_qty: number
  avg_cost: number
  invested: number
  realized_pnl: number
  current_price?: number
  current_value?: number
  unrealized_pnl?: number
}

interface TransactionStats {
  todayTrades: number
  todayVolume: number
  totalTrades: number
  totalVolume: number
}

interface DashboardStats {
  totalAssets: number
  todayPnL: number
  cumulativePnL: number
  todayPnLPercentage: number
  cumulativePnLPercentage: number
  realizedPnL: number
  unrealizedPnL: number
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [assetData, setAssetData] = useState<AssetData>({ equity: 0, market_value: 0, cash: 0 })
  const [positions, setPositions] = useState<PositionData[]>([])
  const [transactionStats, setTransactionStats] = useState<TransactionStats>({
    todayTrades: 0,
    todayVolume: 0,
    totalTrades: 0,
    totalVolume: 0
  })
  const [stats, setStats] = useState<DashboardStats>({
    totalAssets: 0,
    todayPnL: 0,
    cumulativePnL: 0,
    todayPnLPercentage: 0,
    cumulativePnLPercentage: 0,
    realizedPnL: 0,
    unrealizedPnL: 0
  })
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchDashboardData()
        setLoading(false)
      }
    }

    checkUser()

    // 监听账号切换事件
    const handleAccountSwitch = () => {
      console.log('[Dashboard] 收到 accountSwitched 事件，准备重新获取数据', {
        newCurrentAccountId: localStorage.getItem('currentAccountId'),
        at: new Date().toISOString()
      })
      fetchDashboardData()
    }

    // 监听交易完成事件
    const handleTransactionComplete = () => {
      console.log('[Dashboard] 收到交易完成事件，刷新数据')
      fetchDashboardData()
    }

    window.addEventListener('accountSwitched', handleAccountSwitch)
    window.addEventListener('transactionComplete', handleTransactionComplete)

    return () => {
      window.removeEventListener('accountSwitched', handleAccountSwitch)
      window.removeEventListener('transactionComplete', handleTransactionComplete)
    }
  }, [router])

  const fetchDashboardData = async () => {
    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 获取当前选中的账号ID
      let currentAccountId = localStorage.getItem('currentAccountId')
      const savedJson = localStorage.getItem('currentAccount')
      if (savedJson) {
        try {
          const parsed = JSON.parse(savedJson)
          if (parsed?.id) currentAccountId = String(parsed.id)
        } catch {}
      }
      if (!currentAccountId) return

      // 首页打开时，先触发一次快照刷新，重算市值并更新 daily_return/cum_factor
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/account-snapshots', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ account_id: Number(currentAccountId), action: 'refresh' })
        })
      } catch (e) {
        console.warn('[Dashboard] 快照刷新失败，继续读取已有快照', e)
      }

      // 并行获取所有数据
      const [snapshotData, positionsData, transactionData] = await Promise.all([
        fetchSnapshotData(currentAccountId),
        fetchPositionsData(currentAccountId),
        fetchTransactionStats(currentAccountId)
      ])

      if (!snapshotData) return

      // 计算统计数据
      const cash = snapshotData.cash || 0
      const marketValue = snapshotData.market_value || 0
      const currentEquity = snapshotData.equity || 0  // 直接使用数据库中的equity
      const yesterdayEquity = snapshotData.yesterdayEquity || 0
      // 复利相关字段已移除显示，仅保留现有统计

      // 重新计算当前市值（基于当前市场价格）- 仅用于显示持仓详情
      const currentMarketValue = positionsData.reduce((sum, pos) => sum + (pos.current_value || 0), 0)

      // 基于 positions 表计算已实现盈亏
      const realizedPnL = positionsData.reduce((sum, pos) => sum + (pos.realized_pnl || 0), 0)
      
      // 计算未实现盈亏（当前市值 - 投资成本）
      const unrealizedPnL = positionsData.reduce((sum, pos) => {
        const currentValue = (pos.current_value || 0)
        const invested = pos.invested || 0
        return sum + (currentValue - invested)
      }, 0)

      console.log('[Dashboard] 快照数据:', {
        cash,
        marketValue,
        currentEquity,
        yesterdayEquity,
        todayPnL: currentEquity - yesterdayEquity,
        realizedPnL,
        unrealizedPnL
      })

      console.log('[Dashboard] 持仓数据:', {
        positionsCount: positionsData.length,
        positions: positionsData.map(p => ({
          symbol: p.symbol,
          net_qty: p.net_qty,
          avg_cost: p.avg_cost,
          invested: p.invested,
          realized_pnl: p.realized_pnl,
          current_value: p.current_value,
          unrealized_pnl: p.unrealized_pnl
        })),
        realizedPnL,
        unrealizedPnL
      })

      // 计算今日盈亏（现在所有账号都有昨天的快照）
      const todayPnL = currentEquity - yesterdayEquity
      const todayPnLPercentage = yesterdayEquity > 0 ? (todayPnL / yesterdayEquity) * 100 : 0
      
      // 累计盈亏 = 今日盈亏（因为只有昨天和今天的数据）
      const cumulativePnL = todayPnL
      const cumulativePnLPercentage = todayPnLPercentage

      // 复利相关指标已移除

      // 更新状态
      setAssetData({
        equity: currentEquity,        // 使用数据库中的equity
        market_value: marketValue,    // 使用数据库中的market_value
        cash: cash
      })

      setPositions(positionsData)
      setTransactionStats(transactionData)

      setStats({
        totalAssets: currentEquity,
        todayPnL: todayPnL,
        cumulativePnL: cumulativePnL,
        todayPnLPercentage: todayPnLPercentage,
        cumulativePnLPercentage: cumulativePnLPercentage,
        realizedPnL: realizedPnL,
        unrealizedPnL: unrealizedPnL
      })

    } catch (error) {
      console.error('获取仪表板数据失败:', error)
    }
  }

  // 获取快照数据
  const fetchSnapshotData = async (accountId: string) => {
    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // 获取最新快照
      const { data: latestSnapshot, error: latestError } = await supabase
        .from('account_snapshots_daily')
        .select('equity, market_value, cash, as_of_date')
        .eq('account_id', accountId)
        .eq('UUID', user.id)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single()

      if (latestError) {
        console.error('获取最新快照数据失败:', latestError)
        return null
      }

      if (!latestSnapshot) return null

      // 获取昨天的快照
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      const { data: yesterdaySnapshot } = await supabase
        .from('account_snapshots_daily')
        .select('equity')
        .eq('account_id', accountId)
        .eq('UUID', user.id)
        .eq('as_of_date', yesterdayStr)
        .single()

      return {
        equity: latestSnapshot.equity || 0,
        market_value: latestSnapshot.market_value || 0,
        cash: latestSnapshot.cash || 0,
        yesterdayEquity: yesterdaySnapshot?.equity || 0,
        firstDate: undefined,
        latestDate: latestSnapshot.as_of_date
      }
    } catch (error) {
      console.error('获取快照数据失败:', error)
      return null
    }
  }

  // 获取持仓数据
  const fetchPositionsData = async (accountId: string): Promise<PositionData[]> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/positions?account_id=${accountId}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })

      if (!response.ok) {
        console.error('获取持仓数据失败')
        return []
      }

      const { positions } = await response.json()
      const positionsData = positions || []

      console.log('[Dashboard] 持仓原始数据:', positionsData)

      // 获取所有持仓的当前市场价格
      if (positionsData.length > 0) {
        const symbols = positionsData.map((pos: any) => pos.symbols?.symbol).filter(Boolean)
        
        try {
          const stockResponse = await fetch('/api/stocks/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: symbols,
              timeRange: '1d' // 只需要当前价格
            })
          })

          if (stockResponse.ok) {
            const stockData = await stockResponse.json()
            
            // 更新每个持仓的当前价格和市值
            positionsData.forEach((position: any) => {
              const stock = stockData.find((s: any) => s.symbol === position.symbols?.symbol)
              if (stock) {
                position.current_price = stock.currentPrice
                position.current_value = position.net_qty * stock.currentPrice
                position.unrealized_pnl = position.current_value - position.invested
              }
            })
          }
        } catch (error) {
          console.error('获取当前价格失败:', error)
        }
      }

      // 转换数据格式以匹配 PositionData 接口
      return positionsData.map((pos: any) => {
        const symbol = pos.symbols?.symbol || ''
        let name = pos.symbols?.name || ''
        
        // 如果数据库中没有名称，根据股票代码设置默认名称
        if (!name && symbol) {
          if (symbol === 'TQQQ') {
            name = 'ProShares UltraPro QQQ'
          } else if (symbol === 'SQQQ') {
            name = 'ProShares UltraPro Short QQQ'
          } else {
            name = symbol // 如果没有匹配的默认名称，使用股票代码
          }
        }
        
        return {
          symbol: symbol,
          name: name,
          net_qty: pos.net_qty || 0,
          avg_cost: pos.avg_cost || 0,
          invested: pos.invested || 0,
          realized_pnl: pos.realized_pnl || 0,
          current_price: pos.current_price,
          current_value: pos.current_value,
          unrealized_pnl: pos.unrealized_pnl
        }
      })
    } catch (error) {
      console.error('获取持仓数据失败:', error)
      return []
    }
  }

  // 获取交易统计
  const fetchTransactionStats = async (accountId: string): Promise<TransactionStats> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/transactions?account_id=${accountId}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })

      if (!response.ok) {
        console.error('获取交易数据失败')
        return { todayTrades: 0, todayVolume: 0, totalTrades: 0, totalVolume: 0 }
      }

      const { transactions } = await response.json()
      const allTransactions = transactions || []

      // 计算今日交易
      const today = new Date().toISOString().split('T')[0]
      const todayTransactions = allTransactions.filter((tx: any) => 
        tx.created_at && tx.created_at.startsWith(today)
      )

      const todayTrades = todayTransactions.length
      const todayVolume = todayTransactions.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0)

      const totalTrades = allTransactions.length
      const totalVolume = allTransactions.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0)

      console.log('[Dashboard] 交易统计:', {
        allTransactionsCount: allTransactions.length,
        todayTransactionsCount: todayTransactions.length,
        todayVolume,
        totalVolume,
        sampleTransactions: allTransactions.slice(0, 3).map((tx: any) => ({
          symbol: tx.symbol,
          tx_type: tx.tx_type,
          amount: tx.amount,
          created_at: tx.created_at
        }))
      })

      return { todayTrades, todayVolume, totalTrades, totalVolume }
    } catch (error) {
      console.error('获取交易统计失败:', error)
      return { todayTrades: 0, todayVolume: 0, totalTrades: 0, totalVolume: 0 }
    }
  }

  // 创建Doughnut Chart配置
  const chartData = {
    labels: ['现金', '市值'],
    datasets: [
      {
        data: [assetData.cash, assetData.market_value],
        backgroundColor: [
          '#78ae78', // 现金 - 绿色
          '#4a90e2', // 市值 - 蓝色
        ],
        borderColor: [
          '#6a9d6a',
          '#357abd',
        ],
        borderWidth: 2,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: { label?: string; parsed: number }) {
            const label = context.label || ''
            const value = context.parsed
            const total = assetData.equity
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
            return `${label}: $${value.toLocaleString()} (${percentage}%)`
          }
        }
      }
    },
    cutout: '60%', // 中心空心部分
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">资产总览</h1>
        <p className="text-gray-600">欢迎使用轻松看资产，查看您的投资概况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* 总资产 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">总资产</p>
              <p className="text-2xl font-semibold text-gray-900">${stats.totalAssets.toFixed(2)}</p>
              <p className={`text-sm ${stats.cumulativePnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.cumulativePnLPercentage >= 0 ? '+' : ''}{stats.cumulativePnLPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* 今日盈亏 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">今日盈亏</p>
              <p className={`text-2xl font-semibold ${stats.todayPnL >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {stats.todayPnL >= 0 ? '+' : ''}${stats.todayPnL.toFixed(2)}
              </p>
              <p className={`text-sm ${stats.todayPnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.todayPnLPercentage >= 0 ? '+' : ''}{stats.todayPnLPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* 累计盈亏 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">累计盈亏</p>
              <p className={`text-2xl font-semibold ${stats.cumulativePnL >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {stats.cumulativePnL >= 0 ? '+' : ''}${stats.cumulativePnL.toFixed(2)}
              </p>
              <p className={`text-sm ${stats.cumulativePnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.cumulativePnLPercentage >= 0 ? '+' : ''}{stats.cumulativePnLPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        
      </div>

      {/* 新增统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* 已实现盈亏 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#4a90e2' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">已实现盈亏</p>
              <p className={`text-xl font-semibold ${stats.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.realizedPnL >= 0 ? '+' : ''}${stats.realizedPnL.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* 未实现盈亏 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#f4a261' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">未实现盈亏</p>
              <p className={`text-xl font-semibold ${stats.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.unrealizedPnL >= 0 ? '+' : ''}${stats.unrealizedPnL.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* 今日交易 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#9b59b6' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">今日交易</p>
              <p className="text-xl font-semibold text-gray-900">{transactionStats.todayTrades} 笔</p>
              <p className="text-sm text-gray-500">${transactionStats.todayVolume.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 总交易 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-md" style={{ backgroundColor: '#e74c3c' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">总交易</p>
              <p className="text-xl font-semibold text-gray-900">{transactionStats.totalTrades} 笔</p>
              <p className="text-sm text-gray-500">${transactionStats.totalVolume.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 持仓详情 */}
      {positions.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">持仓详情</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">股票</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">持有数量</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">平均成本</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">投资金额</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">当前价值</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">已实现盈亏</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">未实现盈亏</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {positions.map((position, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{position.symbol}</div>
                        <div className="text-sm text-gray-500">{position.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {position.net_qty.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${position.avg_cost.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${position.invested.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${(position.current_value || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${position.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {position.realized_pnl >= 0 ? '+' : ''}${position.realized_pnl.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${(position.unrealized_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(position.unrealized_pnl || 0) >= 0 ? '+' : ''}${(position.unrealized_pnl || 0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 资产分布 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">资产分布</h3>
          <div className="relative h-64">
            {assetData.equity > 0 ? (
              <>
                <Doughnut data={chartData} options={chartOptions} />
                {/* 中心显示总资产 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                ${assetData.equity.toFixed(2)}
              </div>
                    <div className="text-sm text-gray-500">总资产</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p>暂无资产数据</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 盈亏分析 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">盈亏分析</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-green-800">已实现盈亏</p>
                <p className="text-xs text-green-600">通过卖出获得的实际盈亏</p>
              </div>
              <p className={`text-lg font-semibold ${stats.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.realizedPnL >= 0 ? '+' : ''}${stats.realizedPnL.toLocaleString()}
              </p>
            </div>
            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-blue-800">未实现盈亏</p>
                <p className="text-xs text-blue-600">当前持仓的浮动盈亏</p>
              </div>
              <p className={`text-lg font-semibold ${stats.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.unrealizedPnL >= 0 ? '+' : ''}${stats.unrealizedPnL.toLocaleString()}
              </p>
            </div>
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">总盈亏</p>
                <p className="text-xs text-gray-600">已实现 + 未实现</p>
              </div>
              <p className={`text-lg font-semibold ${stats.cumulativePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.cumulativePnL >= 0 ? '+' : ''}${stats.cumulativePnL.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="mt-8">
        <h3 className="text-lg font-medium text-gray-900 mb-4">快速操作</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => router.push('/trades')}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center">
              <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-medium text-gray-900">添加交易</p>
                <p className="text-sm text-gray-500">记录新的交易记录</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => router.push('/portfolio')}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center">
              <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-medium text-gray-900">查看持仓</p>
                <p className="text-sm text-gray-500">分析持仓情况</p>
              </div>
            </div>
          </button>

          <button className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left">
            <div className="flex items-center">
              <div className="p-2 rounded-md" style={{ backgroundColor: '#78ae78' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-medium text-gray-900">导出报表</p>
                <p className="text-sm text-gray-500">生成投资报表</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
