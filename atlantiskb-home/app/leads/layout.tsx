import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'Leads | Atlantis KB' }

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.className}>{children}</div>
}
