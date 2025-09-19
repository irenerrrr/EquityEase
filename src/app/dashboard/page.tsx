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

interface DashboardStats {
  totalAssets: number
  todayPnL: number
  cumulativePnL: number
  todayPnLPercentage: number
  cumulativePnLPercentage: number
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [assetData, setAssetData] = useState<AssetData>({ equity: 0, market_value: 0, cash: 0 })
  const [stats, setStats] = useState<DashboardStats>({
    totalAssets: 0,
    todayPnL: 0,
    cumulativePnL: 0,
    todayPnLPercentage: 0,
    cumulativePnLPercentage: 0
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
      console.log('Dashboard 收到账号切换事件，重新获取数据')
      fetchDashboardData()
    }

    window.addEventListener('accountSwitched', handleAccountSwitch)

    return () => {
      window.removeEventListener('accountSwitched', handleAccountSwitch)
    }
  }, [router])

  const fetchDashboardData = async () => {
    try {
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 获取当前选中的账号ID
      const currentAccountId = localStorage.getItem('currentAccountId')
      if (!currentAccountId) return

      // 获取该账号的最新快照数据
      const { data: latestSnapshot, error: latestError } = await supabase
        .from('account_snapshots_daily')
        .select('equity, market_value, cash, as_of_date')
        .eq('account_id', currentAccountId)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single()

      if (latestError) {
        console.error('获取最新快照数据失败:', latestError)
        return
      }

      if (!latestSnapshot) return

      // 获取昨天的快照数据用于计算今日盈亏
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      const { data: yesterdaySnapshot } = await supabase
        .from('account_snapshots_daily')
        .select('equity')
        .eq('account_id', currentAccountId)
        .eq('as_of_date', yesterdayStr)
        .single()

      // 获取第一个快照数据用于计算累计盈亏
      const { data: firstSnapshot } = await supabase
        .from('account_snapshots_daily')
        .select('equity')
        .eq('account_id', currentAccountId)
        .order('as_of_date', { ascending: true })
        .limit(1)
        .single()

      // 计算统计数据
      const currentEquity = latestSnapshot.equity || 0
      const yesterdayEquity = yesterdaySnapshot?.equity || 0
      const initialEquity = firstSnapshot?.equity || currentEquity

      const todayPnL = currentEquity - yesterdayEquity
      const cumulativePnL = currentEquity - initialEquity

      const todayPnLPercentage = yesterdayEquity > 0 ? (todayPnL / yesterdayEquity) * 100 : 0
      const cumulativePnLPercentage = initialEquity > 0 ? (cumulativePnL / initialEquity) * 100 : 0

      // 更新状态
      setAssetData({
        equity: currentEquity,
        market_value: latestSnapshot.market_value || 0,
        cash: latestSnapshot.cash || 0
      })

      setStats({
        totalAssets: currentEquity,
        todayPnL: todayPnL,
        cumulativePnL: cumulativePnL,
        todayPnLPercentage: todayPnLPercentage,
        cumulativePnLPercentage: cumulativePnLPercentage
      })

    } catch (error) {
      console.error('获取仪表板数据失败:', error)
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
              <p className="text-2xl font-semibold text-gray-900">${stats.totalAssets.toLocaleString()}</p>
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
                {stats.todayPnL >= 0 ? '+' : ''}${stats.todayPnL.toLocaleString()}
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
                {stats.cumulativePnL >= 0 ? '+' : ''}${stats.cumulativePnL.toLocaleString()}
              </p>
              <p className={`text-sm ${stats.cumulativePnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.cumulativePnLPercentage >= 0 ? '+' : ''}{stats.cumulativePnLPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

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
                      ${assetData.equity.toLocaleString()}
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

        {/* 持仓盈亏 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">持仓盈亏</h3>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <p>图表功能开发中...</p>
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
