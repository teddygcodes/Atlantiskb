'use client'

import { useSignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-md)',
  width: '100%',
  maxWidth: '400px',
  padding: '40px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid rgba(0,0,0,0.2)',
  borderRadius: 0,
  padding: '9px 12px',
  fontSize: '14px',
  color: 'var(--text-primary)',
  background: '#fff',
  width: '100%',
}

const btnStyle = (loading: boolean): React.CSSProperties => ({
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
})

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" fill="#d13438" rx="3" />
        <path d="M4.5 13 C2.5 11.5 2 8 3.5 5.5 C4.5 3 7 3.5 8.5 7.5 L8.5 13 Z" fill="white" />
        <path d="M19.5 13 C21.5 11.5 22 8 20.5 5.5 C19.5 3 17 3.5 15.5 7.5 L15.5 13 Z" fill="white" />
        <polygon points="12,2 10.5,12.5 13.5,12.5" fill="white" />
        <rect x="4.5" y="12.5" width="15" height="1.5" fill="white" />
        <rect x="10.5" y="14" width="3" height="9" fill="white" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        Atlantis KB
      </span>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
}

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState('')
  const [step, setStep] = useState<'password' | 'email_code'>('password')

  const loading = fetchStatus === 'fetching'

  async function finalize() {
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
    } else if (signIn.status === 'needs_client_trust') {
      // Clerk requires email code to verify this device/browser
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (factor) => factor.strategy === 'email_code',
      )
      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode()
      }
      setStep('email_code')
    } else if (signIn.status === 'needs_second_factor') {
      setLocalError(
        'Your account has MFA enrolled. To remove it: Clerk Dashboard → Users → [your user] → Security → remove the MFA method.',
      )
    } else {
      setLocalError('Sign in failed. Please try again.')
      console.error('[sign-in] unexpected status:', signIn.status, signIn)
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError('')
    try {
      const { error } = await signIn.password({
        emailAddress: email,
        password,
      })
      if (error) {
        setLocalError(error.longMessage ?? error.message ?? 'Sign in failed.')
        return
      }
      await finalize()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      console.error('[sign-in]', err)
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError('')
    try {
      await signIn.mfa.verifyEmailCode({ code })
      await finalize()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Invalid code. Please try again.')
      console.error('[sign-in] code verify', err)
    }
  }

  async function resendCode() {
    try {
      await signIn.mfa.sendEmailCode()
      setLocalError('')
    } catch (err) {
      console.error('[sign-in] resend', err)
    }
  }

  if (step === 'email_code') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <Logo />
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.2 }}>
            Verify your device
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
            A verification code was sent to {email}
          </p>
          <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="code" style={labelStyle}>Verification code</label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="one-time-code"
                autoFocus
                style={inputStyle}
              />
              {errors?.fields?.code && (
                <p style={{ fontSize: '12px', color: 'var(--accent)', margin: 0 }}>
                  {errors.fields.code.message}
                </p>
              )}
            </div>
            {localError && <p style={{ fontSize: '13px', color: 'var(--accent)', margin: 0 }}>{localError}</p>}
            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={resendCode} style={ghostBtnStyle}>
              Resend code
            </button>
            <button
              type="button"
              onClick={() => { setStep('password'); setLocalError(''); setCode('') }}
              style={ghostBtnStyle}
            >
              Start over
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Logo />
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.2 }}>
          Sign in
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
          Use your Atlantis KB account
        </p>

        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />
            {errors?.fields?.identifier && (
              <p style={{ fontSize: '12px', color: 'var(--accent)', margin: 0 }}>
                {errors.fields.identifier.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
            {errors?.fields?.password && (
              <p style={{ fontSize: '12px', color: 'var(--accent)', margin: 0 }}>
                {errors.fields.password.message}
              </p>
            )}
          </div>

          {localError && <p style={{ fontSize: '13px', color: 'var(--accent)', margin: 0 }}>{localError}</p>}

          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
