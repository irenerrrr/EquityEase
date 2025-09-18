'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Trade } from '@/types'

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

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchPortfolio()
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

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

  const totalValue = portfolio.reduce((sum, item) => sum + item.current_value, 0)
  const totalCost = portfolio.reduce((sum, item) => sum + item.total_cost, 0)
  const totalProfitLoss = totalValue - totalCost
  const totalProfitLossPercentage = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0

  // 生成股票图标颜色
  const getStockIconColor = (symbol: string) => {
    const colors = ['#78ae78', '#6a9d6a', '#5c8e5c', '#4e7f4e', '#407040']
    const index = symbol.charCodeAt(0) % colors.length
    return colors[index]
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">持仓 (Positions)</h1>
      </div>

      {/* 持仓列表 */}
      <div className="bg-white rounded-lg shadow-sm">
        {/* 表头 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="grid grid-cols-5 gap-4 text-sm font-medium text-gray-500 uppercase tracking-wider">
            <div>ASSET</div>
            <div className="text-right">QUANTITY</div>
            <div className="text-right">VALUE</div>
            <div className="text-right">TODAY'S CHANGE</div>
            <div className="text-right">Trade</div>
          </div>
        </div>

        {/* 持仓项目 */}
        <div className="divide-y divide-gray-100">
          {portfolio.length > 0 ? portfolio.map((item) => (
            <div key={item.stock_symbol} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="grid grid-cols-5 gap-4 items-center">
                {/* 股票信息 */}
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: getStockIconColor(item.stock_symbol) }}
                  >
                    {item.stock_symbol.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{item.stock_name || item.stock_symbol}</div>
                    <div className="text-sm text-gray-500">{item.stock_symbol}</div>
                  </div>
                </div>

                {/* 数量 */}
                <div className="text-right">
                  <div className="font-medium text-gray-900">{item.total_quantity} shares</div>
                </div>

                {/* 市值 */}
                <div className="text-right">
                  <div className="font-medium text-gray-900">¥{item.current_value.toFixed(2)}</div>
                </div>

                {/* 今日变化 */}
                <div className="text-right">
                  <div className={`font-medium ${item.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.profit_loss >= 0 ? '+' : ''}¥{item.profit_loss.toFixed(2)}
                  </div>
                  <div className={`text-sm ${item.profit_loss_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.profit_loss_percentage >= 0 ? '+' : ''}{item.profit_loss_percentage.toFixed(2)}%
                  </div>
                </div>

                {/* 交易按钮 */}
                <div className="text-right">
                  <button 
                    onClick={() => router.push('/trades')}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Trade
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">暂无持仓</h3>
              <p className="text-gray-500 mb-4">您还没有任何股票持仓</p>
              <button 
                onClick={() => router.push('/trades')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white"
                style={{ backgroundColor: '#78ae78' }}
              >
                开始交易
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 持仓概览统计 */}
      {portfolio.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">持仓概览</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">¥{totalValue.toFixed(2)}</div>
              <div className="text-sm text-gray-500">总市值</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">¥{totalCost.toFixed(2)}</div>
              <div className="text-sm text-gray-500">总成本</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}¥{totalProfitLoss.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">总盈亏</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLossPercentage >= 0 ? '+' : ''}{totalProfitLossPercentage.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-500">总收益率</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
