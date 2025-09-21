import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('开始初始化数据库（使用固定ID）...')
    
    // 使用固定ID插入symbols数据
    const symbolsToUpsert = [
      { id: 1, symbol: 'TQQQ', name: 'ProShares UltraPro QQQ' },
      { id: 2, symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ' },
      { id: 3, symbol: 'IXIC', name: 'NASDAQ Composite' }
    ]
    
    const { data: symbols, error: symbolsError } = await supabase
      .from('symbols')
      .upsert(symbolsToUpsert, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select()

    if (symbolsError) {
      console.log('Symbols upsert错误:', symbolsError.message)
      
      // 如果upsert失败，尝试查询现有数据
      const { data: existingSymbols, error: queryError } = await supabase
        .from('symbols')
        .select('*')
        .order('id')
      
      if (queryError) {
        console.error('查询symbols失败:', queryError)
        return NextResponse.json({
          success: false,
          error: 'Database connection failed',
          details: queryError.message
        }, { status: 500 })
      }
      
      return NextResponse.json({
        success: true,
        message: 'Symbols upsert failed, but existing data found',
        existingSymbols,
        symbolsError: symbolsError.message
      })
    }

    console.log('Symbols初始化成功（固定ID）:', symbols)
    
    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully with fixed IDs: TQQQ=1, SQQQ=2, IXIC=3',
      symbols
    })

  } catch (error) {
    console.error('数据库初始化失败:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // 查询现有数据
    const { data: symbols, error: symbolsError } = await supabase
      .from('symbols')
      .select('*')
    
    const { data: prices, error: pricesError } = await supabase
      .from('daily_prices')
      .select('*')
      .limit(5)

    return NextResponse.json({
      success: true,
      symbols: symbols || [],
      prices: prices || [],
      symbolsError: symbolsError?.message,
      pricesError: pricesError?.message
    })

  } catch (error) {
    console.error('查询数据库失败:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
