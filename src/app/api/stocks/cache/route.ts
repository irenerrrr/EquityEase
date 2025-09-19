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

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        // 首先尝试Tiingo API，如果失败则回退到Yahoo Finance
        let dataSource = 'tiingo'
        let apiEndpoint = '/api/tiingo'
        
        console.log(`=== Stocks Cache: Fetching fresh data for ${symbol} from ${dataSource} (timeRange: ${timeRange}) ===`)
        
        // 尝试Tiingo API
        try {
          const tiingoResponse = await fetch(`${request.nextUrl.origin}${apiEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: [symbol], timeRange })
          })
          
          if (tiingoResponse.ok) {
            const tiingoData = await tiingoResponse.json()
            if (tiingoData.success && tiingoData.data && tiingoData.data.length > 0) {
              const stockData = tiingoData.data[0]
              if (stockData.chartData && stockData.chartData.labels.length > 0) {
                console.log(`Successfully fetched ${symbol} data from Tiingo: ${stockData.chartData.labels.length} data points`)
                
                return {
                  symbol: stockData.symbol,
                  name: stockData.name,
                  currentPrice: stockData.currentPrice,
                  change: stockData.change,
                  changePercent: stockData.changePercent,
                  volume: stockData.volume,
                  high: stockData.high,
                  low: stockData.low,
                  open: stockData.open,
                  dataSource: 'tiingo',
                  chartData: stockData.chartData
                }
              }
            }
          }
        } catch (tiingoError) {
          console.log(`Tiingo API failed for ${symbol}:`, tiingoError)
        }
        
        // Tiingo失败，回退到Yahoo Finance
        console.log(`=== Falling back to Yahoo Finance for ${symbol} (timeRange: ${timeRange}) ===`)
        dataSource = 'yahoo'
        apiEndpoint = '/api/stocks'
        
        try {
          const yahooResponse = await fetch(`${request.nextUrl.origin}${apiEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: [symbol], timeRange })
          })
          
          if (yahooResponse.ok) {
            const yahooData = await yahooResponse.json()
            if (yahooData && yahooData.length > 0) {
              const stockData = yahooData[0]
              if (stockData.chartData && stockData.chartData.labels.length > 0) {
                console.log(`Successfully fetched ${symbol} data from Yahoo Finance: ${stockData.chartData.labels.length} data points`)
                
                return {
                  symbol: stockData.symbol,
                  name: stockData.name,
                  currentPrice: stockData.currentPrice,
                  change: stockData.change,
                  changePercent: stockData.changePercent,
                  volume: stockData.volume,
                  high: stockData.high,
                  low: stockData.low,
                  open: stockData.open,
                  dataSource: 'yahoo',
                  chartData: stockData.chartData
                }
              }
            }
          }
        } catch (yahooError) {
          console.log(`Yahoo Finance API also failed for ${symbol}:`, yahooError)
        }
        
        // 如果没有数据，返回空数据
        return {
          symbol,
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
        
      } catch (error) {
        console.log(`Error fetching data for ${symbol}:`, error)
        return {
          symbol,
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
    return NextResponse.json(results)
    
  } catch (error) {
    console.log('Error in stocks cache API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}