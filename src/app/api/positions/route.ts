import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 持仓更新接口
interface PositionUpdate {
  symbol: string
  account_id: number
  UUID: string
  qty: number
  price: number
  tx_type: 'buy' | 'sell'
}

// 获取股票symbol的ID
async function getSymbolId(symbol: string): Promise<number> {
  const { data: symbolData, error } = await supabase
    .from('symbols')
    .select('id')
    .eq('symbol', symbol)
    .single()

  if (error || !symbolData) {
    // 如果不存在，创建新的symbol记录
    const { data: newSymbol, error: insertError } = await supabase
      .from('symbols')
      .insert({ symbol, name: symbol })
      .select('id')
      .single()

    if (insertError || !newSymbol) {
      throw new Error(`无法创建或获取股票代码 ${symbol}`)
    }
    return newSymbol.id
  }

  return symbolData.id
}

// POST - 更新持仓
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

    const body: PositionUpdate = await request.json()
    
    // 验证必填字段
    if (!body.symbol || !body.account_id || !body.qty || !body.price || !body.tx_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 获取股票ID
    const symbolId = await getSymbolId(body.symbol)

    // 获取当前持仓
    const { data: currentPosition, error: fetchError } = await supabase
      .from('positions')
      .select('*')
      .eq('symbol_id', symbolId)
      .eq('account_id', body.account_id)
      .eq('UUID', user.id)
      .single()

    let newNetQty: number
    let newAvgCost: number
    let newInvested: number
    let newRealizedPnl: number

    if (currentPosition && !fetchError) {
      // 更新现有持仓
      const currentQty = currentPosition.net_qty || 0
      const currentInvested = currentPosition.invested || 0
      const currentRealizedPnl = currentPosition.realized_pnl || 0

      if (body.tx_type === 'buy') {
        // 买入：增加持仓
        newNetQty = currentQty + body.qty
        newInvested = currentInvested + (body.qty * body.price)
        newAvgCost = newInvested / newNetQty
        newRealizedPnl = currentRealizedPnl // 买入不影响已实现盈亏
      } else {
        // 卖出：减少持仓
        newNetQty = Math.max(0, currentQty - body.qty)
        
        if (newNetQty === 0) {
          // 全部卖出，重置投资金额和平均成本
          newInvested = 0
          newAvgCost = 0
          // 计算已实现盈亏
          const sellAmount = body.qty * body.price
          const costBasis = (body.qty / currentQty) * currentInvested
          newRealizedPnl = currentRealizedPnl + (sellAmount - costBasis)
        } else {
          // 部分卖出，按比例减少投资金额
          const sellRatio = body.qty / currentQty
          newInvested = currentInvested * (1 - sellRatio)
          newAvgCost = newInvested / newNetQty
          // 计算已实现盈亏
          const sellAmount = body.qty * body.price
          const costBasis = sellRatio * currentInvested
          newRealizedPnl = currentRealizedPnl + (sellAmount - costBasis)
        }
      }
    } else {
      // 创建新持仓（只能是买入）
      if (body.tx_type === 'sell') {
        return NextResponse.json({ error: 'Cannot sell when no position exists' }, { status: 400 })
      }
      
      newNetQty = body.qty
      newInvested = body.qty * body.price
      newAvgCost = body.price
      newRealizedPnl = 0
    }

    // 先尝试更新现有记录
    const { data: updateResult, error: updateError } = await supabase
      .from('positions')
      .update({
        net_qty: newNetQty,
        avg_cost: newAvgCost,
        invested: newInvested,
        realized_pnl: newRealizedPnl,
        updated_at: new Date().toISOString()
      })
      .eq('symbol_id', symbolId)
      .eq('account_id', body.account_id)
      .eq('UUID', user.id)
      .select()
      .single()

    let result
    let upsertError = updateError

    // 如果更新失败且是因为记录不存在，则插入新记录
    if (updateError && updateError.code === 'PGRST116') {
      const { data: insertResult, error: insertError } = await supabase
        .from('positions')
        .insert([
          {
            symbol_id: symbolId,
            account_id: body.account_id,
            UUID: user.id,
            net_qty: newNetQty,
            avg_cost: newAvgCost,
            invested: newInvested,
            realized_pnl: newRealizedPnl,
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single()
      
      result = insertResult
      upsertError = insertError
    } else {
      result = updateResult
    }

    if (upsertError) {
      console.error('更新持仓失败:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log('持仓更新成功:', result)
    return NextResponse.json({ position: result }, { status: 201 })
  } catch (error) {
    console.error('更新持仓失败:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - 获取用户持仓
export async function GET(request: NextRequest) {
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

    // 从查询参数获取账号ID
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    
    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    // 获取持仓数据，包含股票信息
    const { data: positions, error } = await supabase
      .from('positions')
      .select(`
        *,
        symbols!inner(symbol, name)
      `)
      .eq('account_id', parseInt(accountId))
      .eq('UUID', user.id)
      .gt('net_qty', 0) // 只返回有持仓的记录
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('获取持仓失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ positions: positions || [] }, { status: 200 })
  } catch (error) {
    console.error('获取持仓失败:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
