import { NextRequest, NextResponse } from 'next/server'

// 定时任务：收盘后数据维护
// 这个API可以被外部cron服务调用，比如Vercel Cron Jobs
export async function GET(request: NextRequest) {
  try {
    // 验证请求来源（可选的安全措施）
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('Scheduled data maintenance started at:', new Date().toISOString())
    
    // 调用数据维护API
    const maintenanceResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/data-maintenance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    
    if (!maintenanceResponse.ok) {
      throw new Error(`Data maintenance failed: ${maintenanceResponse.statusText}`)
    }
    
    const result = await maintenanceResponse.json()
    
    console.log('Scheduled data maintenance completed:', result)
    
    return NextResponse.json({
      success: true,
      message: 'Scheduled data maintenance completed',
      result,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Scheduled maintenance error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// 手动触发数据维护（用于测试）
export async function POST(request: NextRequest) {
  try {
    const { action = 'maintain', symbols = ['TQQQ', 'SQQQ'], lookbackDays = 5 } = await request.json()
    
    console.log(`Manual data maintenance triggered: action=${action}, symbols=${symbols.join(',')}`)
    
    const maintenanceResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/data-maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        symbols,
        lookbackDays
      })
    })
    
    if (!maintenanceResponse.ok) {
      throw new Error(`Data maintenance failed: ${maintenanceResponse.statusText}`)
    }
    
    const result = await maintenanceResponse.json()
    
    return NextResponse.json({
      success: true,
      message: 'Manual data maintenance completed',
      result,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Manual maintenance error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

