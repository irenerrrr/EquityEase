import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type PositionRow = {
  net_qty: number | null
  invested?: number | null
  realized_pnl?: number | null
  symbols: { symbol?: string } | null | Array<{ symbol?: string }>
}

function getServiceClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

async function createOrRefreshSnapshotForAccount(supabase: ReturnType<typeof createClient>, accountId: number, userId: string, origin: string) {
  const todayStr = new Date().toISOString().split('T')[0]

  // 获取最新快照（用于现金/已实现延续）
  const { data: latestSnapshot } = await supabase
    .from('account_snapshots_daily')
    .select('*')
    .eq('account_id', accountId)
    .eq('UUID', userId)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  let newCash = Number(latestSnapshot?.cash) || 0
  let newRealizedPnl = Number(latestSnapshot?.realized_pnl_to_date) || 0

  // 获取持仓并重算市值（基于当前价格）
  let newMarketValue = 0
  const { data: positions } = await supabase
    .from('positions')
    .select('net_qty, invested, realized_pnl, symbols(symbol)')
    .eq('account_id', accountId)
    .eq('UUID', userId)

  const adjusted = (positions || []).map((p: PositionRow) => {
    const symbol = Array.isArray(p.symbols) ? p.symbols[0]?.symbol : p.symbols?.symbol
    return { symbol: symbol || '', qty: Number(p.net_qty) || 0 }
  }).filter(p => p.symbol && p.qty > 0)

  if (adjusted.length > 0) {
    try {
      const priceResp = await fetch(`${origin}/api/stocks/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: adjusted.map(a => a.symbol), timeRange: '1d' })
      })
      if (priceResp.ok) {
        const priceList: Array<{ symbol: string; currentPrice: number }> = await priceResp.json()
        newMarketValue = adjusted.reduce((sum, a) => {
          const row = priceList.find((r) => r.symbol === a.symbol)
          const px = Number(row?.currentPrice) || 0
          return sum + a.qty * px
        }, 0)
      }
    } catch (e) {
      // 如果价格失败，保留0，稍后仍会写入快照（至少不会缺失）
      console.warn('[snapshot-daily] price fetch failed, market_value=0 fallback', e)
    }
  }

  const newEquity = newCash + newMarketValue

  // 获取前一可用快照（不强制昨天，找今天之前最近的一天）
  const { data: prevSnap } = await supabase
    .from('account_snapshots_daily')
    .select('equity, cum_factor, as_of_date')
    .eq('account_id', accountId)
    .eq('UUID', userId)
    .lt('as_of_date', todayStr)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prevEquity = Number(prevSnap?.equity) || 0
  const prevCum = Number(prevSnap?.cum_factor) || 1
  const dailyReturn = prevEquity > 0 ? (newEquity / prevEquity - 1) : 0
  const cumFactor = prevCum * (1 + dailyReturn)

  // 写入/更新今日快照
  const { error: upsertError } = await supabase
    .from('account_snapshots_daily')
    .upsert([
      {
        account_id: accountId,
        as_of_date: todayStr,
        equity: newEquity,
        market_value: newMarketValue,
        cash: newCash,
        realized_pnl_to_date: newRealizedPnl,
        daily_return: dailyReturn,
        cum_factor: cumFactor,
        UUID: userId
      }
    ], { onConflict: 'account_id,as_of_date' })

  if (upsertError) {
    throw upsertError
  }

  return { account_id: accountId, equity: newEquity, market_value: newMarketValue }
}

async function handler(request: NextRequest) {
  try {
    // 安全：可选校验CRON_SECRET
    const expectedToken = process.env.CRON_SECRET
    if (expectedToken) {
      const authHeader = request.headers.get('authorization') || ''
      if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = getServiceClient()
    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    // 获取所有账号（包含UUID用于隔离）
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, UUID')

    if (error) {
      throw error
    }

    const results: Array<{ account_id: number; equity: number; market_value: number }> = []
    for (const acc of accounts || []) {
      if (!acc?.id || !acc?.UUID) continue
      try {
        const r = await createOrRefreshSnapshotForAccount(supabase, Number(acc.id), acc.UUID as string, origin)
        results.push(r)
      } catch (e) {
        console.error('[snapshot-daily] failed for account', acc.id, e)
      }
    }

    return NextResponse.json({ success: true, processed: results.length, results, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[snapshot-daily] error', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}



