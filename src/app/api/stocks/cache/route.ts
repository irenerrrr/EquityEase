import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 保存股票数据到缓存的辅助函数
// options.savePriceCache = false 时，仅更新 daily_prices，不写入 price_cache
type StockDataRow = {
  name?: string
  currentPrice?: number
  open?: number
  high?: number
  low?: number
  volume?: number
}

async function saveToCache(
  symbol: string,
  stockData: StockDataRow,
  dataSource: string,
  options?: { savePriceCache?: boolean }
) {
  try {
    // 获取或创建股票ID
    let { data: symbolData } = await supabase
      .from('symbols')
      .select('id')
      .eq('symbol', symbol)
      .single()

    if (!symbolData) {
      const { data: newSymbol } = await supabase
        .from('symbols')
        .insert({ symbol: symbol, name: stockData.name || symbol })
        .select('id')
        .single()
      symbolData = newSymbol
    }

    if (symbolData) {
      const nowDate = new Date()
      const now = nowDate.toISOString()
      // 使用美东时间判断交易日与当日日期（美股口径）
      const etDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(nowDate) // YYYY-MM-DD
      const etWeekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short'
      }).format(nowDate) // Mon/Tue/.../Sat/Sun
      const today = etDateStr
      // 仅在交易日写入：跳过美东周末
      const isWeekend = etWeekday === 'Sat' || etWeekday === 'Sun'
      const hasVolume = Number(stockData.volume ?? 0) > 0
      
      // 检查 daily_prices 表今天是否已有数据
      const { data: existingDaily } = await supabase
        .from('daily_prices')
        .select('as_of_date, volume')
        .eq('symbol_id', symbolData.id)
        .eq('as_of_date', today)
        .single()

      // 如果是交易日且今天没有数据，则保存完整日度数据
      if (!existingDaily && !isWeekend && hasVolume) {
        const dailyData = {
          symbol_id: symbolData.id,
          as_of_date: today,
          open: stockData.open || stockData.currentPrice || 0,
          high: stockData.high || stockData.currentPrice || 0,
          low: stockData.low || stockData.currentPrice || 0,
          close: stockData.currentPrice || 0,
          adj_close: stockData.currentPrice || 0,
          volume: stockData.volume || 0,
          source: dataSource
        }

        await supabase
          .from('daily_prices')
          .insert(dailyData)

        console.log(`[Daily Prices] 保存成功: ${symbol} -> ${stockData.currentPrice} (${dataSource})`)
      } else if (existingDaily && !isWeekend && hasVolume && Number(existingDaily.volume ?? 0) === 0) {
        // 如果已存在但 volume 为0，且今天是交易日且本次有有效成交量，则做一次更新修正
        const dailyUpdate = {
          open: stockData.open || stockData.currentPrice || 0,
          high: stockData.high || stockData.currentPrice || 0,
          low: stockData.low || stockData.currentPrice || 0,
          close: stockData.currentPrice || 0,
          adj_close: stockData.currentPrice || 0,
          volume: stockData.volume || 0,
          source: dataSource
        }
        await supabase
          .from('daily_prices')
          .update(dailyUpdate)
          .eq('symbol_id', symbolData.id)
          .eq('as_of_date', today)
        console.log(`[Daily Prices] 更新当日0成交量记录为有效数据: ${symbol} (${dataSource})`)
      } else {
        console.log(`[Daily Prices] 跳过保存: isWeekend=${isWeekend}, hasVolume=${hasVolume}, existing=${!!existingDaily}`)
      }

      if (options?.savePriceCache !== false) {
        // 保存到 price_cache 表（实时价格缓存）
        const cacheData = {
          symbol_id: symbolData.id,
          as_of: now,
          price: stockData.currentPrice || 0,
          source: dataSource
        }

        console.log(`[Price Cache] 准备保存数据:`, {
          symbol,
          symbol_id: symbolData.id,
          price: stockData.currentPrice,
          source: dataSource,
          as_of: now
        })

        // 先尝试删除旧的缓存数据，然后插入新的
        await supabase
          .from('price_cache')
          .delete()
          .eq('symbol_id', symbolData.id)

        const { error: cacheError } = await supabase
          .from('price_cache')
          .insert(cacheData)

        if (cacheError) {
          console.error(`[Price Cache] 保存失败:`, cacheError)
        } else {
          console.log(`[Price Cache] 保存成功: ${symbol} -> ${stockData.currentPrice} (${dataSource})`)
        }
      } else {
        console.log(`[Price Cache] 跳过保存（仅刷新 daily_prices）: ${symbol}`)
      }
    }
  } catch (error) {
    console.error(`Failed to save ${symbol} to cache:`, error)
  }
}

