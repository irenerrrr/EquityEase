import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 })
    }

    // 获取股票基本信息
    const quote = await yahooFinance.quote(symbol)
    
    // 获取历史数据（过去6个月）
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 6)
    
    const historical = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1mo' // 每月一个数据点
    })

    // 处理历史数据
    const chartData = {
      labels: historical.map(item => {
        const date = new Date(item.date)
        return `${date.getMonth() + 1}月`
      }),
      values: historical.map(item => item.close || 0)
    }

    // 计算变化
    const currentPrice = quote.regularMarketPrice || 0
    const previousClose = quote.regularMarketPreviousClose || 0
    const change = currentPrice - previousClose
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

    const stockData = {
      symbol: quote.symbol,
      name: quote.longName || quote.shortName || symbol,
      currentPrice: currentPrice,
      change: change,
      changePercent: changePercent,
      chartData: chartData
    }

    return NextResponse.json(stockData)
  } catch (error) {
    console.error('Error fetching stock data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stock data' }, 
      { status: 500 }
    )
  }
}

// 获取多个股票数据的API
export async function POST(request: NextRequest) {
  try {
    const { symbols, timeRange = '6m' } = await request.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        console.log(`Fetching data for ${symbol} with timeRange: ${timeRange}`)
        
        // 获取股票基本信息
        const quote = await yahooFinance.quote(symbol)
        console.log(`Quote data for ${symbol}:`, quote.symbol, quote.regularMarketPrice)
        
        // 根据时间范围获取历史数据
        const endDate = new Date()
        const startDate = new Date()
        
        // 根据时间范围设置开始日期和间隔
        let interval = '1d'
        switch (timeRange) {
          case '1d':
            startDate.setDate(startDate.getDate() - 1)
            interval = '5m' // 5分钟间隔，更稳定
            break
          case '2w':
            startDate.setDate(startDate.getDate() - 14)
            interval = '1d' // 日线间隔
            break
          case '1m':
            startDate.setMonth(startDate.getMonth() - 1)
            interval = '1d' // 日线间隔
            break
          case '3m':
            startDate.setMonth(startDate.getMonth() - 3)
            interval = '1d' // 日线间隔
            break
          case '6m':
          default:
            startDate.setMonth(startDate.getMonth() - 6)
            interval = '1wk' // 周线间隔
            break
        }
        
        console.log(`Historical data request for ${symbol}:`, {
          period1: startDate.toISOString(),
          period2: endDate.toISOString(),
          interval
        })
        
        const historical = await yahooFinance.historical(symbol, {
          period1: startDate,
          period2: endDate,
          interval: interval
        })
        
        console.log(`Historical data received for ${symbol}:`, historical.length, 'data points')

        // 处理历史数据 - 限制数据点数量以避免图表过于拥挤
        const maxDataPoints = 100 // 最多显示100个数据点
        const step = Math.max(1, Math.floor(historical.length / maxDataPoints))
        const filteredHistorical = historical.filter((_, index) => index % step === 0)
        
        const chartData = {
          labels: filteredHistorical.map(item => {
            const date = new Date(item.date)
            switch (timeRange) {
              case '1d':
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
              case '2w':
              case '1m':
                return `${date.getMonth() + 1}/${date.getDate()}`
              case '3m':
                return `${date.getMonth() + 1}/${date.getDate()}`
              case '6m':
              default:
                return `${date.getMonth() + 1}/${date.getDate()}`
            }
          }),
          open: filteredHistorical.map(item => item.open || 0),
          high: filteredHistorical.map(item => item.high || 0),
          low: filteredHistorical.map(item => item.low || 0),
          close: filteredHistorical.map(item => item.close || 0),
          volume: filteredHistorical.map(item => item.volume || 0)
        }

        // 计算变化
        const currentPrice = quote.regularMarketPrice || 0
        const previousClose = quote.regularMarketPreviousClose || 0
        const change = currentPrice - previousClose
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

        return {
          symbol: quote.symbol,
          name: quote.longName || quote.shortName || symbol,
          currentPrice: currentPrice,
          change: change,
          changePercent: changePercent,
          volume: quote.regularMarketVolume || 0,
          high: quote.regularMarketDayHigh || 0,
          low: quote.regularMarketDayLow || 0,
          open: quote.regularMarketOpen || 0,
          dataSource: 'yahoo',
          chartData: chartData
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error)
        
        // 如果API失败，返回空数据
        const emptyData = {
          symbol: symbol,
          name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ',
          currentPrice: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          high: 0,
          low: 0,
          open: 0,
          dataSource: 'error',
          chartData: {
            labels: [],
            open: [],
            high: [],
            low: [],
            close: [],
            volume: []
          }
        }
        
        console.log(`Using empty data for ${symbol}`)
        return emptyData
      }
    })

    const results = await Promise.all(stockDataPromises)
    const validResults = results.filter(result => result !== null)

    return NextResponse.json(validResults)
  } catch (error) {
    console.error('Error fetching multiple stock data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stock data' }, 
      { status: 500 }
    )
  }
}
