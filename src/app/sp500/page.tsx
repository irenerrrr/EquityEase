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

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/indexes/ixic')
        if (res.ok) {
          const json = await res.json()
          setLabels(json.labels || [])
          setClose(json.close || [])
          setDataSource(json.dataSource || 'yahoo_finance')
        }
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

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
          <div className="h-96">
            <Line
              data={{
                labels,
                datasets: [
                  {
                    label: '收盘价',
                    data: close,
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
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                    labels: { usePointStyle: true, padding: 20 },
                  },
                  tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#78ae78',
                    borderWidth: 1,
                    callbacks: {
                      label: (ctx) => `收盘价: $${Number(ctx.parsed.y).toFixed(2)}`,
                    },
                  },
                },
                interaction: { intersect: false, mode: 'index' },
                scales: {
                  x: {
                    display: true,
                    title: { display: true, text: '时间' },
                    ticks: { maxTicksLimit: 8, maxRotation: 45, minRotation: 0 },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                  },
                  y: {
                    display: true,
                    title: { display: true, text: '价格 ($)' },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    ticks: {
                      callback: (v) => `$${Number(v).toFixed(2)}`,
                    },
                  },
                },
              }}
            />
          </div>
        ) : (
          <div className="h-96 flex items-center justify-center text-gray-500">暂无数据</div>
        )}
      </div>
    </div>
  )
}


