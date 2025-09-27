'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { NAV_ITEMS } from './navItems'
import { supabase } from '@/lib/supabase'

export default function MobileNavDropdown() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: '#78ae78' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6a9d6a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#78ae78'}
      >
        <svg 
          className="w-5 h-5 mr-2" 
          fill="none" 
          stroke="#eaf3ec" 
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        轻松看资产
        <svg className="w-4 h-4 ml-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="轻松看资产导航"
          className="absolute left-0 mt-2 w-56 z-50 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
          style={{ backgroundColor: '#c8e4cc', maxWidth: '90vw' }}
        >
          <div className="py-2">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href
              return (
                <button
                  key={item.name}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    router.push(item.href)
                  }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center ${active ? 'text-white' : 'text-gray-700'}`}
                  style={{ backgroundColor: active ? '#86c262' : 'transparent' }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = 'rgba(134, 194, 98, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.name}
                </button>
              )
            })}

            <div className="my-2 h-px" style={{ backgroundColor: '#86c262' }} />

            <button
              role="menuitem"
              onClick={() => { setOpen(false); router.push('/accounts') }}
              className="w-full text-left px-4 py-2 text-sm flex items-center text-gray-700"
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(134, 194, 98, 0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4 4m4-4l-4-4" />
              </svg>
              基金账号/切换
            </button>

            <button
              role="menuitem"
              onClick={async () => { setOpen(false); try { await supabase.auth.signOut() } finally { router.push('/auth') } }}
              className="w-full text-left px-4 py-2 text-sm flex items-center text-gray-700"
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(134, 194, 98, 0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