// 新增：根据 chartData 将最近 N 天的日线批量 upsert 到 daily_prices（幂等覆盖）
async function upsertChartDataForLastDays(
  symbol: string,
  chartData: { labels: string[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] },
  source: string,
  days: number
) {
  try {
    let { data: symbolData } = await supabase
      .from('symbols')
      .select('id')
      .eq('symbol', symbol)
      .single()

    if (!symbolData) {
      const { data: newSymbol } = await supabase
        .from('symbols')
        .insert({ symbol, name: symbol })
        .select('id')
        .single()
      symbolData = newSymbol
    }

    if (!symbolData) return

    const len = chartData?.labels?.length || 0
    if (len === 0) return

    const start = Math.max(0, len - days)
    const rows = [] as Array<{
      symbol_id: number
      as_of_date: string
      open: number
      high: number
      low: number
      close: number
      adj_close: number
      volume: number
      source: string
    }>

    for (let i = start; i < len; i++) {
      const asOf = chartData.labels[i]
      rows.push({
        symbol_id: symbolData.id,
        as_of_date: asOf,
        open: Number(chartData.open?.[i] ?? 0),
        high: Number(chartData.high?.[i] ?? 0),
        low: Number(chartData.low?.[i] ?? 0),
        close: Number(chartData.close?.[i] ?? 0),
        adj_close: Number(chartData.close?.[i] ?? 0),
        volume: Number(chartData.volume?.[i] ?? 0),
        source
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('daily_prices')
        .upsert(rows, { onConflict: 'symbol_id,as_of_date', ignoreDuplicates: false })
      if (error) {
        console.error('[Daily Prices] 批量 upsert 失败:', error)
      } else {
        console.log(`[Daily Prices] Force refresh upsert ${rows.length} rows for ${symbol}`)
      }
    }
  } catch (e) {
    console.error('[Daily Prices] upsertChartDataForLastDays error:', e)
  }
}


export async function POST(request: NextRequest) {
  try {
    const { symbols, timeRange, forceRefresh, refreshDailyOnly } = await request.json()
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    if (!timeRange) {
      return NextResponse.json({ error: 'Time range is required' }, { status: 400 })
    }

    const stockDataPromises = symbols.map(async (symbol: string) => {
      try {
        // 首先检查缓存中是否有今天的数据
        const today = new Date().toISOString().split('T')[0]
        
        // 获取股票ID
        const { data: symbolData } = await supabase
          .from('symbols')
          .select('id')
          .eq('symbol', symbol)
          .single()

        if (symbolData) {
          if (forceRefresh) {
            console.log(`=== Force refresh requested for ${symbol}; skipping caches ===`)
          }
          if (!forceRefresh) {
            // 同步检查两个缓存系统
            const today = new Date().toISOString().split('T')[0]
            
            // 检查 daily_prices 表是否有足够的历史数据（日度数据系统）
            // 根据 timeRange 确定需要多少天的数据
            let requiredDays = 30 // 默认1个月
            if (timeRange === '3m') {
              requiredDays = 90
            } else if (timeRange === '6m') {
              requiredDays = 180
            }
            
            // 计算开始日期
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - requiredDays)
            const startDateStr = startDate.toISOString().split('T')[0]
            
            const { data: dailyPrices } = await supabase
              .from('daily_prices')
              .select('open, high, low, close, adj_close, volume, source, as_of_date')
              .eq('symbol_id', symbolData.id)
              .gte('as_of_date', startDateStr)
              .lte('as_of_date', today)
              .order('as_of_date', { ascending: true })

            // 检查 price_cache 表是否有20分钟内的缓存（实时价格系统）
            const { data: cachedPrice, error: cacheQueryError } = await supabase
              .from('price_cache')
              .select('price, source, as_of')
              .eq('symbol_id', symbolData.id)
              .gte('as_of', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 最近24小时
              .order('as_of', { ascending: false })
              .limit(1)
              .single()

            console.log(`[Cache Check] ${symbol}:`, {
              daily_prices: dailyPrices ? `${dailyPrices.length} 条历史数据` : '无数据',
              price_cache: cachedPrice ? '有数据' : '无数据',
              requiredDays,
              cacheQueryError
            })

            // 检查 price_cache 是否过期
            let priceCacheExpired = true
            if (cachedPrice) {
              const cacheTime = new Date(cachedPrice.as_of)
              const now = new Date()
              const timeDiff = now.getTime() - cacheTime.getTime()
              const twentyMinutes = 20 * 60 * 1000 // 20分钟
              priceCacheExpired = timeDiff >= twentyMinutes
              
              console.log(`[Price Cache] ${symbol}: ${Math.round(timeDiff / 1000 / 60)} 分钟前, 过期: ${priceCacheExpired})`)
            }

            // 如果 daily_prices 有足够的历史数据，使用它
            if (dailyPrices && dailyPrices.length >= Math.min(requiredDays * 0.7, 10)) { // 至少需要70%的数据或至少10条
              console.log(`=== Using daily_prices historical data for ${symbol} (${dailyPrices.length} records) ===`)
              
              // 生成标签（按所选时间范围格式化）
              const labels = dailyPrices.map(item => {
                const date = new Date(item.as_of_date)
                // 使用 YYYY-MM-DD，确保横轴标签唯一，避免同月日重复被合并
                return date.toISOString().split('T')[0]
              })

              // 将 Supabase numeric 字段统一转换为 number，避免前端图表解析为字符串
              const opens = dailyPrices.map(p => Number(p.open) || 0)
              const highs = dailyPrices.map(p => Number(p.high) || 0)
              const lows = dailyPrices.map(p => Number(p.low) || 0)
              const closes = dailyPrices.map(p => Number(p.close) || 0)
              const volumes = dailyPrices.map(p => Number(p.volume) || 0)
              const latestClose = closes[closes.length - 1] || 0
              const latestVolume = volumes[volumes.length - 1] || 0
              const latestSource = dailyPrices[dailyPrices.length - 1]?.source
              
              // 如果 price_cache 过期或没有数据，更新它
              if (!cachedPrice || priceCacheExpired) {
                console.log(`=== Updating price_cache for ${symbol} while using daily_prices data ===`)
                const stockData = {
                  currentPrice: latestClose,
                  name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ'
                }
                await saveToCache(symbol, stockData, latestSource, { savePriceCache: !refreshDailyOnly })
              }
              
              return {
                symbol: symbol,
                name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ',
                currentPrice: latestClose,
                change: 0, // 日度数据没有变化信息
                changePercent: 0,
                volume: latestVolume,
                high: Math.max(...highs),
                low: Math.min(...lows),
                open: opens[0] || latestClose,
                dataSource: latestSource || 'daily_prices',
                chartData: {
                  labels,
                  open: opens,
                  high: highs,
                  low: lows,
                  close: closes,
                  volume: volumes
                }
              }
            }

            // 图表需要历史序列：当 daily_prices 历史不足时，不返回 price_cache 的单点数据，改为走外部 API 拉取历史

            // 如果历史数据不足，继续到外部API调用
            if (!dailyPrices || dailyPrices.length < Math.min(requiredDays * 0.7, 10)) {
              console.log(`=== Historical data insufficient for ${symbol}: ${dailyPrices?.length || 0} records, need ${Math.min(requiredDays * 0.7, 10)} ===`)
            }
          }
        }

        // 当缓存不足且不是强制刷新时，优先尝试 Yahoo（日常刷新），并直接落库最近20天
        if (!forceRefresh) {
          try {
            const yResp = await fetch(`${request.nextUrl.origin}/api/stocks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: [symbol], timeRange })
            })
            if (yResp.ok) {
              const yData = await yResp.json()
              if (Array.isArray(yData) && yData.length > 0 && yData[0]?.chartData) {
                const stockData = yData[0]
                // 标准化 Yahoo 返回结构为 OHLCV
                const norm = {
                  labels: stockData.chartData.labels || [],
                  open: stockData.chartData.open || stockData.chartData.prices || [],
                  high: stockData.chartData.high || stockData.chartData.prices || [],
                  low: stockData.chartData.low || stockData.chartData.prices || [],
                  close: stockData.chartData.close || stockData.chartData.prices || [],
                  volume: stockData.chartData.volume || stockData.chartData.volumes || []
                }
                await saveToCache(symbol, stockData, 'yahoo', { savePriceCache: !refreshDailyOnly })
                await upsertChartDataForLastDays(symbol, norm, 'yahoo', 20)
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
                  chartData: norm
                }
              }
            }
          } catch (e) {
            console.log('[Stocks Cache] Yahoo-first refresh failed, will try Tiingo next', e)
          }
        }

        // 缓存中没有数据，调用外部API
        let dataSource = 'tiingo'
        let apiEndpoint = '/api/tiingo'
        
        console.log(`=== Stocks Cache: No cache found, fetching fresh data for ${symbol} from ${dataSource} (timeRange: ${timeRange}) ===`)
        
        // 尝试Tiingo API（优先）
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
                
                // 保存到缓存
                await saveToCache(symbol, stockData, 'tiingo', { savePriceCache: !refreshDailyOnly })

                // 若为强制刷新，则用最近20天 chartData 批量 upsert 覆盖数据库
                if (forceRefresh) {
                  await upsertChartDataForLastDays(symbol, stockData.chartData, 'tiingo', 20)
                }
                
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
        
        // 回退到 Yahoo Finance（用于获取历史日线，以填充 daily_prices 并绘制曲线）
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
              if (stockData && stockData.chartData && stockData.chartData.labels.length > 0) {
                console.log(`Successfully fetched ${symbol} data from Yahoo Finance: ${stockData.chartData.labels.length} data points`)
                
                // 保存到缓存（可选地跳过 price_cache）
                await saveToCache(symbol, stockData, 'yahoo', { savePriceCache: !refreshDailyOnly })

                // 若为强制刷新，则用最近20天 chartData 批量 upsert 覆盖数据库
                if (forceRefresh) {
                  await upsertChartDataForLastDays(symbol, stockData.chartData, 'yahoo', 20)
                }
                
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
        
        // 外部源失败时：回退到数据库 daily_prices
        try {
          let lookbackDays = 30
          if (timeRange === '3m') lookbackDays = 90
          else if (timeRange === '6m') lookbackDays = 180

          const endDate = new Date()
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - lookbackDays)
          const endStr = endDate.toISOString().split('T')[0]
          const startStr = startDate.toISOString().split('T')[0]

          // 确保 symbol_id 存在
          let sid = symbolData?.id
          if (!sid) {
            const { data: sidRow } = await supabase
              .from('symbols')
              .select('id')
              .eq('symbol', symbol)
              .single()
            sid = sidRow?.id
          }

          if (sid) {
            const { data: dailyRows } = await supabase
              .from('daily_prices')
              .select('open, high, low, close, volume, as_of_date, source')
              .eq('symbol_id', sid)
              .gte('as_of_date', startStr)
              .lte('as_of_date', endStr)
              .order('as_of_date', { ascending: true })

            if (dailyRows && dailyRows.length > 0) {
              const labels = dailyRows.map(r => new Date(r.as_of_date).toISOString().split('T')[0])
              const opens = dailyRows.map(r => Number(r.open) || 0)
              const highs = dailyRows.map(r => Number(r.high) || 0)
              const lows = dailyRows.map(r => Number(r.low) || 0)
              const closes = dailyRows.map(r => Number(r.close) || 0)
              const volumes = dailyRows.map(r => Number(r.volume) || 0)
              const latestClose = closes[closes.length - 1] || 0
              const latestVol = volumes[volumes.length - 1] || 0
              return {
                symbol,
                name: symbol === 'TQQQ' ? 'ProShares UltraPro QQQ' : 'ProShares UltraPro Short QQQ',
                currentPrice: latestClose,
                change: 0,
                changePercent: 0,
                volume: latestVol,
                high: Math.max(...highs),
                low: Math.min(...lows),
                open: opens[0] || latestClose,
                dataSource: 'daily_prices',
                chartData: {
                  labels,
                  open: opens,
                  high: highs,
                  low: lows,
                  close: closes,
                  volume: volumes
                }
              }
            }
          }
        } catch (dbFallbackErr) {
          console.log('[Stocks Cache] DB fallback failed', dbFallbackErr)
        }

        // 如果数据库也没有，则返回空
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