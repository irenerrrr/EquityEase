import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'

// 输入清洗函数
function normalizeSymbols(input: unknown): string[] {
  const arr = Array.isArray(input)
    ? input
    : (typeof input === 'string' ? [input] : []);

  return [...new Set(
    arr
      .filter((s): s is string => typeof s === 'string') // 过滤 null/undefined/非字符串
      .map(s => s.trim())
      .filter(Boolean)                                   // 过滤空串
      .map(s => s.toUpperCase())
  )];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 })
    }

    // 获取股票基本信息
    const quote = await yahooFinance.quote(symbol)
    
    if (!quote) {
      return NextResponse.json({ error: 'No data found for symbol' }, { status: 404 })
    }

    // 简化：只返回当前价格，不获取历史数据
    const result = {
      symbol: quote.symbol,
      name: quote.longName || quote.shortName || symbol,
      currentPrice: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      high: quote.regularMarketDayHigh || 0,
      low: quote.regularMarketDayLow || 0,
      open: quote.regularMarketOpen || 0,
      dataSource: 'yahoo',
      chartData: {
        labels: [new Date().toLocaleDateString()],
        prices: [quote.regularMarketPrice || 0],
        volumes: [quote.regularMarketVolume || 0]
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching stock data:', error)
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { timeRange } = body
    
    if (!timeRange) {
      return NextResponse.json({ error: 'Time range is required' }, { status: 400 })
    }

    // 使用输入清洗函数
    const symbols = normalizeSymbols(body.symbols ?? body.symbol)
    
    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols' }, { status: 400 })
    }

    console.log(`Fetching data for symbols: ${symbols.join(', ')} with timeRange: ${timeRange}`)
    
    // 使用数组支持，一次性获取所有股票数据
    const quotes = await yahooFinance.quote(symbols)
    const rows = Array.isArray(quotes) ? quotes : [quotes]

    const results = rows.map(quote => {
      if (!quote) {
        return null
      }

      return {
        symbol: quote.symbol,
        name: quote.longName || quote.shortName || quote.symbol,
        currentPrice: quote.regularMarketPrice || 0,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        volume: quote.regularMarketVolume || 0,
        high: quote.regularMarketDayHigh || 0,
        low: quote.regularMarketDayLow || 0,
        open: quote.regularMarketOpen || 0,
        dataSource: 'yahoo',
        chartData: {
          labels: [new Date().toLocaleDateString()],
          prices: [quote.regularMarketPrice || 0],
          volumes: [quote.regularMarketVolume || 0]
        }
      }
    })

    const validResults = results.filter(result => result !== null)
    return NextResponse.json(validResults)
  } catch (error) {
    console.error('Error fetching stock data:', error)
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 })
  }
}