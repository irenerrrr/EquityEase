import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import yahooFinance from 'yahoo-finance2'

function toYyyyMmDd(d: Date) {
  return new Date(d).toISOString().split('T')[0]
}

function getDefaultStartDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const start = new Date(Date.UTC(year, 8, 1)) // September = 8
  return toYyyyMmDd(start)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate') || getDefaultStartDate()
    const endDateStr = searchParams.get('endDate') || toYyyyMmDd(new Date())
    const forceRefresh = searchParams.get('forceRefresh') === 'true'
    const reset = searchParams.get('reset') === 'true'

    // 获取 IXIC 的 symbol_id
    const { data: sym, error: symErr } = await supabase
      .from('symbols')
      .select('id, symbol')
      .eq('symbol', 'IXIC')
      .single()

    if (symErr || !sym) {
      return NextResponse.json({ error: 'IXIC symbol not found. Please insert into symbols.' }, { status: 400 })
    }

    // 如要求重置，先删除区间内已有数据
    if (reset) {
      const { error: delErr } = await supabase
        .from('daily_prices')
        .delete()
        .eq('symbol_id', sym.id)
        .gte('as_of_date', startDateStr)
        .lte('as_of_date', endDateStr)
      if (delErr) {
        console.error('[IXIC] reset delete failed:', delErr)
      } else {
        console.log(`[IXIC] reset deleted rows for symbol_id=${sym.id} between ${startDateStr} and ${endDateStr}`)
      }
    }

    // 查询已有数据
    const { data: existing, error: existErr } = await supabase
      .from('daily_prices')
      .select('as_of_date')
      .eq('symbol_id', sym.id)
      .gte('as_of_date', startDateStr)
      .lte('as_of_date', endDateStr)
      .order('as_of_date', { ascending: true })

    if (existErr) {
      console.error('[IXIC] query existing failed:', existErr)
    }

    // 如需刷新或缺失数据，则从 Yahoo 拉取
    if (forceRefresh || reset || !existing || existing.length === 0) {
      const period1 = new Date(startDateStr)
      const period2 = new Date(endDateStr)
      const hist = await yahooFinance.historical('^IXIC', { period1, period2, interval: '1d' as any })

      const rows = (hist || []).map(h => ({
        symbol_id: sym.id,
        as_of_date: toYyyyMmDd(new Date(h.date)),
        open: Number(h.open) || 0,
        high: Number(h.high) || 0,
        low: Number(h.low) || 0,
        close: Number(h.close) || 0,
        adj_close: Number((h as any).adjClose ?? h.close) || 0,
        volume: Number(h.volume) || 0,
        source: 'yahoo_finance'
      }))

      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from('daily_prices')
          .upsert(rows, { onConflict: 'symbol_id,as_of_date', ignoreDuplicates: false })
        if (upErr) {
          console.error('[IXIC] upsert failed:', upErr)
          return NextResponse.json({ error: upErr.message }, { status: 500 })
        }
      }
    }

    // 统一返回绘图数据
    const { data: series, error: seriesErr } = await supabase
      .from('daily_prices')
      .select('as_of_date, close, source, custom_index')
      .eq('symbol_id', sym.id)
      .gte('as_of_date', startDateStr)
      .lte('as_of_date', endDateStr)
      .order('as_of_date', { ascending: true })

    if (seriesErr) {
      return NextResponse.json({ error: seriesErr.message }, { status: 500 })
    }

    const labels = (series || []).map(r => r.as_of_date)
    const close = (series || []).map(r => Number(r.close) || 0)
    const customIndex = (series || []).map(r => (r as any).custom_index ?? null)
    const dataSource = (series && series[series.length - 1]?.source) || 'yahoo_finance'

    return NextResponse.json({ labels, close, customIndex, dataSource, symbol: 'IXIC', startDate: startDateStr, endDate: endDateStr })
  } catch (err) {
    console.error('[IXIC] GET error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    const hasJsonBody = contentType.includes('application/json')
    const body = hasJsonBody ? await request.json().catch(() => ({})) : {}
    if (body && body.action === 'updateCustomIndex' && Array.isArray(body.updates)) {
      // 1) 找到 IXIC 的 symbol_id
      const { data: sym, error: symErr } = await supabase
        .from('symbols')
        .select('id')
        .eq('symbol', 'IXIC')
        .single()
      if (symErr || !sym) {
        return NextResponse.json({ error: 'IXIC symbol not found' }, { status: 400 })
      }

      // 2) 组装 upsert 行
      const rows = (body.updates as Array<{ date: string; value: number | null }> )
        .filter(u => typeof u?.date === 'string' && u.date && typeof u.value === 'number' && !Number.isNaN(u.value))
        .map(u => ({ symbol_id: sym.id, as_of_date: u.date, custom_index: u.value }))

      if (rows.length === 0) {
        return NextResponse.json({ updated: 0 })
      }

      const { error: upErr } = await supabase
        .from('daily_prices')
        .upsert(rows, { onConflict: 'symbol_id,as_of_date', ignoreDuplicates: false })
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 })
      }

      return NextResponse.json({ updated: rows.length })
    }

    // 兼容：无 body 时与 GET 一致
    const url = new URL(request.url)
    return GET(new NextRequest(url))
  } catch (err) {
    console.error('[IXIC] POST error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


