import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import yahooFinance from 'yahoo-finance2'

// 固定的symbol ID映射
const SYMBOL_ID_MAP: Record<string, number> = {
  'TQQQ': 1,
  'SQQQ': 2
}

// 自动更新配置
const UPDATE_CONFIG = {
  symbols: ['TQQQ', 'SQQQ'],
  dailyUpdate: {
    timeRange: '1d',
    interval: '1d',  // 日常更新只更新日线数据
    lookbackDays: 1
  },
  weeklyUpdate: {
    timeRange: '6m', 
    interval: '1d',
    lookbackDays: 180
  },
  retry: {
    maxRetries: 3,
    retryDelay: 5000,
    exponentialBackoff: true
  }
}

// 获取symbol_id（使用固定映射）
async function getSymbolId(symbol: string): Promise<number> {
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
    throw new Error(`Symbol ${symbol} not properly initialized in database`)
  }
  
  if (existingSymbol.symbol !== symbol) {
    throw new Error(`Symbol ID mismatch for ${symbol}`)
  }
  
  return symbolId
}

// 检查数据缺口
async function checkDataGaps(symbolId: number, lookbackDays: number): Promise<string[]> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - lookbackDays)
  
  const { data: existingData, error } = await supabase
    .from('daily_prices')
    .select('as_of_date')
    .eq('symbol_id', symbolId)
    .gte('as_of_date', startDate.toISOString().split('T')[0])
    .lte('as_of_date', endDate.toISOString().split('T')[0])
    .order('as_of_date', { ascending: true })

  if (error) {
    console.error('Error checking data gaps:', error)
    return []
  }

  const existingDates = new Set(existingData?.map(item => item.as_of_date) || [])
  const missingDates: string[] = []
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    // 跳过周末
    if (d.getDay() !== 0 && d.getDay() !== 6 && !existingDates.has(dateStr)) {
      missingDates.push(dateStr)
    }
  }
  
  return missingDates
}

// 从Yahoo Finance获取数据
async function fetchYahooData(symbol: string, startDate: Date, endDate: Date, interval: string) {
  try {
    console.log(`Fetching ${symbol} data: ${startDate.toISOString()} to ${endDate.toISOString()}, interval: ${interval}`)
    
    const historical = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: interval as any
    })
    
    console.log(`Received ${historical.length} data points for ${symbol}`)
    return historical
  } catch (error) {
    console.error(`Yahoo Finance API error for ${symbol}:`, error)
    throw error
  }
}

// 批量插入/更新数据到数据库
async function upsertDailyPrices(symbolId: number, prices: Array<{
  date: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjClose?: number;
  volume?: number;
}>) {
  if (!prices || prices.length === 0) {
    console.log('No prices to upsert')
    return
  }

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
    console.error('Error upserting daily prices:', error)
    throw error
  }

  console.log(`Successfully upserted ${cacheData.length} records for symbol_id ${symbolId}`)
}

