import { NextRequest, NextResponse } from 'next/server'

type TiingoRawPrice = {
  date: string
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
  splitFactor?: number
}

type HistoricalDatum = {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Tiingo API配置
const TIINGO_API_KEY = process.env.TIINGO_API_KEY
const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily'

// 获取股票历史数据
async function getTiingoData(symbol: string, startDate: string, endDate: string, resampleFreq: string = 'daily') {
  try {
    // 使用正确的Tiingo API端点
    let url: string
    if (resampleFreq === '30min') {
      // 对于日内数据，使用intraday API
      url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}&resampleFreq=30min&token=${TIINGO_API_KEY}`
    } else {
      // 对于日线数据，使用daily API
      url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}&resampleFreq=${resampleFreq}&token=${TIINGO_API_KEY}`
    }
    
    console.log(`Fetching Tiingo data for ${symbol} from ${startDate} to ${endDate} with ${resampleFreq} frequency`)
    console.log(`URL: ${url}`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`Tiingo API error: ${response.status} ${response.statusText}`)
      console.log(`Error response: ${errorText}`)
      return [] // 返回空数组而不是抛出错误
    }
    
    const data: unknown = await response.json()
    // 仅展示尾部30条，避免日志过长
    if (Array.isArray(data)) {
      const tail = (data as TiingoRawPrice[]).slice(-30).map((item) => ({
        date: item?.date,
        open: item?.open,
        high: item?.high,
        low: item?.low,
        close: item?.close,
        volume: item?.volume,
        splitFactor: item?.splitFactor
      }))
      console.log(`Tiingo raw response (last 30 of ${data.length}):`, tail)
    } else {
      console.log(`Tiingo raw response:`, data)
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`No data returned from Tiingo for ${symbol}`)
      return []
    }
    
    // 转换数据格式
    const raw = data as TiingoRawPrice[]
    const historicalData: HistoricalDatum[] = raw.map((item) => ({
      date: new Date(item.date),
      open: item.open ?? 0,
      high: item.high ?? 0,
      low: item.low ?? 0,
      close: item.close ?? 0,
      volume: item.volume ?? 0
    })).sort((a, b) => a.date.getTime() - b.date.getTime())
    
    console.log(`Tiingo returned ${historicalData.length} data points for ${symbol}`)
    return historicalData
    
  } catch (error) {
    console.error(`Tiingo API error for ${symbol}:`, error)
    return [] // 返回空数组而不是抛出错误
  }
}

// 获取股票当前价格
async function getTiingoQuote(symbol: string) {
  try {
    const url = `${TIINGO_BASE_URL}/${symbol}?token=${TIINGO_API_KEY}`
    
    console.log(`Fetching Tiingo quote for ${symbol}`)
    console.log(`Quote URL: ${url}`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.log(`Tiingo quote API error: ${response.status} ${response.statusText}`)
      return {
        currentPrice: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: 0,
        low: 0,
        open: 0
      }
    }
    
    const data: unknown = await response.json()
    // 仅打印关键字段，避免冗长 description 干扰日志
    const quote = data as { ticker?: string; name?: string; last?: number; high?: number; low?: number; open?: number }
    console.log(`Tiingo quote response:`, {
      ticker: quote?.ticker,
      name: quote?.name,
      last: quote?.last,
      high: quote?.high,
      low: quote?.low,
      open: quote?.open
    })
    
    return {
      currentPrice: quote.last || 0,
      change: 0, // Tiingo不直接提供change，需要计算
      changePercent: 0,
      volume: 0,
      high: quote.high || 0,
      low: quote.low || 0,
      open: quote.open || 0
    }
    
  } catch (error) {
    console.error(`Tiingo quote API error for ${symbol}:`, error)
    return {
      currentPrice: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      high: 0,
      low: 0,
      open: 0
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbols, timeRange = '1d' } = await request.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    // 如果没有API key，返回错误
    if (!TIINGO_API_KEY || TIINGO_API_KEY === 'your_tiingo_api_key_here') {
      return NextResponse.json({ 
        error: 'Tiingo API key not configured. Please set TIINGO_API_KEY environment variable.',
        suggestion: 'Get free API key from https://www.tiingo.com/'
      }, { status: 400 })
    }

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        console.log(`Fetching Tiingo data for ${symbol}`)
        
        // 根据时间范围确定日期范围和频率
        const endDate = new Date()
        const startDate = new Date()
        let resampleFreq = 'daily'
        
        switch (timeRange) {
          case '1m':
            startDate.setDate(startDate.getDate() - 30)
            resampleFreq = 'daily' // 日线
            break
          case '3m':
            startDate.setDate(startDate.getDate() - 90)
            resampleFreq = 'daily' // 日线
            break
          case '6m':
            startDate.setDate(startDate.getDate() - 180)
            resampleFreq = 'daily' // 日线
            break
        }
        
        // 获取历史数据
        const historical = await getTiingoData(
          symbol, 
          startDate.toISOString().split('T')[0], 
          endDate.toISOString().split('T')[0], 
          resampleFreq
        )
        
        // 获取当前价格
        const quote = await getTiingoQuote(symbol)
        
        // 如果没有历史数据，返回空数据
        if (!historical || historical.length === 0) {
          console.log(`No historical data available for ${symbol}`)
          return {
            symbol: symbol,
            name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ',
            currentPrice: quote.currentPrice,
            change: quote.change,
            changePercent: quote.changePercent,
            volume: quote.volume,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            dataSource: 'tiingo',
            chartData: {
              labels: [],
              open: [],
              high: [],
              low: [],
              close: [],
              volume: []
            }
          }
        }
        
        // 根据时间范围过滤数据
        let filteredData = historical
        if (timeRange === '1m') {
          filteredData = historical.slice(-30)
        } else if (timeRange === '3m') {
          filteredData = historical.slice(-90)
        } else if (timeRange === '6m') {
          filteredData = historical.slice(-180) // 6个月约180个交易日
        }
        
        // 生成标签：使用 YYYY-MM-DD，确保横轴刻度稳定且唯一
        const labels = filteredData.map(item => {
          const date = new Date(item.date)
          return date.toISOString().split('T')[0]
        })
        
        return {
          symbol: symbol,
          name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ',
          currentPrice: filteredData[filteredData.length - 1]?.close || quote.currentPrice,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: filteredData[filteredData.length - 1]?.volume || quote.volume,
          high: Math.max(...filteredData.map(p => p.high)),
          low: Math.min(...filteredData.map(p => p.low)),
          open: filteredData[0]?.open || quote.open,
          dataSource: 'tiingo',
          chartData: {
            labels,
            open: filteredData.map(p => p.open),
            high: filteredData.map(p => p.high),
            low: filteredData.map(p => p.low),
            close: filteredData.map(p => p.close),
            volume: filteredData.map(p => p.volume)
          }
        }
        
      } catch (error) {
        console.log(`Error fetching Tiingo data for ${symbol}:`, error)
        return {
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
      }
    })

    const results = await Promise.all(stockDataPromises)
    return NextResponse.json({ success: true, data: results })
    
  } catch (error) {
    console.log('Error in Tiingo API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
