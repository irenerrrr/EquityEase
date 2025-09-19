import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import yahooFinance from 'yahoo-finance2'

// 固定的symbol ID映射
const SYMBOL_ID_MAP: Record<string, number> = {
  'TQQQ': 1,
  'SQQQ': 2
}

// 初始化数据库表和数据（使用固定ID）
async function initDatabase() {
  try {
    // 使用固定ID插入symbols
    const symbolsToUpsert = [
      { id: 1, symbol: 'TQQQ', name: 'ProShares UltraPro QQQ' },
      { id: 2, symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ' }
    ]

    const { error: upsertError } = await supabase
      .from('symbols')
      .upsert(symbolsToUpsert, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })

    if (upsertError) {
      console.log('Symbols upsert error:', upsertError.message)
    } else {
      console.log('Symbols initialized with fixed IDs: TQQQ=1, SQQQ=2')
    }
  } catch (error) {
    console.log('Database initialization:', error)
  }
}

// 获取symbol_id（使用固定映射）
async function getSymbolId(symbol: string): Promise<number> {
  // 先确保数据库已初始化
  await initDatabase()
  
  // 使用固定的symbol ID映射
  const symbolId = SYMBOL_ID_MAP[symbol]
  
  if (!symbolId) {
    throw new Error(`Unsupported symbol: ${symbol}. Only TQQQ and SQQQ are supported.`)
  }
  
  // 验证symbol ID在数据库中是否存在
  const { data: existingSymbol, error } = await supabase
    .from('symbols')
    .select('id, symbol')
    .eq('id', symbolId)
    .single()

  if (error || !existingSymbol) {
    console.error(`Symbol ID ${symbolId} not found in database for ${symbol}`)
    throw new Error(`Symbol ${symbol} not properly initialized in database`)
  }
  
  if (existingSymbol.symbol !== symbol) {
    console.error(`Symbol ID ${symbolId} mismatch: expected ${symbol}, found ${existingSymbol.symbol}`)
    throw new Error(`Symbol ID mismatch for ${symbol}`)
  }
  
  console.log(`Using fixed symbol ID ${symbolId} for ${symbol}`)
  return symbolId
}

// 检查数据缺口
async function checkDataGaps(symbolId: number, lookbackDays: number = 5): Promise<string[]> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

  // 获取数据库中已有的日期
  const { data: existingDates, error } = await supabase
    .from('daily_prices')
    .select('as_of_date')
    .eq('symbol_id', symbolId)
    .gte('as_of_date', startDate.toISOString().split('T')[0])
    .lte('as_of_date', endDate.toISOString().split('T')[0])
    .order('as_of_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to check data gaps: ${error.message}`)
  }

  const existingDateSet = new Set(existingDates?.map(d => d.as_of_date) || [])
  const missingDates: string[] = []

  // 生成应该存在的所有日期（排除周末）
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay()
    // 跳过周末 (0=Sunday, 6=Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    const dateStr = d.toISOString().split('T')[0]
    if (!existingDateSet.has(dateStr)) {
      missingDates.push(dateStr)
    }
  }

  return missingDates
}

// 批量拉取Yahoo Finance数据
async function fetchYahooData(symbol: string, startDate: string, endDate: string) {
  try {
    console.log(`Fetching Yahoo data for ${symbol} from ${startDate} to ${endDate}`)
    
    const historical = await yahooFinance.historical(symbol, {
      period1: new Date(startDate),
      period2: new Date(endDate),
      interval: '1d'
    })

    console.log(`Received ${historical.length} data points for ${symbol}`)
    return historical
  } catch (error) {
    console.error(`Failed to fetch Yahoo data for ${symbol}:`, error)
    throw error
  }
}

// 批量upsert数据到daily_prices
async function upsertDailyPrices(symbolId: number, prices: Array<{
  date: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjClose?: number;
  volume?: number;
}>) {
  if (prices.length === 0) return

  const cacheData = prices.map(price => ({
    symbol_id: symbolId,
    as_of_date: new Date(price.date).toISOString().split('T')[0],
    open: price.open || 0,
    high: price.high || 0,
    low: price.low || 0,
    close: price.close || 0,
    adj_close: price.adjClose || price.close || 0,
    volume: price.volume || 0,
    source: 'yahoo_finance'
  }))

  const { error } = await supabase
    .from('daily_prices')
    .upsert(cacheData, {
      onConflict: 'symbol_id,as_of_date',
      ignoreDuplicates: false
    })

  if (error) {
    throw new Error(`Failed to upsert daily prices: ${error.message}`)
  }

  console.log(`Upserted ${cacheData.length} price records for symbol_id: ${symbolId}`)
}

