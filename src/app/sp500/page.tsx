'use client'

import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

export default function SP500Page() {
  const [loading, setLoading] = useState(true)
  const [labels, setLabels] = useState<string[]>([])
  const [close, setClose] = useState<number[]>([])
  const [dataSource, setDataSource] = useState<string>('')
  const [customIndex, setCustomIndex] = useState<(number | null)[]>([])
  // 手写离散 Y 轴刻度（低段与高段）
  const [lowTicksInput, setLowTicksInput] = useState<string>('0,10,20,30,40')
  const [highTicksInput, setHighTicksInput] = useState<string>('')
  const [lowTicks, setLowTicks] = useState<number[]>([0, 10, 20, 30, 40])
  const [highTicks, setHighTicks] = useState<number[]>([])
  const CUSTOM_BASE = 100

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/indexes/ixic')
        if (res.ok) {
          const json = await res.json()
          setLabels(json.labels || [])
          setClose(json.close || [])
          setDataSource(json.dataSource || 'yahoo_finance')
          // 如果后端返回已有 custom_index，则预填到输入框
          if (Array.isArray(json.customIndex)) {
            setCustomIndex(json.customIndex.map((v: any) => (v === null || v === undefined ? null : Number(v))))
          }
        }
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  // 根据 IXIC 数据给“高段刻度”提供默认值（整千），仅在未手写时初始化一次
  useEffect(() => {
    if (labels.length === 0 || highTicks.length > 0) return
    const ixVals = close.filter(v => typeof v === 'number') as number[]
    if (ixVals.length === 0) return
    const minIx = Math.min(...ixVals)
    const maxIx = Math.max(...ixVals)
    const upperMin = Math.floor(minIx / 1000) * 1000
    const upperMax = Math.ceil(maxIx / 1000) * 1000
    const arr: number[] = []
    for (let v = upperMin; v <= upperMax; v += 1000) arr.push(v)
    setHighTicks(arr)
    setHighTicksInput(arr.join(','))
  }, [labels, close, highTicks.length])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen" style={{ backgroundColor: '#c8e4cc' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  const latestClose = close.length > 0 ? close[close.length - 1] : 0

  // 工具函数：格式化与生成日期范围（YYYY-MM-DD）
  const formatDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().split('T')[0]
  const generateDateRange = (fromStr: string, toStr: string) => {
    const dates: string[] = []
    const from = new Date(fromStr)
    const to = new Date(toStr)
    for (let d = new Date(from.getTime()); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
      dates.push(formatDate(d))
    }
    return dates
  }

  // 生成 9/1 -> 今天 的日期数组
  const now = new Date()
  const septFirst = new Date(now.getFullYear(), 8, 1) // 8 表示九月
  // 若当前日期在 9/1 之前，则取上一年 9/1（避免空区间）
  if (now.getTime() < septFirst.getTime()) {
    septFirst.setFullYear(septFirst.getFullYear() - 1)
  }
  const allDates = generateDateRange(formatDate(septFirst), formatDate(now))

  // 将 ixic 数据按日期映射，便于对齐
  const ixicByDate: Record<string, number> = Object.fromEntries(
    labels.map((d, i) => [d, close[i]])
  ) as Record<string, number>

  // 仅显示有 IXIC 数据的日期
  const visibleDates = allDates.filter(d => typeof ixicByDate[d] === 'number')

  // 解析手写刻度
  const parseTicks = (s: string): number[] => {
    const nums = s
      .split(/[,;\s]+/)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v)) as number[]
    const sorted = [...nums].sort((a, b) => a - b)
    // 去重
    const dedup: number[] = []
    for (const v of sorted) {
      if (dedup.length === 0 || v !== dedup[dedup.length - 1]) dedup.push(v)
    }
    return dedup
  }

  const handleApplyTicks = () => {
    const low = parseTicks(lowTicksInput)
    const high = parseTicks(highTicksInput)
    if (low.length === 0) {
      alert('低段刻度不能为空')
      return
    }
    if (high.length === 0) {
      alert('高段刻度不能为空')
      return
    }
    if (low[low.length - 1] >= high[0]) {
      alert('低段最大值必须小于高段最小值')
      return
    }
    setLowTicks(low)
    setHighTicks(high)
    // 规范化输入框内容
    setLowTicksInput(low.join(','))
    setHighTicksInput(high.join(','))
  }

  // 离散断轴映射：将真实数值映射到等距索引域
  const allTicks = [...lowTicks, ...highTicks]
  const mapToDiscretePos = (y: number | null): number | null => {
    if (y === null || y === undefined || !Number.isFinite(y)) return null
    if (allTicks.length === 1) return 0
    // 找到区间 [t_i, t_{i+1}]
    let i = -1
    for (let k = 0; k < allTicks.length - 1; k++) {
      if (y >= allTicks[k] && y <= allTicks[k + 1]) { i = k; break }
    }
    if (i === -1) {
      if (y < allTicks[0]) return 0
      return allTicks.length - 1
    }
    const t0 = allTicks[i]
    const t1 = allTicks[i + 1]
    const r = t1 === t0 ? 0 : (y - t0) / (t1 - t0)
    return i + Math.max(0, Math.min(1, r))
  }

  // 输入状态：把 allDates 与 labels 对齐，生成可编辑数组
  const customByDate: Record<string, number | null> = Object.fromEntries(
    labels.map((d, i) => [d, customIndex[i] ?? null])
  ) as Record<string, number | null>

  // 渲染时：优先使用已有 custom_index，否则留空（占位符 0）
  const onChangeCustom = (date: string, value: string) => {
    // 更新 customIndex：依据 labels 下标写入
    const idx = labels.indexOf(date)
    if (idx >= 0) {
      const next = [...customIndex]
      const num = value.trim() === '' ? null : Number(value)
      next[idx] = Number.isFinite(num as number) ? (num as number) : null
      setCustomIndex(next)
    }
  }

  const handleConfirmUpdate = async () => {
    // 仅提交显示区间内且有 IXIC 的日期
    const visibleSet = new Set(visibleDates)
    const updates = labels
      .filter(d => visibleSet.has(d))
      .map((d, i) => ({ date: d, value: customIndex[labels.indexOf(d)] }))
      .filter(u => typeof u.value === 'number' && !Number.isNaN(u.value as number))
    try {
      const res = await fetch('/api/indexes/ixic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateCustomIndex', updates })
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(`更新失败: ${e.error || res.statusText}`)
        return
      }
      const r = await res.json().catch(() => ({}))
      alert(`更新成功：${r.updated ?? 0} 条`)
    } catch (e: any) {
      alert(`更新失败: ${e?.message || e}`)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">纳斯达克综合指数</h1>
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600">自 9/1 起的日收盘价</p>
              <div className="mt-1">
                <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">{dataSource || 'yahoo_finance'}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">最新收盘</div>
              <div className="text-xl font-semibold text-gray-900">${latestClose.toFixed(2)}</div>
            </div>
          </div>
        </div>
        {labels.length > 0 ? (
          <>
          {/* 手写刻度输入 */}
          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">低段刻度</span>
              <input
                className="w-56 border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="0,10,20,30,40"
                value={lowTicksInput}
                onChange={(e) => setLowTicksInput(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">高段刻度</span>
              <input
                className="w-64 border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="21000,21500,22000,22500,23000,23500"
                value={highTicksInput}
                onChange={(e) => setHighTicksInput(e.target.value)}
              />
            </div>
            <button onClick={handleApplyTicks} className="px-3 py-1 rounded text-white text-sm" style={{ backgroundColor: '#78ae78' }}>应用刻度</button>
          </div>

          <div className="h-96">
            {(() => {
              const customPts = visibleDates.map(d => {
                const v = typeof customByDate[d] === 'number' ? (customByDate[d] as number) : null
                return { x: d, y: mapToDiscretePos(v), rawY: v }
              })
              const ixicPts = visibleDates.map(d => {
                const v = ixicByDate[d]
                return { x: d, y: mapToDiscretePos(v), rawY: v }
              })
              const N = allTicks.length
              const transformedTicks = Array.from({ length: N }, (_, i) => i)

              return (
                <Line
                  data={{
                    labels: visibleDates,
                    datasets: [
                      {
                        label: '收盘价 (IXIC)',
                        data: ixicPts,
                        parsing: false,
                        borderColor: '#78ae78',
                        backgroundColor: 'rgba(120, 174, 120, 0.1)',
                        borderWidth: 3,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#78ae78',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        tension: 0.1,
                        fill: true,
                        spanGaps: true,
                      },
                      {
                        label: '自定义指数 (0-40)',
                        data: customPts,
                        parsing: false,
                        borderColor: '#4a90e2',
                        backgroundColor: 'rgba(74, 144, 226, 0.12)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#4a90e2',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        tension: 0.15,
                        spanGaps: true,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 20 } },
                      tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#78ae78',
                        borderWidth: 1,
                        callbacks: {
                          label: (ctx) => {
                            const raw = (ctx.raw as any)?.rawY
                            if (ctx.datasetIndex === 0) return `收盘价: $${Number(raw ?? ctx.parsed.y).toFixed(2)}`
                            return `自定义指数: ${Number(raw ?? ctx.parsed.y).toFixed(2)}`
                          },
                        },
                      },
                    },
                    interaction: { intersect: false, mode: 'index' },
                    scales: {
                      x: { display: true, title: { display: true, text: '时间' }, ticks: { maxTicksLimit: 8, maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(0,0,0,0.1)' } },
                      y: {
                        display: true,
                        title: { display: true, text: `Y (手写刻度)` },
                        min: 0,
                        max: Math.max(0, allTicks.length - 1),
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        afterBuildTicks: (scale: any) => {
                          scale.ticks = transformedTicks.map((v) => ({ value: v }))
                        },
                        ticks: {
                          stepSize: 1,
                          callback: (v: any) => {
                            const idx = Math.round(Number(v))
                            return allTicks[idx] !== undefined ? `${allTicks[idx]}` : ''
                          },
                        },
                      },
                    },
                  }}
                />
              )
            })()}
          </div>
          </>
        ) : (
          <div className="h-96 flex items-center justify-center text-gray-500">暂无数据</div>
        )}
      </div>

    {/* 指数表（9/1 - 今日） */}
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <div className="mb-4 pb-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">指数表（9/1 - 今日）</h2>
        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">{dataSource || 'yahoo_finance'}</span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日期</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">IXIC 指数</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">自定义指数</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visibleDates.map((d, idx) => {
              const ixic = ixicByDate[d]
              const custom = customByDate[d]
              return (
                <tr key={d} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 text-sm text-gray-900">{d}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{typeof ixic === 'number' ? ixic.toFixed(2) : ''}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">
                    <input
                      className="w-28 border border-gray-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="0"
                      value={custom ?? ''}
                      onChange={(e) => onChangeCustom(d, e.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-right">
        <button onClick={handleConfirmUpdate} className="px-4 py-2 rounded text-white" style={{ backgroundColor: '#78ae78' }}>
          确认更新
        </button>
      </div>
    </div>
    </div>
  )
}


