'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Trade } from '@/types'
import CustomAlert from '@/components/CustomAlert'
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
import { Line } from 'react-chartjs-2'

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
  dataSource: 'live' | 'cached' | 'alpha_vantage' | 'tiingo' | 'finnhub' | 'yahoo' | 'yahoo_finance' | 'error' // 数据来源标识
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

// 组合图，不再需要单独切换图类型

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [selectedStock, setSelectedStock] = useState<string>('TQQQ')
  const [stockData, setStockData] = useState<StockData[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('6m')
  // 组合图：无图表类型切换
  const [userEquity, setUserEquity] = useState<number>(0)
  const [userCash, setUserCash] = useState<number>(0)
  const [ownedShares, setOwnedShares] = useState<number>(0)
  const [investmentPercentage, setInvestmentPercentage] = useState<string>('')
  const [sharePrice, setSharePrice] = useState<string>('')
  const [calculatedShares, setCalculatedShares] = useState<number>(0)
  const [manualShares, setManualShares] = useState<string>('')
  const [buying, setBuying] = useState<boolean>(false)
  const [sellShares, setSellShares] = useState<string>('')
  const [sellPrice, setSellPrice] = useState<string>('')
  const [selling, setSelling] = useState<boolean>(false)
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
      } else {
        await fetchPortfolio()
        await fetchUserEquity()
        await fetchStockData()
        await fetchOwnedShares()
        setLoading(false)
      }
    }

    checkUser()

    // 监听账号切换，刷新本页数据
    const handleAccountSwitch = (e: CustomEvent) => {
      console.log('[Portfolio] 收到 accountSwitched 事件，刷新数据', {
        accountId: e.detail?.accountId ?? localStorage.getItem('currentAccountId'),
        at: new Date().toISOString()
      })
      fetchPortfolio()
      fetchUserEquity()
      fetchStockData(true)
      fetchOwnedShares()
    }
    window.addEventListener('accountSwitched', handleAccountSwitch as EventListener)
    return () => {
      window.removeEventListener('accountSwitched', handleAccountSwitch as EventListener)
    }
  }, [router])

  // 监听时间范围变化，自动重新获取数据
  useEffect(() => {
    if (stockData.length > 0) {
      fetchStockData(true)
    }
  }, [timeRange])

  // 监听股票数据或百分比变化，重新计算股数
  useEffect(() => {
    if (investmentPercentage && stockData.length > 0) {
      calculateShares(investmentPercentage, sharePrice)
    }
  }, [stockData, selectedStock, userCash])

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
        
        // 获取所有持仓的当前市场价格
        if (portfolioItems.length > 0) {
          const symbols = portfolioItems.map(item => item.stock_symbol)
          
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
              const stockData: Array<{ symbol: string; currentPrice: number }> = await stockResponse.json()
              
              // 更新每个持仓的当前价格和市值
              portfolioItems.forEach(item => {
                const stock = stockData.find((s) => s.symbol === item.stock_symbol)
                if (stock) {
                  item.current_value = item.total_quantity * stock.currentPrice
                  item.profit_loss = item.current_value - item.total_cost
                  item.profit_loss_percentage = (item.profit_loss / item.total_cost) * 100
                } else {
                  // 如果获取不到实时价格，使用成本价
                  item.current_value = item.total_quantity * item.average_cost
                  item.profit_loss = item.current_value - item.total_cost
                  item.profit_loss_percentage = (item.profit_loss / item.total_cost) * 100
                }
              })
            }
          } catch (error) {
            console.error('获取当前价格失败:', error)
            // 如果获取失败，使用成本价
            portfolioItems.forEach(item => {
              item.current_value = item.total_quantity * item.average_cost
              item.profit_loss = item.current_value - item.total_cost
              item.profit_loss_percentage = (item.profit_loss / item.total_cost) * 100
            })
          }
        }
        
        setPortfolio(portfolioItems)
      }
    } catch (error) {
      console.error('获取持仓数据失败:', error)
    }
  }

  const fetchUserEquity = async () => {
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

      // 获取该账号的最新快照数据（按账号与当前用户过滤）
      const { data: latestSnapshot, error: latestError } = await supabase
        .from('account_snapshots_daily')
        .select('equity, cash')
        .eq('UUID', user.id)
        .eq('account_id', parseInt(currentAccountId))
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single()

      if (latestError) {
        console.error('获取用户资产失败:', latestError)
        return
      }

      if (latestSnapshot) {
        const equity = latestSnapshot.equity || 0
        const cash = latestSnapshot.cash || 0
        setUserEquity(equity)
        setUserCash(cash)
        console.log('用户资产获取成功:', equity, '现金:', cash)
      }
    } catch (error) {
      console.error('获取用户资产失败:', error)
    }
  }

  // 从 positions 表获取当前选中股票的持有股数
  const fetchOwnedShares = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 获取当前选中的账号ID（优先JSON）
      let currentAccountId = localStorage.getItem('currentAccountId')
      const savedJson = localStorage.getItem('currentAccount')
      if (savedJson) {
        try {
          const parsed = JSON.parse(savedJson)
          if (parsed?.id) currentAccountId = String(parsed.id)
        } catch {}
      }
      if (!currentAccountId) return

      // 从 positions API 获取持仓数据
      const params = new URLSearchParams({ account_id: String(currentAccountId) })
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/positions?${params.toString()}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      if (!res.ok) {
        console.error('获取持仓数据失败')
        setOwnedShares(0)
        return
      }
      const json = await res.json()
      const positions = (json?.positions || []) as Array<{ 
        net_qty: number; 
        symbols: { symbol: string } 
      }>

      // 查找当前选中股票的持仓
      const symbol = selectedStock
      const currentPosition = positions.find(pos => pos.symbols.symbol === symbol)
      const netQty = currentPosition ? Number(currentPosition.net_qty) || 0 : 0
      
      setOwnedShares(netQty)
      console.log('[Portfolio] 获取持仓股数', { symbol, netQty })
    } catch (err) {
      console.error('获取持仓股数失败:', err)
      setOwnedShares(0)
    }
  }

  const calculateShares = (percentage: string, price: string) => {
    console.log('计算股数:', { percentage, price, userCash })
    
    // 如果百分比为空，显示占位符
    if (!percentage) {
      setCalculatedShares(0)
      return
    }
    
    const percentageNum = parseFloat(percentage)
    if (isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100) {
      setCalculatedShares(0)
      return
    }

    if (userCash <= 0) {
      console.log('用户资产为0或未获取到')
      setCalculatedShares(0)
      return
    }

    // 如果用户没有输入价格，使用当前股票价格
    let priceNum: number
    if (!price || price.trim() === '') {
      const currentStock = stockData.find(stock => stock.symbol === selectedStock)
      priceNum = currentStock?.currentPrice || 0
      console.log('使用当前股票价格:', priceNum)
    } else {
      priceNum = parseFloat(price)
    }
    
    if (isNaN(priceNum) || priceNum <= 0) {
      setCalculatedShares(0)
      return
    }

    const investmentAmount = (userCash * percentageNum) / 100
    const shares = Math.floor(investmentAmount / priceNum)
    
    console.log('计算结果:', { investmentAmount, shares, usedPrice: priceNum })
    setCalculatedShares(shares)
  }

  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInvestmentPercentage(value)
    calculateShares(value, sharePrice)
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSharePrice(value)
    calculateShares(investmentPercentage, value)
  }

  // 当选中的股票切换时，重新计算持有股数
  useEffect(() => {
    if (!loading) {
      fetchOwnedShares()
    }
  }, [selectedStock])

  const handleBuyStock = async () => {
    try {
      setBuying(true)

      // 验证输入
      if (!sharePrice) {
        setAlert({ message: '请填写每股价格', type: 'error' })
        return
      }

      const percentageNum = investmentPercentage ? parseFloat(investmentPercentage) : 0
      const priceNum = parseFloat(sharePrice)
      const sharesNum = manualShares ? parseInt(manualShares) : 0

      // 如果填写了百分比，验证其有效性
      if (investmentPercentage && (isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100)) {
        setAlert({ message: '投资百分比必须在1-100之间', type: 'error' })
        return
      }

      if (isNaN(priceNum) || priceNum <= 0) {
        setAlert({ message: '每股价格必须大于0', type: 'error' })
        return
      }

      if (!manualShares || isNaN(sharesNum) || sharesNum <= 0) {
        setAlert({ message: '请填写股票数量', type: 'error' })
        return
      }

      // 获取当前用户和账号ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAlert({ message: '用户未登录', type: 'error' })
        return
      }

      const currentAccountId = localStorage.getItem('currentAccountId')
      if (!currentAccountId) {
        setAlert({ message: '请先选择一个账号', type: 'error' })
        return
      }

      // 计算总金额
      const totalAmount = sharesNum * priceNum

      // 预估市值与现金变化（买入：现金按输入价，市值按当前市价）
      const selected = stockData.find(s => s.symbol === selectedStock)
      const currentMarketPricePreview = selected?.currentPrice || priceNum
      const expectedCashDelta = -totalAmount
      const expectedMarketValueDelta = sharesNum * currentMarketPricePreview
      console.log('[Buy][Client] 提交前:', {
        accountId: currentAccountId,
        symbol: selectedStock,
        qty: sharesNum,
        inputPrice: priceNum,
        currentMarketPrice: currentMarketPricePreview,
        expectedCashDelta,
        expectedMarketValueDelta,
        expectedEquityDelta: expectedCashDelta + expectedMarketValueDelta
      })

      // 获取认证token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setAlert({ message: '用户未登录', type: 'error' })
        return
      }

      // 创建交易记录
      const transactionResponse = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          qty: sharesNum,
          price: priceNum,
          amount: totalAmount,
          tx_type: 'buy',
          account_id: parseInt(currentAccountId),
          UUID: user.id,
          symbol: selectedStock,
        }),
      })

      if (transactionResponse.ok) {
        const transactionResult = await transactionResponse.json()
        console.log('交易记录创建成功:', transactionResult)

        // 更新持仓
        const positionResponse = await fetch('/api/positions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            symbol: selectedStock,
            account_id: parseInt(currentAccountId),
            UUID: user.id,
            qty: sharesNum,
            price: priceNum,
            tx_type: 'buy'
          }),
        })

        if (!positionResponse.ok) {
          const positionError = await positionResponse.json()
          console.error('持仓更新失败:', positionError)
          setAlert({ 
            message: `交易记录已保存，但持仓更新失败：${positionError.error}`, 
            type: 'error' 
          })
          return
        }

        // 获取当前市场价格
        const currentStock = stockData.find(stock => stock.symbol === selectedStock)
        const currentMarketPrice = currentStock?.currentPrice || priceNum
        console.log('[Buy][Client] 快照更新参数:', {
          accountId: currentAccountId,
          symbol: selectedStock,
          qty: sharesNum,
          transaction_amount: totalAmount,
          current_market_price: currentMarketPrice
        })

        // 更新账户快照
        const snapshotResponse = await fetch('/api/account-snapshots', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            account_id: parseInt(currentAccountId),
            transaction_amount: totalAmount,
            transaction_type: 'buy',
            UUID: user.id,
            symbol: selectedStock,
            qty: sharesNum,
            current_market_price: currentMarketPrice
          }),
        })

        if (snapshotResponse.ok) {
          const snapshotResult = await snapshotResponse.json()
          console.log('账户快照更新成功:', snapshotResult)
          
          setAlert({ 
            message: `成功买入 ${sharesNum} 股 ${selectedStock}，总金额：$${totalAmount.toFixed(2)}`, 
            type: 'success' 
          })
          
          // 清空输入框，仅保留占位符
            setInvestmentPercentage('')
            setSharePrice('')
            setCalculatedShares(0)
            setManualShares('')
          
          // 刷新持仓数据和用户资产
          await fetchPortfolio()
          await fetchUserEquity()
          await fetchOwnedShares()
          
          // 派发交易完成事件
          window.dispatchEvent(new CustomEvent('transactionComplete', {
            detail: {
              type: 'buy',
              symbol: selectedStock,
              qty: sharesNum,
              amount: totalAmount,
              at: new Date().toISOString()
            }
          }))
        } else {
          const snapshotError = await snapshotResponse.json()
          console.error('账户快照更新失败:', snapshotError)
          setAlert({ 
            message: `交易记录已保存，但账户快照更新失败：${snapshotError.error}`, 
            type: 'error' 
          })
        }
      } else {
        const error = await transactionResponse.json()
        console.error('交易记录创建失败:', error)
        setAlert({ message: `买入失败：${error.error}`, type: 'error' })
      }
    } catch (error) {
      console.error('买入股票失败:', error)
      setAlert({ message: '买入股票失败，请重试', type: 'error' })
    } finally {
      setBuying(false)
    }
  }

  const handleSellStock = async () => {
    try {
      setSelling(true)

      // 验证输入
      if (!sellShares || !sellPrice) {
        setAlert({ message: '请填写卖出股数和每股价格', type: 'error' })
        return
      }

      const sharesNum = parseInt(sellShares)
      const priceNum = parseFloat(sellPrice)

      if (isNaN(sharesNum) || sharesNum <= 0) {
        setAlert({ message: '卖出股数必须大于0', type: 'error' })
        return
      }

      if (isNaN(priceNum) || priceNum <= 0) {
        setAlert({ message: '每股价格必须大于0', type: 'error' })
        return
      }

      if (sharesNum > ownedShares) {
        setAlert({ message: `卖出股数不能超过持有股数 ${ownedShares}`, type: 'error' })
        return
      }

      // 获取当前用户和账号ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAlert({ message: '用户未登录', type: 'error' })
        return
      }

      // 获取当前选中的账号ID
      let currentAccountId = localStorage.getItem('currentAccountId')
      const savedJson = localStorage.getItem('currentAccount')
      if (savedJson) {
        try {
          const parsed = JSON.parse(savedJson)
          if (parsed?.id) currentAccountId = String(parsed.id)
        } catch {}
      }
      if (!currentAccountId) {
        setAlert({ message: '请先选择账户', type: 'error' })
        return
      }

      const totalAmount = sharesNum * priceNum

      // 预估市值与现金变化（卖出：现金与市值都按输入价）
      const expectedCashDelta = totalAmount
      const expectedMarketValueDelta = -totalAmount
      console.log('[Sell][Client] 提交前:', {
        accountId: currentAccountId,
        symbol: selectedStock,
        qty: sharesNum,
        inputPrice: priceNum,
        expectedCashDelta,
        expectedMarketValueDelta,
        expectedEquityDelta: expectedCashDelta + expectedMarketValueDelta
      })

      // 创建卖出交易记录
      const { data: { session } } = await supabase.auth.getSession()
      const transactionResponse = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          qty: sharesNum,
          price: priceNum,
          amount: totalAmount,
          tx_type: 'sell',
          account_id: parseInt(currentAccountId),
          UUID: user.id,
          symbol: selectedStock
        })
      })

      if (!transactionResponse.ok) {
        const transactionError = await transactionResponse.json()
        console.error('交易记录创建失败:', transactionError)
        setAlert({ 
          message: `交易记录创建失败：${transactionError.error}`, 
          type: 'error' 
        })
        return
      }

      // 先更新账户快照（在positions更新之前）
      const snapshotResponse = await fetch('/api/account-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          account_id: parseInt(currentAccountId),
          transaction_amount: totalAmount,
          transaction_type: 'sell',
          UUID: user.id,
          symbol: selectedStock,
          qty: sharesNum
        })
      })

      if (!snapshotResponse.ok) {
        const snapshotError = await snapshotResponse.json()
        console.error('账户快照更新失败:', snapshotError)
        setAlert({ 
          message: `交易记录已保存，但账户快照更新失败：${snapshotError.error}`, 
          type: 'error' 
        })
        return
      }

      // 后更新持仓
      const positionResponse = await fetch('/api/positions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          symbol: selectedStock,
          account_id: parseInt(currentAccountId),
          UUID: user.id,
          qty: sharesNum,
          price: priceNum,
          tx_type: 'sell'
        })
      })

      if (!positionResponse.ok) {
        const positionError = await positionResponse.json()
        console.error('持仓更新失败:', positionError)
        setAlert({ 
          message: `交易记录和账户快照已保存，但持仓更新失败：${positionError.error}`, 
          type: 'error' 
        })
        return
      }

      // 所有操作都成功完成
      setAlert({ 
        message: `成功卖出 ${sharesNum} 股 ${selectedStock}，总金额：$${totalAmount.toFixed(2)}`, 
        type: 'success' 
      })
      
      // 清空输入框
      setSellShares('')
      setSellPrice('')
      
      // 刷新持仓数据和用户资产
      await fetchPortfolio()
      await fetchUserEquity()
      await fetchOwnedShares()
      
      // 派发交易完成事件
      window.dispatchEvent(new CustomEvent('transactionComplete', {
        detail: {
          type: 'sell',
          symbol: selectedStock,
          qty: sharesNum,
          amount: totalAmount,
          at: new Date().toISOString()
        }
      }))
    } catch (error) {
      console.error('卖出股票失败:', error)
      setAlert({ message: '卖出失败，请重试', type: 'error' })
    } finally {
      setSelling(false)
    }
  }

  const fetchStockData = async (showLoading = false, forceRefresh = false) => {
    if (showLoading) {
      setStockLoading(true)
    }
    
    try {
      // 强制刷新：仅刷新当前选中标的，降低API压力；否则刷新两个标的
      const symbolsToFetch = forceRefresh ? [selectedStock] : ['TQQQ', 'SQQQ']
      const response = await fetch('/api/stocks/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: symbolsToFetch,
          timeRange: timeRange,
          forceRefresh: !!forceRefresh,
          refreshDailyOnly: false
        })
      })

      if (response.ok) {
        const realStockData: StockData[] = await response.json()
        if (forceRefresh && Array.isArray(realStockData) && realStockData.length === 1) {
          const incoming = realStockData[0]
          setStockData(prev => {
            const others = (prev || []).filter(s => s.symbol !== incoming.symbol)
            const merged = [...others, incoming]
            merged.sort((a, b) => (a.symbol > b.symbol ? 1 : (a.symbol < b.symbol ? -1 : 0)))
            return merged
          })
        } else {
          setStockData(realStockData)
        }
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

    // 组合图：折线(价格) + 柱(成交量)，双轴
    return {
      labels: currentStock.chartData.labels,
      datasets: [
        {
          type: 'line' as const,
          label: '收盘价',
          data: currentStock.chartData.close,
          borderColor: currentStock.change >= 0 ? '#78ae78' : '#ef4444',
          backgroundColor: currentStock.change >= 0 ? 'rgba(120, 174, 120, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: 'yPrice'
        },
        {
          type: 'bar' as const,
          label: '成交量',
          data: currentStock.chartData.volume,
          backgroundColor: 'rgba(76, 110, 245, 0.35)',
          borderColor: 'rgba(76, 110, 245, 0.8)',
          borderWidth: 1,
          yAxisID: 'yVol',
          order: 0,
          maxBarThickness: 24
        }
      ]
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
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
          label: function(context: { dataset: { label?: string; yAxisID?: string }; parsed: { y: number } }) {
            const label = context.dataset.label || ''
            const value = context.parsed.y
            if (context.dataset.yAxisID === 'yVol') return `${label}: ${value.toLocaleString()}`
            return `${label}: $${Number(value).toFixed(2)}`
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
      yPrice: {
        type: 'linear' as const,
        position: 'left' as const,
        display: true,
        title: { display: true, text: '价格 ($)' },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
        ticks: {
          callback: function(value: string | number) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value
            return '$' + Number(numValue).toFixed(2)
          }
        }
      },
      yVol: {
        type: 'linear' as const,
        position: 'right' as const,
        display: true,
        title: { display: true, text: '成交量' },
        grid: { display: false },
        ticks: {
          callback: function(value: string | number) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value
            return Number(numValue).toLocaleString()
          }
        }
      }
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
      {/* 自定义提示框 */}
      {alert && (
        <CustomAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert(null)}
        />
      )}
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
            : (currentStock.dataSource === 'yahoo' || currentStock.dataSource === 'yahoo_finance')
            ? 'bg-purple-100 text-purple-800'
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
           (currentStock.dataSource === 'yahoo' || currentStock.dataSource === 'yahoo_finance') ? 'yahoo_finance' :
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
                <Line data={chartData} options={chartOptions} />
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
          <div className="text-left">
            <p className="mb-4 text-sm" style={{color: '#768077'}}>
              我现在有 <span className="font-semibold text-gray-900">${userCash.toFixed(2)}</span> 现金，我准备投入资产总额 <input type="text" placeholder="10" value={investmentPercentage} onChange={handlePercentageChange} className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-gray-700 placeholder:text-gray-400 placeholder:italic" /> %的资金，<br/>
              每股 <input type="text" placeholder={currentStock?.currentPrice?.toFixed(2) || '0.00'} value={sharePrice} onChange={handlePriceChange} className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-gray-700 placeholder:text-gray-400 placeholder:italic" /> $，也就是 <input type="text" placeholder={(function(){
                const pct = parseFloat(investmentPercentage)
                const p = parseFloat(sharePrice || (currentStock?.currentPrice?.toFixed(2) || '0'))
                if (!isNaN(pct) && pct > 0 && pct <= 100 && p > 0 && userCash > 0) {
                  const invest = (userCash * pct) / 100
                  const sh = Math.floor(invest / p)
                  return sh > 0 ? String(sh) : '0'
                }
                return calculatedShares > 0 ? String(calculatedShares) : '0'
              })()} value={manualShares} onChange={(e) => setManualShares(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-gray-700 placeholder:text-gray-400 placeholder:italic" /> 股
            </p>
            <div className="flex justify-end">
              <button 
                onClick={handleBuyStock}
                disabled={buying}
                className="text-white font-medium py-2 px-4 rounded-md transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" 
                style={{backgroundColor: '#76b947'}}
              >
                {buying ? '处理中...' : '确认购入'}
              </button>
            </div>
          </div>
        </div>

        {/* 卖出卡片 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-left">
            <p className="mb-4 text-sm" style={{color: '#768077'}}>
              我现在拥有 <span className="font-semibold text-gray-900">{ownedShares}</span> 股，
              我想卖出 <input type="text" placeholder={ownedShares > 0 ? ownedShares.toString() : '0'} value={sellShares} onChange={(e) => setSellShares(e.target.value)} className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-gray-700 placeholder:text-gray-400 placeholder:italic" /> 股,每股 <input type="text" placeholder={currentStock?.currentPrice?.toFixed(2) || '0.00'} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-gray-700 placeholder:text-gray-400 placeholder:italic" /> $
            </p>
            <div className="flex justify-end">
              <button 
                onClick={handleSellStock}
                disabled={selling}
                className="text-white font-medium py-2 px-4 rounded-md transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" 
                style={{backgroundColor: '#f4a261'}}
              >
                {selling ? '处理中...' : '确认卖出'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
