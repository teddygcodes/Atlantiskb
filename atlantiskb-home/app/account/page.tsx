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
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="7" height="7" fill="white" />
            <rect x="10" y="1" width="7" height="7" fill="white" />
            <rect x="1" y="10" width="7" height="7" fill="white" />
            <rect x="10" y="10" width="7" height="7" fill="white" />
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
