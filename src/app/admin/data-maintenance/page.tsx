'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface MaintenanceResult {
  symbol: string
  status: string
  missingDates?: number
  filledGaps?: number
  updatedRecords?: number
  error?: string
}

interface DataMaintenanceResponse {
  success: boolean
  action: string
  results: MaintenanceResult[]
  timestamp: string
  error?: string
}

export default function DataMaintenancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [maintenanceResults, setMaintenanceResults] = useState<DataMaintenanceResponse | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [dataStats, setDataStats] = useState<Array<{
    symbol: string;
    name: string;
    totalRecords: number;
    latestDate: string;
  }> | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchDataStats()
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  const fetchDataStats = async () => {
    try {
      // 获取数据库中的数据统计
      const { data: symbols } = await supabase
        .from('symbols')
        .select('id, symbol, name')

      const stats = []
      for (const symbol of symbols || []) {
        const { count } = await supabase
          .from('daily_prices')
          .select('as_of_date', { count: 'exact' })
          .eq('symbol_id', symbol.id)
          .order('as_of_date', { ascending: false })
          .limit(1)

        const { data: latestPrice } = await supabase
          .from('daily_prices')
          .select('as_of_date')
          .eq('symbol_id', symbol.id)
          .order('as_of_date', { ascending: false })
          .limit(1)
          .single()

        stats.push({
          symbol: symbol.symbol,
          name: symbol.name,
          totalRecords: count || 0,
          latestDate: latestPrice?.as_of_date || 'N/A'
        })
      }

      setDataStats(stats)
    } catch (error) {
      console.error('Failed to fetch data stats:', error)
    }
  }

  const runMaintenance = async (action: 'maintain' | 'force_refresh') => {
    setIsRunning(true)
    try {
      const response = await fetch('/api/data-maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          symbols: ['TQQQ', 'SQQQ'],
          lookbackDays: 5,
          forceRefreshDays: 30
        }),
      })

      const result = await response.json()
      setMaintenanceResults(result)
      
      // 刷新数据统计
      await fetchDataStats()
    } catch (error) {
      console.error('Maintenance failed:', error)
      setMaintenanceResults({
        success: false,
        action,
        results: [],
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsRunning(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up_to_date':
        return 'text-green-600 bg-green-100'
      case 'updated':
        return 'text-blue-600 bg-blue-100'
      case 'force_refreshed':
        return 'text-purple-600 bg-purple-100'
      case 'error':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'up_to_date':
        return '数据完整'
      case 'updated':
        return '已更新'
      case 'force_refreshed':
        return '强制刷新'
      case 'error':
        return '错误'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">数据维护管理</h1>
          <p className="mt-2 text-gray-600">管理股票历史数据的完整性和更新</p>
        </div>

        {/* 操作按钮 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">数据维护操作</h2>
          <div className="flex space-x-4">
            <button
              onClick={() => runMaintenance('maintain')}
              disabled={isRunning}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? '运行中...' : '检查并补全数据'}
            </button>
            <button
              onClick={() => runMaintenance('force_refresh')}
              disabled={isRunning}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? '运行中...' : '强制刷新数据'}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            检查并补全数据：检查最近5天的数据缺口并补全<br/>
            强制刷新数据：重新拉取最近30天的所有数据
          </p>
        </div>

        {/* 数据统计 */}
        {dataStats && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">数据统计</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      标的
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名称
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      总记录数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      最新日期
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dataStats.map((stat, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {stat.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.totalRecords.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stat.latestDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 维护结果 */}
        {maintenanceResults && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">维护结果</h2>
            <div className="mb-4">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                maintenanceResults.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {maintenanceResults.success ? '成功' : '失败'}
              </div>
              <span className="ml-2 text-sm text-gray-500">
                {new Date(maintenanceResults.timestamp).toLocaleString()}
              </span>
            </div>
            
            {maintenanceResults.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{maintenanceResults.error}</p>
              </div>
            )}

            <div className="space-y-3">
              {maintenanceResults.results.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">{result.symbol}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(result.status)}`}>
                        {getStatusText(result.status)}
                      </span>
                    </div>
                    {result.error && (
                      <span className="text-sm text-red-600">{result.error}</span>
                    )}
                  </div>
                  
                  {result.missingDates !== undefined && (
                    <div className="mt-2 text-sm text-gray-600">
                      缺失日期: {result.missingDates} 天
                    </div>
                  )}
                  
                  {result.filledGaps !== undefined && (
                    <div className="mt-2 text-sm text-gray-600">
                      已补全: {result.filledGaps} 条记录
                    </div>
                  )}
                  
                  {result.updatedRecords !== undefined && (
                    <div className="mt-2 text-sm text-gray-600">
                      已更新: {result.updatedRecords} 条记录
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
