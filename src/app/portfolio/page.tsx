'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Trade } from '@/types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface PortfolioItem {
  stock_symbol: string
  stock_name?: string
  total_quantity: number
  average_cost: number
  total_cost: number
  current_value: number
  profit_loss: number
  profit_loss_percentage: number
}

interface StockData {
  symbol: string
  name: string
  currentPrice: number
  change: number
  changePercent: number
  dataSource: 'live' | 'cached' | 'alpha_vantage' | 'tiingo' | 'finnhub' | 'yahoo' | 'error' // 数据来源标识
  chartData: {
    labels: string[]
    open: number[]
    high: number[]
    low: number[]
    close: number[]
    volume: number[]
  }
}

type TimeRange = '1m' | '3m' | '6m'

type ChartType = 'price' | 'volume'

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [selectedStock, setSelectedStock] = useState<string>('TQQQ')
  const [stockData, setStockData] = useState<StockData[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('6m')
  const [chartType, setChartType] = useState<ChartType>('price')
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchPortfolio()
        await fetchStockData()
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  // 监听时间范围变化，自动重新获取数据
  useEffect(() => {
    if (stockData.length > 0) {
      fetchStockData(true)
    }
  }, [timeRange])

  const fetchPortfolio = async () => {
    try {
      const response = await fetch('/api/trades')
      if (response.ok) {
        const data = await response.json()
        const trades: Trade[] = data.trades || []
        
        // 计算持仓统计
        const portfolioMap = new Map<string, PortfolioItem>()
        
        trades.forEach(trade => {
          const key = trade.stock_symbol
          const existing = portfolioMap.get(key)
          
          if (existing) {
            if (trade.trade_type === 'buy') {
              const newQuantity = existing.total_quantity + trade.quantity
              const newTotalCost = existing.total_cost + (trade.quantity * trade.price + trade.fees)
              existing.total_quantity = newQuantity
              existing.average_cost = newTotalCost / newQuantity
              existing.total_cost = newTotalCost
            } else {
              existing.total_quantity -= trade.quantity
              existing.total_cost -= (trade.quantity * existing.average_cost)
            }
          } else {
            if (trade.trade_type === 'buy') {
              portfolioMap.set(key, {
                stock_symbol: trade.stock_symbol,
                stock_name: trade.stock_name,
                total_quantity: trade.quantity,
                average_cost: trade.price,
                total_cost: trade.quantity * trade.price + trade.fees,
                current_value: trade.quantity * trade.price, // 这里应该用实时价格
                profit_loss: 0,
                profit_loss_percentage: 0
              })
            }
          }
        })
        
        // 过滤掉数量为0的持仓
        const portfolioItems = Array.from(portfolioMap.values()).filter(item => item.total_quantity > 0)
        
        // 计算盈亏（这里使用成本价作为当前价格的示例）
        portfolioItems.forEach(item => {
          item.current_value = item.total_quantity * item.average_cost // 实际应用中这里要用实时价格
          item.profit_loss = item.current_value - item.total_cost
          item.profit_loss_percentage = (item.profit_loss / item.total_cost) * 100
        })
        
        setPortfolio(portfolioItems)
      }
    } catch (error) {
      console.error('获取持仓数据失败:', error)
    }
  }

  const fetchStockData = async (showLoading = false, forceRefresh = false) => {
    if (showLoading) {
      setStockLoading(true)
    }
    
    try {
      const response = await fetch('/api/stocks/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: ['TQQQ', 'SQQQ'],
          timeRange: timeRange
        })
      })

      if (response.ok) {
        const realStockData: StockData[] = await response.json()
        setStockData(realStockData)
      } else {
        console.error('Failed to fetch stock data')
        // 如果API失败，不显示任何数据
        setStockData([])
      }
    } catch (error) {
      console.error('Error fetching stock data:', error)
      // 如果网络错误，不显示任何数据
      setStockData([])
    } finally {
      if (showLoading) {
        setStockLoading(false)
      }
    }
  }

  const getCurrentStockData = () => {
    return stockData.find(stock => stock.symbol === selectedStock)
  }

  const getChartData = () => {
    const currentStock = getCurrentStockData()
    if (!currentStock) return null

    if (chartType === 'volume') {
      // 成交量图表
      return {
        labels: currentStock.chartData.labels,
        datasets: [
          {
            label: '成交量',
            data: currentStock.chartData.volume,
            backgroundColor: 'rgba(120, 174, 120, 0.6)',
            borderColor: '#78ae78',
            borderWidth: 1,
          },
        ],
      }
    } else {
      // 价格图表 - 显示OHLC数据
      return {
        labels: currentStock.chartData.labels,
        datasets: [
          {
            label: '开盘价',
            data: currentStock.chartData.open,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
          {
            label: '最高价',
            data: currentStock.chartData.high,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
          {
            label: '最低价',
            data: currentStock.chartData.low,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
          {
            label: '收盘价',
            data: currentStock.chartData.close,
            borderColor: currentStock.change >= 0 ? '#78ae78' : '#ef4444',
            backgroundColor: currentStock.change >= 0 ? 'rgba(120, 174, 120, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: currentStock.change >= 0 ? '#78ae78' : '#ef4444',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
          },
        ],
      }
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: chartType === 'price', // 价格图表显示图例，成交量图表不显示
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#78ae78',
        borderWidth: 1,
        callbacks: {
          label: function(context: { dataset: { label?: string }; parsed: { y: number } }) {
            const label = context.dataset.label || ''
            const value = context.parsed.y
            if (chartType === 'volume') {
              return `${label}: ${value.toLocaleString()}`
            } else {
              return `${label}: $${value.toFixed(2)}`
            }
          }
        }
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '时间'
        },
        ticks: {
          maxTicksLimit: 8,
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: chartType === 'volume' ? '成交量' : '价格 ($)'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        ticks: {
          callback: function(value: string | number) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value
            if (chartType === 'volume') {
              return numValue.toLocaleString()
            } else {
              return '$' + numValue.toFixed(2)
            }
          }
        }
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
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

  const currentStock = getCurrentStockData()
  const chartData = getChartData()

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">持仓</h1>
      </div>

      {/* 股票导航栏 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {stockData.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => setSelectedStock(stock.symbol)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                selectedStock === stock.symbol
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {stock.symbol}
            </button>
          ))}
        </div>
        
        <div className="flex items-center space-x-4">
          {/* 图表类型选择器 */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            {[
              { value: 'price', label: '价格' },
              { value: 'volume', label: '成交量' }
            ].map((type) => (
              <button
                key={type.value}
                onClick={() => setChartType(type.value as ChartType)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartType === type.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          
          {/* 时间范围选择器 */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            {[
              { value: '6m', label: '6个月' },
              { value: '3m', label: '3个月' },
              { value: '1m', label: '1个月' }
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value as TimeRange)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeRange === range.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          
          
          
          
          {/* 刷新按钮 */}
          <button
            onClick={() => fetchStockData(true, true)}
            disabled={stockLoading}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {stockLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                更新中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新数据
              </>
            )}
          </button>
        </div>
      </div>

      {/* 主图表区域 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {currentStock && chartData ? (
          <>
            {/* 股票信息头部 */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{currentStock.name}</h2>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-500">{currentStock.symbol}</p>
                    {/* 数据来源指示器 */}
        <span className={`px-2 py-1 text-xs rounded-full ${
          currentStock.dataSource === 'live' 
            ? 'bg-green-100 text-green-800' 
            : currentStock.dataSource === 'tiingo'
            ? 'bg-purple-100 text-purple-800'
            : currentStock.dataSource === 'yahoo'
            ? 'bg-indigo-100 text-indigo-800'
            : currentStock.dataSource === 'finnhub'
            ? 'bg-orange-100 text-orange-800'
            : currentStock.dataSource === 'alpha_vantage'
            ? 'bg-blue-100 text-blue-800'
            : currentStock.dataSource === 'cached'
            ? 'bg-yellow-100 text-yellow-800'
            : currentStock.dataSource === 'error'
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-800'
        }`}>
          {currentStock.dataSource === 'live' ? '实时数据' : 
           currentStock.dataSource === 'tiingo' ? 'Tiingo' :
           currentStock.dataSource === 'yahoo' ? 'Yahoo Finance' :
           currentStock.dataSource === 'finnhub' ? 'Finnhub' :
           currentStock.dataSource === 'alpha_vantage' ? 'Alpha Vantage' :
           currentStock.dataSource === 'cached' ? '缓存数据' : 
           currentStock.dataSource === 'error' ? '数据错误' : '未知数据源'}
        </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    ${currentStock.currentPrice.toFixed(2)}
                  </div>
                  <div className={`text-sm ${currentStock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currentStock.change >= 0 ? '+' : ''}${currentStock.change.toFixed(2)} ({currentStock.changePercent >= 0 ? '+' : ''}{currentStock.changePercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
            </div>

            {/* 图表 */}
            <div className="h-96">
              {chartData && chartData.labels && chartData.labels.length > 0 ? (
                chartType === 'volume' ? (
                  <Bar data={chartData} options={chartOptions} />
                ) : (
                  <Line data={chartData} options={chartOptions} />
                )
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p>暂无数据</p>
                    {currentStock.dataSource === 'error' && (
                      <p className="text-sm text-red-500 mt-2">数据获取失败</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-96 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>加载图表数据中...</p>
            </div>
          </div>
        )}
      </div>

      {/* 交易操作卡片 - 独立区域 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 买入卡片 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">买入股票</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                投入资金比例 (%)
              </label>
              <input
                type="number"
                defaultValue="10"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                购买股数
              </label>
              <input
                type="number"
                defaultValue="200"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <button className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-md transition-colors">
              确认购入
            </button>
          </div>
        </div>

        {/* 卖出卡片 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">卖出股票</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                卖出股数
              </label>
              <input
                type="number"
                defaultValue="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                每股价格 (元)
              </label>
              <input
                type="number"
                step="0.01"
                defaultValue="50.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md transition-colors">
              确认卖出
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
