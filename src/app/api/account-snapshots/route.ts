import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 账户快照接口
interface AccountSnapshot {
  account_id: number
  as_of_date: string
  equity: number
  market_value: number
  cash: number
  realized_pnl_to_date: number
  UUID: string
}

// 更新账户快照的输入类型
interface UpdateSnapshotInput {
  account_id: number
  transaction_amount: number
  transaction_type: 'buy' | 'sell'
  UUID: string
  symbol?: string
  qty?: number
  current_market_price?: number  // 新增：当前市场价格
}

// GET - 获取账户快照
export async function GET(request: NextRequest) {
  try {
    // 检查用户认证
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 从查询参数获取账号ID
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    
    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    // 获取最新的账户快照
    const { data: snapshot, error } = await supabase
      .from('account_snapshots_daily')
      .select('*')
      .eq('UUID', user.id)
      .eq('account_id', parseInt(accountId))
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('获取账户快照失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ snapshot })
  } catch (error) {
    console.error('获取账户快照失败:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST - 更新账户快照
export async function POST(request: NextRequest) {
  try {
    // 从请求头获取认证信息
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // 使用token创建Supabase客户端
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('认证失败:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: UpdateSnapshotInput = await request.json()
    
    // 验证必填字段
    if (!body.account_id || !body.transaction_amount || !body.transaction_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 如果是卖出交易，需要验证 symbol 和 qty
    if (body.transaction_type === 'sell' && (!body.symbol || !body.qty)) {
      return NextResponse.json({ error: 'Symbol and qty are required for sell transactions' }, { status: 400 })
    }

    // 获取最新的账户快照
    const { data: latestSnapshot, error: fetchError } = await supabase
      .from('account_snapshots_daily')
      .select('*')
      .eq('UUID', user.id)
      .eq('account_id', body.account_id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('获取最新快照失败:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // 计算新的快照数据
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    let newEquity: number
    let newCash: number
    let newMarketValue: number
    let newRealizedPnl: number

    if (latestSnapshot) {
      // 基于最新快照更新
      newCash = latestSnapshot.cash || 0
      newMarketValue = latestSnapshot.market_value || 0
      newRealizedPnl = latestSnapshot.realized_pnl_to_date || 0

      if (body.transaction_type === 'buy') {
        // 买入：减少现金，增加市值（按当前市场价格计算）
        let currentMarketPrice = 0
        
        if (body.current_market_price) {
          // 使用传递的当前市场价格
          currentMarketPrice = body.current_market_price
        } else if (body.symbol && body.qty) {
          // 如果没有传递价格，尝试从API获取
          try {
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
            const stockResponse = await fetch(`${baseUrl}/api/stocks/cache?symbol=${body.symbol}`)
            if (stockResponse.ok) {
              const stockData = await stockResponse.json()
              currentMarketPrice = stockData.price || 0
            }
          } catch (error) {
            console.error('获取当前市场价格失败:', error)
            // 如果获取失败，使用用户输入的价格作为备选
            currentMarketPrice = body.transaction_amount / body.qty
          }
        }
        
        newCash -= body.transaction_amount                    // 减少现金（按用户输入价格）
        newMarketValue += (body.qty * currentMarketPrice)    // 增加市值（按当前市场价格）
      } else if (body.transaction_type === 'sell') {
        // 卖出：需要从 positions 表获取卖出前的持仓成本
        let positionCost = 0
        
        if (body.symbol && body.qty) {
          // 获取股票ID
          const { data: symbolData } = await supabase
            .from('symbols')
            .select('id')
            .eq('symbol', body.symbol)
            .single()

          if (symbolData) {
            // 获取卖出前的持仓信息（注意：这里需要获取卖出前的状态）
            const { data: position } = await supabase
              .from('positions')
              .select('avg_cost, net_qty')
              .eq('symbol_id', symbolData.id)
              .eq('account_id', body.account_id)
              .eq('UUID', user.id)
              .single()

            if (position && position.net_qty > 0) {
              // 计算卖出部分的成本（基于卖出前的持仓）
              const sellRatio = body.qty / position.net_qty
              positionCost = sellRatio * (position.avg_cost * position.net_qty)
            }
          }
        }

        // 计算已实现盈亏
        // 卖出收入 = body.transaction_amount（用户输入价格 × 数量）
        // 持仓成本 = positionCost（从positions表获取的平均成本 × 数量）
        const realizedGain = body.transaction_amount - positionCost

        // 更新账户快照
        newCash += body.transaction_amount                    // 增加现金（按卖出收入）
        newMarketValue -= body.transaction_amount             // 减少市值（按用户输入价格）
        newRealizedPnl += realizedGain                        // 增加已实现盈亏
      }

      newEquity = newCash + newMarketValue
    } else {
      // 创建新的快照（假设初始现金为10000）
      const initialCash = 10000
      newCash = initialCash
      newMarketValue = 0
      newRealizedPnl = 0

      if (body.transaction_type === 'buy') {
        newCash -= body.transaction_amount
        newMarketValue += body.transaction_amount
      }

      newEquity = newCash + newMarketValue
    }

    // 使用upsert操作，自动处理插入或更新
    const { data: result, error: upsertError } = await supabase
      .from('account_snapshots_daily')
      .upsert([
        {
          account_id: body.account_id,
          as_of_date: today,
          equity: newEquity,
          market_value: newMarketValue,
          cash: newCash,
          realized_pnl_to_date: newRealizedPnl,
          UUID: user.id,
        }
      ], {
        onConflict: 'account_id,as_of_date'
      })
      .select()
      .single()

    if (upsertError) {
      console.error('更新账户快照失败:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log('账户快照更新成功:', result)
    return NextResponse.json({ snapshot: result }, { status: 201 })
  } catch (error) {
    console.error('更新账户快照失败:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
