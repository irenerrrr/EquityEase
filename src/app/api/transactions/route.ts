import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 交易记录接口（基于transactions表结构）
interface Transaction {
  id?: number
  created_at?: string
  bigserial?: number
  qty: number
  price: number
  amount: number
  tx_type: 'buy' | 'sell'
  account_id: number
  UUID: string
  symbol: string
}

// 创建交易记录的输入类型
interface CreateTransactionInput {
  qty: number
  price: number
  amount: number
  tx_type: 'buy' | 'sell'
  account_id: number
  UUID: string
  symbol: string
}

// GET - 获取用户的交易记录
export async function GET(request: NextRequest) {
  try {
    // 尝试从 Authorization 头中获取 token（前端可以显式传入）
    const authHeader = request.headers.get('authorization')
    let user = null as any
    let authError = null as any
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const resp = await supabase.auth.getUser(token)
      user = resp.data.user
      authError = resp.error
    } else {
      // 兼容旧逻辑：从 cookie/session 中获取
      const resp = await supabase.auth.getUser()
      user = resp.data.user
      authError = resp.error
    }
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 从查询参数获取账号ID
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    
    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    // 获取用户的交易记录
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('UUID', user.id)
      .eq('account_id', parseInt(accountId))
      .order('created_at', { ascending: false })

    if (error) {
      console.error('获取交易记录失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('获取交易记录失败:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST - 创建新的交易记录
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

    const body: CreateTransactionInput = await request.json()
    
    // 验证必填字段
    if (!body.qty || !body.price || !body.amount || !body.tx_type || !body.account_id || !body.symbol) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 创建交易记录
    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert([
        {
          qty: body.qty,
          price: body.price,
          amount: body.amount,
          tx_type: body.tx_type,
          account_id: body.account_id,
          UUID: user.id,
          symbol: body.symbol,
        }
      ])
      .select()
      .single()

    if (error) {
      console.error('创建交易记录失败:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    console.error('创建交易记录失败:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