// 带重试的数据获取
async function fetchDataWithRetry(symbol: string, startDate: Date, endDate: Date, interval: string, maxRetries: number = 3): Promise<any[]> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchYahooData(symbol, startDate, endDate, interval)
      return data
    } catch (error) {
      lastError = error as Error
      console.log(`Attempt ${attempt} failed for ${symbol}:`, error)
      
      if (attempt < maxRetries) {
        const delay = UPDATE_CONFIG.retry.retryDelay * Math.pow(2, attempt - 1) // 指数退避
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError || new Error(`Failed to fetch data for ${symbol} after ${maxRetries} attempts`)
}

// 执行日常更新
async function performDailyUpdate() {
  console.log('Starting daily update...')
  const results = []
  
  for (const symbol of UPDATE_CONFIG.symbols) {
    try {
      console.log(`Processing daily update for ${symbol}`)
      
      const symbolId = await getSymbolId(symbol)
      
      // 检查最近1天的数据缺口
      const missingDates = await checkDataGaps(symbolId, UPDATE_CONFIG.dailyUpdate.lookbackDays)
      
      if (missingDates.length === 0) {
        console.log(`No missing data for ${symbol} in the last ${UPDATE_CONFIG.dailyUpdate.lookbackDays} days`)
        results.push({
          symbol,
          status: 'up_to_date',
          recordsUpdated: 0,
          message: 'No missing data found'
        })
        continue
      }
      
      console.log(`Found ${missingDates.length} missing dates for ${symbol}:`, missingDates)
      
      // 使用Yahoo Finance获取数据
      const startDate = new Date(Math.min(...missingDates.map(d => new Date(d).getTime())))
      const endDate = new Date(Math.max(...missingDates.map(d => new Date(d).getTime())))
      
      // 确保startDate和endDate不同
      if (startDate.getTime() === endDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1)
      }
      
      const historical = await fetchDataWithRetry(
        symbol, 
        startDate, 
        endDate, 
        UPDATE_CONFIG.dailyUpdate.interval
      )
      
      // 过滤出缺失日期的数据
      const filteredData = historical.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0]
        return missingDates.includes(itemDate)
      })
      
      if (filteredData.length > 0) {
        await upsertDailyPrices(symbolId, filteredData)
        results.push({
          symbol,
          status: 'updated',
          recordsUpdated: filteredData.length,
          message: `Updated ${filteredData.length} records`
        })
      } else {
        results.push({
          symbol,
          status: 'no_data',
          recordsUpdated: 0,
          message: 'No new data available from Yahoo Finance'
        })
      }
      
    } catch (error) {
      console.error(`Error processing daily update for ${symbol}:`, error)
      results.push({
        symbol,
        status: 'error',
        recordsUpdated: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  return results
}

// 执行周度更新
async function performWeeklyUpdate() {
  console.log('Starting weekly update...')
  const results = []
  
  for (const symbol of UPDATE_CONFIG.symbols) {
    try {
      console.log(`Processing weekly update for ${symbol}`)
      
      const symbolId = await getSymbolId(symbol)
      
      // 检查最近6个月的数据缺口
      const missingDates = await checkDataGaps(symbolId, UPDATE_CONFIG.weeklyUpdate.lookbackDays)
      
      if (missingDates.length === 0) {
        console.log(`No missing data for ${symbol} in the last ${UPDATE_CONFIG.weeklyUpdate.lookbackDays} days`)
        results.push({
          symbol,
          status: 'up_to_date',
          recordsUpdated: 0,
          message: 'No missing data found'
        })
        continue
      }
      
      console.log(`Found ${missingDates.length} missing dates for ${symbol}`)
      
      // 获取缺失日期的数据
      const startDate = new Date(Math.min(...missingDates.map(d => new Date(d).getTime())))
      const endDate = new Date(Math.max(...missingDates.map(d => new Date(d).getTime())))
      
      // 确保startDate和endDate不同
      if (startDate.getTime() === endDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1)
      }
      
      const historical = await fetchDataWithRetry(
        symbol, 
        startDate, 
        endDate, 
        UPDATE_CONFIG.weeklyUpdate.interval
      )
      
      // 过滤出缺失日期的数据
      const filteredData = historical.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0]
        return missingDates.includes(itemDate)
      })
      
      if (filteredData.length > 0) {
        await upsertDailyPrices(symbolId, filteredData)
        results.push({
          symbol,
          status: 'updated',
          recordsUpdated: filteredData.length,
          message: `Updated ${filteredData.length} records`
        })
      } else {
        results.push({
          symbol,
          status: 'no_data',
          recordsUpdated: 0,
          message: 'No new data available from Yahoo Finance'
        })
      }
      
    } catch (error) {
      console.error(`Error processing weekly update for ${symbol}:`, error)
      results.push({
        symbol,
        status: 'error',
        recordsUpdated: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  return results
}

// 主处理函数
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { updateType = 'daily' } = await request.json()
    
    console.log(`Auto-update triggered: ${updateType} update`)
    
    let results
    if (updateType === 'weekly') {
      results = await performWeeklyUpdate()
    } else {
      results = await performDailyUpdate()
    }
    
    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.status === 'updated' || r.status === 'up_to_date').length
    const totalRecords = results.reduce((sum, r) => sum + r.recordsUpdated, 0)
    
    console.log(`Auto-update completed in ${duration}ms. ${successCount}/${results.length} symbols successful. ${totalRecords} total records updated.`)
    
    return NextResponse.json({
      success: true,
      updateType,
      results,
      summary: {
        duration,
        symbolsProcessed: results.length,
        successfulSymbols: successCount,
        totalRecordsUpdated: totalRecords,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('Auto-update failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// 支持GET请求用于测试
export async function GET() {
  return NextResponse.json({
    message: 'Auto-update API is running',
    supportedUpdateTypes: ['daily', 'weekly'],
    symbols: UPDATE_CONFIG.symbols,
    timestamp: new Date().toISOString()
  })
}