// 处理单个标的的数据维护
async function maintainSymbolData(symbol: string, lookbackDays: number = 5) {
  console.log(`Starting data maintenance for ${symbol}`)
  
  try {
    // 1. 获取symbol_id
    const symbolId = await getSymbolId(symbol)
    
    // 2. 检查数据缺口
    const missingDates = await checkDataGaps(symbolId, lookbackDays)
    
    if (missingDates.length === 0) {
      console.log(`No data gaps found for ${symbol}`)
      return { symbol, status: 'up_to_date', missingDates: 0 }
    }
    
    console.log(`Found ${missingDates.length} missing dates for ${symbol}:`, missingDates)
    
    // 3. 计算拉取日期范围（包含一些缓冲）
    const startDate = new Date(Math.min(...missingDates.map(d => new Date(d).getTime())))
    const endDate = new Date()
    startDate.setDate(startDate.getDate() - 2) // 多拉2天作为缓冲
    endDate.setDate(endDate.getDate() + 1) // 包含今天
    
    // 4. 批量拉取Yahoo数据
    const historical = await fetchYahooData(symbol, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
    
    // 5. 过滤出缺失日期的数据
    const missingDateSet = new Set(missingDates)
    const relevantData = historical.filter(item => {
      const dateStr = new Date(item.date).toISOString().split('T')[0]
      return missingDateSet.has(dateStr)
    })
    
    // 6. 批量upsert
    if (relevantData.length > 0) {
      await upsertDailyPrices(symbolId, relevantData)
    }
    
    console.log(`Data maintenance completed for ${symbol}: filled ${relevantData.length} gaps`)
    return { 
      symbol, 
      status: 'updated', 
      missingDates: missingDates.length,
      filledGaps: relevantData.length
    }
    
  } catch (error) {
    console.error(`Data maintenance failed for ${symbol}:`, error)
    return { 
      symbol, 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// 强制刷新单个标的（旁路TTL，直接拉取最新数据）
async function forceRefreshSymbol(symbol: string, days: number = 30) {
  console.log(`Force refreshing ${symbol} for last ${days} days`)
  
  try {
    const symbolId = await getSymbolId(symbol)
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    // 直接拉取Yahoo数据
    const historical = await fetchYahooData(symbol, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
    
    // 批量upsert
    await upsertDailyPrices(symbolId, historical)
    
    console.log(`Force refresh completed for ${symbol}: updated ${historical.length} records`)
    return { 
      symbol, 
      status: 'force_refreshed', 
      updatedRecords: historical.length
    }
    
  } catch (error) {
    console.error(`Force refresh failed for ${symbol}:`, error)
    return { 
      symbol, 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, symbols, lookbackDays, forceRefreshDays } = await request.json()
    
    const targetSymbols = symbols || ['TQQQ', 'SQQQ']
    const days = lookbackDays || 5
    const refreshDays = forceRefreshDays || 30
    
    console.log(`Data maintenance request: action=${action}, symbols=${targetSymbols.join(',')}`)
    
    const results = []
    
    if (action === 'maintain') {
      // 常规数据维护：检查缺口并补拉
      for (const symbol of targetSymbols) {
        const result = await maintainSymbolData(symbol, days)
        results.push(result)
      }
    } else if (action === 'force_refresh') {
      // 强制刷新：旁路TTL，直接拉取最新数据
      for (const symbol of targetSymbols) {
        const result = await forceRefreshSymbol(symbol, refreshDays)
        results.push(result)
      }
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "maintain" or "force_refresh"' }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      action,
      results,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Data maintenance error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// 定时任务入口（可以被cron调用）
export async function GET() {
  try {
    console.log('Scheduled data maintenance started')
    
    const results = []
    const symbols = ['TQQQ', 'SQQQ']
    
    for (const symbol of symbols) {
      const result = await maintainSymbolData(symbol, 5)
      results.push(result)
    }
    
    return NextResponse.json({
      success: true,
      action: 'scheduled_maintenance',
      results,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Scheduled maintenance error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
