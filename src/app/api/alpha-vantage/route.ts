import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { symbols, timeRange } = await request.json()
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    if (!timeRange) {
      return NextResponse.json({ error: 'Time range is required' }, { status: 400 })
    }

    const API_KEY = process.env.ALPHA_VANTAGE_API_KEY
    
    if (!API_KEY) {
      return NextResponse.json({ error: 'Alpha Vantage API key not configured' }, { status: 500 })
    }

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        console.log(`Fetching ${symbol} data from Alpha Vantage (timeRange: ${timeRange})`)
        
        // 获取当前价格
        const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`
        const quoteResponse = await fetch(quoteUrl)
        
        if (!quoteResponse.ok) {
          console.log(`Alpha Vantage quote API failed for ${symbol}`)
          return null
        }
        
        const quoteData = await quoteResponse.json()
        
        if (quoteData['Error Message']) {
          console.log(`Alpha Vantage error for ${symbol}:`, quoteData['Error Message'])
          return null
        }
        
        const quote = quoteData['Global Quote']
        if (!quote) {
          console.log(`No quote data for ${symbol}`)
          return null
        }

        const currentPrice = parseFloat(quote['05. price']) || 0
        const change = parseFloat(quote['09. change']) || 0
        const changePercent = parseFloat(quote['10. change percent'].replace('%', '')) || 0
        const volume = parseInt(quote['06. volume']) || 0
        const high = parseFloat(quote['03. high']) || 0
        const low = parseFloat(quote['04. low']) || 0
        const open = parseFloat(quote['02. open']) || 0

        // 获取历史数据
        type HistoricalDatum = { date: string; close: number; volume: number }
        let historicalData: HistoricalDatum[] = []
        try {
          const historicalUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}`
          const historicalResponse = await fetch(historicalUrl)
          
          if (historicalResponse.ok) {
            const historicalJson = await historicalResponse.json()
            
            if (historicalJson['Error Message']) {
              console.log(`Alpha Vantage historical error for ${symbol}:`, historicalJson['Error Message'])
            } else if (historicalJson['Time Series (Daily)']) {
              const timeSeries = historicalJson['Time Series (Daily)']
              const dates = Object.keys(timeSeries).sort()
              
              // 根据时间范围过滤数据
              let filteredDates = dates
              const endDate = new Date()
              const startDate = new Date()
              
              switch (timeRange) {
                case '1d':
                  startDate.setDate(startDate.getDate() - 1)
                  break
                case '2w':
                  startDate.setDate(startDate.getDate() - 14)
                  break
                case '1m':
                  startDate.setMonth(startDate.getMonth() - 1)
                  break
                case '3m':
                  startDate.setMonth(startDate.getMonth() - 3)
                  break
                case '6m':
                default:
                  startDate.setMonth(startDate.getMonth() - 6)
                  break
              }
              
              filteredDates = dates.filter(date => {
                const dateObj = new Date(date)
                return dateObj >= startDate && dateObj <= endDate
              })
              
              historicalData = filteredDates.map((date): HistoricalDatum => ({
                date,
                close: parseFloat(timeSeries[date]['4. close']) || 0,
                volume: parseInt(timeSeries[date]['5. volume']) || 0
              }))
            }
          }
        } catch (historicalError) {
          console.log(`Failed to get historical data for ${symbol}:`, historicalError)
        }

        // 构建图表数据
        const chartData = {
          labels: historicalData.length > 0 
            ? historicalData.map(item => {
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
              })
            : [new Date().toLocaleDateString()],
          prices: historicalData.length > 0 
            ? historicalData.map(item => item.close)
            : [currentPrice],
          volumes: historicalData.length > 0 
            ? historicalData.map(item => item.volume)
            : [volume]
        }

        return {
          symbol: symbol,
          name: symbol, // Alpha Vantage 不提供公司名称
          currentPrice: currentPrice,
          change: change,
          changePercent: changePercent,
          volume: volume,
          high: high,
          low: low,
          open: open,
          dataSource: 'alpha_vantage',
          chartData: chartData
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error)
        return null
      }
    })

    const results = await Promise.all(stockDataPromises)
    const validResults = results.filter(result => result !== null)

    return NextResponse.json({
      success: true,
      data: validResults
    })
  } catch (error) {
    console.error('Error fetching stock data from Alpha Vantage:', error)
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 })
  }
}
