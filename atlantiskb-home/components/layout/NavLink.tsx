'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface NavLinkProps {
  href: string
  icon?: ReactNode
  children: ReactNode
}

export function NavLink({ href, icon, children }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '6px 14px',
        fontSize: '13px',
        fontWeight: isActive ? 500 : 400,
        color: isActive ? '#d13438' : '#4b5563',
        background: isActive ? '#fef2f2' : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
        borderRight: isActive ? '2px solid #d13438' : '2px solid transparent',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = '#f9fafb'
          ;(e.currentTarget as HTMLAnchorElement).style.color = '#111827'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLAnchorElement).style.color = '#4b5563'
        }
      }}
    >
      {icon && (
        <span style={{ flexShrink: 0, color: isActive ? '#d13438' : '#9ca3af', display: 'flex' }}>
          {icon}
        </span>
      )}
      {children}
    </Link>
  )
}
