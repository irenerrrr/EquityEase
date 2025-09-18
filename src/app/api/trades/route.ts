import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CreateTradeInput } from '@/types'

// GET - 获取所有交易记录
export async function GET() {
  try {
    // supabase 已经在顶部导入
    
    // 检查用户认证
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 获取用户的交易记录
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('trade_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trades })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST - 创建新的交易记录
export async function POST(request: NextRequest) {
  try {
    // supabase 已经在顶部导入
    
    // 检查用户认证
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateTradeInput = await request.json()
    
    // 验证必填字段
    if (!body.stock_symbol || !body.trade_type || !body.trade_date || !body.quantity || !body.price) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 创建交易记录
    const { data: trade, error } = await supabase
      .from('trades')
      .insert([
        {
          ...body,
          user_id: user.id,
          fees: body.fees || 0,
        }
      ])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
