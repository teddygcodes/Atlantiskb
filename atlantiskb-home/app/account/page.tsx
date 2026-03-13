'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'

export default function AccountPage() {
  const { user, isLoaded } = useUser()

  if (!isLoaded || !user) return null

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || 'Unknown'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Topbar */}
      <header
        style={{
          width: '100%',
          height: '48px',
          background: '#d13438',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.5 13 C2.5 11.5 2 8 3.5 5.5 C4.5 3 7 3.5 8.5 7.5 L8.5 13 Z" />
            <path d="M19.5 13 C21.5 11.5 22 8 20.5 5.5 C19.5 3 17 3.5 15.5 7.5 L15.5 13 Z" />
            <polygon points="12,2 10.5,12.5 13.5,12.5" />
            <rect x="4.5" y="12.5" width="15" height="1.5" />
            <rect x="10.5" y="14" width="3" height="9" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#fff', letterSpacing: '-0.01em' }}>
            Atlantis KB
          </span>
        </Link>
        <span
          style={{
            display: 'inline-block',
            width: '1px',
            height: '16px',
            background: 'rgba(255,255,255,0.35)',
            margin: '0 12px',
          }}
        />
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>
          Account
        </span>
      </header>

      {/* Content */}
      <div style={{ maxWidth: '480px', margin: '48px auto', padding: '0 24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '32px' }}>
          Account
        </h1>

        <div style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', padding: '28px' }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</p>
          <p style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '20px' }}>{name}</p>

          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</p>
          <p style={{ fontSize: '15px', color: 'var(--text-primary)', margin: 0 }}>
            {user.emailAddresses[0]?.emailAddress}
          </p>
        </div>

        <div style={{ marginTop: '24px' }}>
          <Link href="/" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Back to tools
          </Link>
        </div>
      </div>
    </div>
  )
}
