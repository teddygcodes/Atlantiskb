import { currentUser } from '@clerk/nextjs/server'
import Topbar from '@/components/Topbar'
import ToolGrid from '@/components/ToolGrid'

function getInitials(user: Awaited<ReturnType<typeof currentUser>>): string {
  if (!user) return '?'
  const first = user.firstName?.[0] ?? ''
  const last = user.lastName?.[0] ?? ''
  if (first || last) return (first + last).toUpperCase()
  const email = user.emailAddresses[0]?.emailAddress ?? ''
  return email.slice(0, 2).toUpperCase()
}

export default async function Home() {
  const user = await currentUser()
  const initials = getInitials(user)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar
        initials={initials}
        firstName={user?.firstName ?? ''}
        email={user?.emailAddresses[0]?.emailAddress ?? ''}
      />

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Page header */}
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '4px',
              lineHeight: 1.3,
            }}
          >
            All tools
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Electrical distribution · Metro Atlanta &amp; North Georgia
          </p>
        </div>

        <ToolGrid />
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        atlantiskb.com &nbsp;·&nbsp; Electrical Distribution Tools
      </footer>
    </div>
  )
}
