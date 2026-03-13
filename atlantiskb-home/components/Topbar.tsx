'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  initials: string
  firstName?: string
  email?: string
}

export default function Topbar({ initials, firstName, email }: TopbarProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { signOut } = useClerk()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <header style={{
      width: '100%',
      height: '48px',
      background: '#d13438',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Left: logo mark + wordmark + divider + page label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* 2×2 grid logo mark */}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, opacity: 0.95 }}
        >
          <rect x="0" y="0" width="7" height="7" rx="1" fill="white" />
          <rect x="9" y="0" width="7" height="7" rx="1" fill="white" />
          <rect x="0" y="9" width="7" height="7" rx="1" fill="white" />
          <rect x="9" y="9" width="7" height="7" rx="1" fill="white" />
        </svg>

        <span style={{
          marginLeft: '7px',
          fontWeight: 700,
          fontSize: '14px',
          color: '#ffffff',
          letterSpacing: '0.01em',
          lineHeight: 1,
        }}>
          Atlantis KB
        </span>

        {/* Divider */}
        <span style={{
          display: 'inline-block',
          width: '1px',
          height: '14px',
          background: 'rgba(255,255,255,0.3)',
          margin: '0 11px',
        }} />

        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>
          Home
        </span>
      </div>

      {/* Right: avatar + dropdown */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(v => !v)}
          title="Account menu"
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.5)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.03em',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
          onMouseLeave={e => (e.currentTarget.style.background = open ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)')}
        >
          {initials}
        </button>

        {/* Dropdown */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          width: '220px',
          background: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}>
          {/* User info */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f0f0f0' }}>
            {firstName && (
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#111', lineHeight: 1.3 }}>
                {firstName}
              </p>
            )}
            {email && (
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#888', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </p>
            )}
          </div>

          {/* Menu items */}
          <div style={{ padding: '4px 0' }}>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                padding: '8px 14px',
                fontSize: '13px',
                color: '#222',
                textDecoration: 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f7')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              Account settings
            </Link>

            <button
              onClick={() => signOut(() => router.push('/sign-in'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                width: '100%',
                padding: '8px 14px',
                fontSize: '13px',
                color: '#c0392b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
