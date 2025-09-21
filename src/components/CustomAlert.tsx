'use client'

import { useEffect } from 'react'

interface CustomAlertProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export default function CustomAlert({ message, type = 'info', onClose }: CustomAlertProps) {
  useEffect(() => {
    // 10秒后自动关闭
    const timer = setTimeout(() => {
      onClose()
    }, 10000)

    return () => clearTimeout(timer)
  }, [onClose])

  const getAlertStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-800',
          iconColor: 'text-green-400',
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )
        }
      case 'error':
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-800',
          iconColor: 'text-red-400',
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )
        }
      default:
        return {
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          textColor: 'text-blue-800',
          iconColor: 'text-blue-400',
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        }
    }
  }

  const styles = getAlertStyles()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* 提示框 */}
      <div className={`
        max-w-md w-full mx-4 p-6 rounded-lg shadow-xl border-2 pointer-events-auto
        ${styles.bgColor} ${styles.borderColor}
        transform transition-all duration-300 ease-out
        animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2
      `}>
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 内容 */}
        <div className="flex items-start space-x-3">
          {/* 图标 */}
          <div className={`flex-shrink-0 ${styles.iconColor}`}>
            {styles.icon}
          </div>
          
          {/* 消息 */}
          <div className="flex-1">
            <p className={`text-sm font-medium ${styles.textColor}`}>
              {message}
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${type === 'success' 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : type === 'error'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
