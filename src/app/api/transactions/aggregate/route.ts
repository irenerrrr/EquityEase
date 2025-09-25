import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type TxType = 'buy' | 'sell'

interface TransactionRow {
  created_at?: string | null
  qty: number
  price: number
  amount: number
  tx_type: TxType
  account_id: number
  UUID: string
  symbol: string
}

interface SymbolAggregate {
  symbol: string
  realizedPnL: number
  realizedToday: number
  netQty: number
  invested: number
  avgCost: number
}

function computeFromTransactions(transactions: TransactionRow[]): SymbolAggregate {
  let netQty = 0
  let invested = 0
  let avgCost = 0
  let realizedPnL = 0
  let realizedToday = 0
  const todayStr = new Date().toISOString().split('T')[0]

  for (const tx of transactions) {
    const qty = Number(tx.qty) || 0
    const price = Number(tx.price) || 0
    if (tx.tx_type === 'buy') {
      invested += qty * price
      netQty += qty
      avgCost = netQty > 0 ? invested / netQty : 0
    } else {
      const costOut = avgCost * qty
      const gain = (price - avgCost) * qty
      realizedPnL += gain
      if (tx.created_at && String(tx.created_at).startsWith(todayStr)) {
        realizedToday += gain
      }
      invested = Math.max(0, invested - costOut)
      netQty = Math.max(0, netQty - qty)
      avgCost = netQty > 0 ? invested / netQty : 0
    }
  }

  return { symbol: transactions[0]?.symbol ?? '', realizedPnL, realizedToday, netQty, invested, avgCost }
}

export async function GET(request: NextRequest) {
  try {
    // 允许从 Authorization bearer 或 cookie 中取用户
    const authHeader = request.headers.get('authorization')
    let user: { id: string } | null = null
    let authError: { message?: string } | null = null
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const resp = await supabase.auth.getUser(token)
      user = resp.data.user
      authError = resp.error
    } else {
      const resp = await supabase.auth.getUser()
      user = resp.data.user
      authError = resp.error
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    const symbolFilter = searchParams.get('symbol') || undefined

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    // 拉取该账户全部交易（可选按标的过滤），按时间升序用于成本计算
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('UUID', user.id)
      .eq('account_id', parseInt(accountId))
      .order('created_at', { ascending: true })

    if (symbolFilter) {
      query = query.eq('symbol', symbolFilter)
    }

    const { data: rows, error } = await query

    if (error) {
      console.error('[AggregateTx] 获取交易记录失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const txs: TransactionRow[] = rows || []

    // 按 symbol 分组计算
    const bySymbolMap = new Map<string, TransactionRow[]>()
    for (const tx of txs) {
      if (!bySymbolMap.has(tx.symbol)) bySymbolMap.set(tx.symbol, [])
      bySymbolMap.get(tx.symbol)!.push(tx)
    }

    const bySymbol: SymbolAggregate[] = []
    let totalRealized = 0
    let totalRealizedToday = 0

    for (const [sym, list] of bySymbolMap.entries()) {
      // 已按升序
      const agg = computeFromTransactions(list)
      agg.symbol = sym
      bySymbol.push(agg)
      totalRealized += agg.realizedPnL
      totalRealizedToday += agg.realizedToday
    }

    // 也返回便于前端快速索引的 map 形式
    const bySymbolObject = Object.fromEntries(bySymbol.map(r => [r.symbol, r.realizedPnL])) as Record<string, number>

    return NextResponse.json({
      accountId: Number(accountId),
      realizedPnLTotal: totalRealized,
      realizedToday: totalRealizedToday,
      bySymbol,
      bySymbolMap: bySymbolObject,
    })
  } catch (error) {
    console.error('[AggregateTx] 计算失败:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


