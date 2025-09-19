import { NextRequest, NextResponse } from 'next/server'

// Finnhub API配置
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

// 获取股票历史数据
async function getFinnhubData(symbol: string, startDate: string, endDate: string, resolution: string = 'D') {
  try {
    // 将日期转换为Unix时间戳
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000)
    
    const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${startTimestamp}&to=${endTimestamp}&token=${FINNHUB_API_KEY}`
    
    console.log(`Fetching Finnhub data for ${symbol} from ${startDate} to ${endDate} with resolution ${resolution}`)
    console.log(`Start timestamp: ${startTimestamp}, End timestamp: ${endTimestamp}`)
    console.log(`URL: ${url}`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`Finnhub API error: ${response.status} ${response.statusText}`)
      console.log(`Error response: ${errorText}`)
      return [] // 返回空数组而不是抛出错误
    }
    
    const data = await response.json()
    console.log(`Finnhub raw response:`, data)
    console.log(`Finnhub response status: ${data.s}`)
    console.log(`Finnhub timestamps length: ${data.t ? data.t.length : 0}`)
    
    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      console.log(`No data returned from Finnhub for ${symbol}. Status: ${data.s}, Timestamps: ${data.t ? data.t.length : 0}`)
      return []
    }
    
    // 转换数据格式
    const historicalData = data.t.map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000),
      open: data.o[index] || 0,
      high: data.h[index] || 0,
      low: data.l[index] || 0,
      close: data.c[index] || 0,
      volume: data.v[index] || 0
    })).sort((a, b) => a.date.getTime() - b.date.getTime())
    
    console.log(`Finnhub returned ${historicalData.length} data points for ${symbol}`)
    return historicalData
    
  } catch (error) {
    console.error(`Finnhub API error for ${symbol}:`, error)
    return [] // 返回空数组而不是抛出错误
  }
}

// 获取股票当前价格
async function getFinnhubQuote(symbol: string) {
  try {
    const url = `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    
    console.log(`Fetching Finnhub quote for ${symbol}`)
    console.log(`Quote URL: ${url}`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.log(`Finnhub quote API error: ${response.status} ${response.statusText}`)
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
    
    const data = await response.json()
    console.log(`Finnhub quote response:`, data)
    
    return {
      currentPrice: data.c || 0,
      change: data.d || 0,
      changePercent: data.dp || 0,
      volume: 0, // Finnhub quote不提供volume
      high: data.h || 0,
      low: data.l || 0,
      open: data.o || 0
    }
    
  } catch (error) {
    console.error(`Finnhub quote API error for ${symbol}:`, error)
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
    if (!FINNHUB_API_KEY || FINNHUB_API_KEY === '你的finnhub_api_key') {
      return NextResponse.json({ 
        error: 'Finnhub API key not configured. Please set FINNHUB_API_KEY environment variable.',
        suggestion: 'Get free API key from https://finnhub.io/'
      }, { status: 400 })
    }

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        console.log(`=== Finnhub API called for ${symbol} with timeRange: ${timeRange} ===`)
        
        // 根据时间范围确定日期范围和分辨率
        const endDate = new Date()
        const startDate = new Date()
        let resolution = 'D' // 默认日线
        
        switch (timeRange) {
          case '1m':
            startDate.setDate(startDate.getDate() - 30)
            resolution = 'D' // 日线
            break
          case '3m':
            startDate.setDate(startDate.getDate() - 90)
            resolution = 'D' // 日线
            break
          case '6m':
            startDate.setDate(startDate.getDate() - 180)
            resolution = 'D' // 日线
            break
        }
        
        // 获取历史数据
        const historical = await getFinnhubData(
          symbol, 
          startDate.toISOString().split('T')[0], 
          endDate.toISOString().split('T')[0],
          resolution
        )
        
        // 获取当前价格
        const quote = await getFinnhubQuote(symbol)
        
        // 如果没有历史数据，返回空数据
        if (!historical || historical.length === 0) {
          console.log(`No historical data available for ${symbol}`)
          return {
            symbol: symbol,
            name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 
                symbol === 'SQQQ' ? 'ProShares UltraPro Short QQQ' :
                symbol === 'AAPL' ? 'Apple Inc.' : symbol,
            currentPrice: quote.currentPrice,
            change: quote.change,
            changePercent: quote.changePercent,
            volume: quote.volume,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            dataSource: 'finnhub',
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
          filteredData = historical.slice(-26) // 26周
        }
        
        // 生成标签
        const labels = filteredData.map(item => {
          const date = new Date(item.date)
          switch (timeRange) {
            case '1m':
            case '3m':
              return `${date.getMonth() + 1}/${date.getDate()}`
            case '6m':
              return `${date.getMonth() + 1}月`
            default:
              return date.toISOString().split('T')[0]
          }
        })
        
        return {
          symbol: symbol,
          name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 
                symbol === 'SQQQ' ? 'ProShares UltraPro Short QQQ' :
                symbol === 'AAPL' ? 'Apple Inc.' : symbol,
          currentPrice: filteredData[filteredData.length - 1]?.close || quote.currentPrice,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: filteredData[filteredData.length - 1]?.volume || quote.volume,
          high: Math.max(...filteredData.map(p => p.high)),
          low: Math.min(...filteredData.map(p => p.low)),
          open: filteredData[0]?.open || quote.open,
          dataSource: 'finnhub',
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
        console.log(`Error fetching Finnhub data for ${symbol}:`, error)
        return {
          symbol: symbol,
          name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 
                symbol === 'SQQQ' ? 'ProShares UltraPro Short QQQ' :
                symbol === 'AAPL' ? 'Apple Inc.' : symbol,
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
    console.log('Error in Finnhub API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
