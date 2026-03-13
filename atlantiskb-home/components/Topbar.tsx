'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  initials: string
  firstName?: string
  email?: string
  pageLabel?: string
}

export default function Topbar({ initials, firstName, email, pageLabel = 'Home' }: TopbarProps) {
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
        {/* Trident logo mark + wordmark — links to home */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 0, textDecoration: 'none' }}>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
          >
            <path d="M4.5 13 C2.5 11.5 2 8 3.5 5.5 C4.5 3 7 3.5 8.5 7.5 L8.5 13 Z" />
            <path d="M19.5 13 C21.5 11.5 22 8 20.5 5.5 C19.5 3 17 3.5 15.5 7.5 L15.5 13 Z" />
            <polygon points="12,2 10.5,12.5 13.5,12.5" />
            <rect x="4.5" y="12.5" width="15" height="1.5" />
            <rect x="10.5" y="14" width="3" height="9" />
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
        </Link>

        {/* Divider */}
        <span style={{
          display: 'inline-block',
          width: '1px',
          height: '14px',
          background: 'rgba(255,255,255,0.3)',
          margin: '0 11px',
        }} />

        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>
          {pageLabel}
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
