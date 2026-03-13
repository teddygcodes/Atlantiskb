import { auth } from '@clerk/nextjs/server'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Topbar from '@/components/Topbar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'COMEX Metals Pricing — Atlantis KB' }

function getInitials(user: Awaited<ReturnType<typeof currentUser>>): string {
  if (!user) return '?'
  const first = user.firstName?.[0] ?? ''
  const last = user.lastName?.[0] ?? ''
  if (first || last) return (first + last).toUpperCase()
  const email = user.emailAddresses[0]?.emailAddress ?? ''
  return email.slice(0, 2).toUpperCase()
}

export default async function ComexLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  const initials = getInitials(user)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar
        initials={initials}
        firstName={user?.firstName ?? ''}
        email={user?.emailAddresses[0]?.emailAddress ?? ''}
        pageLabel="COMEX"
      />
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {children}
      </main>
    </div>
  )
}
