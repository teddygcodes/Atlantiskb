'use client'

import { useSignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const { error } = await signIn.password({
      identifier: email,
      password,
    })

    if (error) return

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/')
          if (url.startsWith('http')) {
            window.location.href = url
          } else {
            router.push(url)
          }
        },
      })
    }
  }

  const loading = fetchStatus === 'fetching'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-md)',
          width: '100%',
          maxWidth: '400px',
          padding: '40px',
        }}
      >
        {/* Logo + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" fill="#d13438" />
            <rect x="4" y="4" width="9" height="9" fill="white" />
            <rect x="15" y="4" width="9" height="9" fill="white" />
            <rect x="4" y="15" width="9" height="9" fill="white" />
            <rect x="15" y="15" width="9" height="9" fill="white" />
          </svg>
          <span
            style={{
              fontWeight: 700,
              fontSize: '16px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Atlantis KB
          </span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '6px',
            lineHeight: 1.2,
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
          Use your Atlantis KB account
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                border: '1px solid rgba(0,0,0,0.2)',
                borderRadius: 0,
                padding: '9px 12px',
                fontSize: '14px',
                color: 'var(--text-primary)',
                background: '#fff',
                width: '100%',
              }}
            />
            {errors?.fields?.identifier && (
              <p style={{ fontSize: '12px', color: 'var(--accent)', margin: 0 }}>
                {errors.fields.identifier.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                border: '1px solid rgba(0,0,0,0.2)',
                borderRadius: 0,
                padding: '9px 12px',
                fontSize: '14px',
                color: 'var(--text-primary)',
                background: '#fff',
                width: '100%',
              }}
            />
            {errors?.fields?.password && (
              <p style={{ fontSize: '12px', color: 'var(--accent)', margin: 0 }}>
                {errors.fields.password.message}
              </p>
            )}
          </div>

          {errors?.global && errors.global.length > 0 && (
            <p style={{ fontSize: '13px', color: 'var(--accent)', margin: 0 }}>
              {(errors.global[0] as { longMessage?: string; message?: string }).longMessage ??
                (errors.global[0] as { longMessage?: string; message?: string }).message ??
                'An error occurred. Please try again.'}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? 'var(--accent-dark)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 0,
              padding: '10px 0',
              fontSize: '14px',
              fontWeight: 600,
              width: '100%',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              fontFamily: 'inherit',
              marginTop: '4px',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
