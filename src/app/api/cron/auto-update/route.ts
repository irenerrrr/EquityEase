import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    console.log('Cron job triggered: Auto-update started')
    
    // 确定更新类型（基于当前时间）
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    
    // 如果是周末，执行周度更新；否则执行日常更新
    const updateType = isWeekend ? 'weekly' : 'daily'
    
    console.log(`Current time: ${now.toISOString()}, Day of week: ${dayOfWeek}, Update type: ${updateType}`)
    
    // 调用自动更新API
    const response = await fetch(`${request.nextUrl.origin}/api/auto-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateType: updateType
      }),
    })

    if (response.ok) {
      const result = await response.json()
      console.log('Cron job auto-update successful:', result)
      return NextResponse.json({ 
        success: true, 
        message: `${updateType} auto-update completed successfully.`, 
        result 
      })
    } else {
      const errorData = await response.json()
      console.error('Cron job auto-update failed:', errorData)
      return NextResponse.json({ 
        success: false, 
        message: `${updateType} auto-update failed.`, 
        error: errorData 
      }, { status: response.status })
    }
  } catch (error) {
    console.error('Cron job execution error:', error)
    return NextResponse.json({ 
      success: false, 
      message: 'Cron job execution error.', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

// 允许POST请求用于手动触发
export async function POST(request: NextRequest) {
  return GET(request)
}

