import Link from 'next/link'
import { NavLink } from './NavLink'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Building2, Briefcase, Upload, Settings, Search, FileText, Home } from 'lucide-react'

export function Sidebar() {
  return (
    <aside style={{
      display: 'flex',
      flexDirection: 'column',
      width: '208px',
      flexShrink: 0,
      height: '100vh',
      borderRight: '1px solid #e5e7eb',
      background: '#ffffff',
      position: 'sticky',
      top: 0,
    }}>
      {/* Header — matches Topbar style */}
      <div style={{
        background: '#d13438',
        padding: '0 14px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexShrink: 0,
      }}>
        {/* Logo — links to home */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 0, textDecoration: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M4.5 13 C2.5 11.5 2 8 3.5 5.5 C4.5 3 7 3.5 8.5 7.5 L8.5 13 Z" />
            <path d="M19.5 13 C21.5 11.5 22 8 20.5 5.5 C19.5 3 17 3.5 15.5 7.5 L15.5 13 Z" />
            <polygon points="12,2 10.5,12.5 13.5,12.5" />
            <rect x="4.5" y="12.5" width="15" height="1.5" />
            <rect x="10.5" y="14" width="3" height="9" />
          </svg>
          <span style={{
            marginLeft: '7px',
            fontWeight: 700,
            fontSize: '13px',
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
          height: '13px',
          background: 'rgba(255,255,255,0.3)',
          margin: '0 10px',
          flexShrink: 0,
        }} />

        {/* Page label */}
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Leads
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <NavLink href="/leads/dashboard" icon={<LayoutDashboard size={15} />}>
          Dashboard
        </NavLink>
        <NavLink href="/leads/companies" icon={<Building2 size={15} />}>
          Companies
        </NavLink>
        <NavLink href="/leads/jobs" icon={<Briefcase size={15} />}>
          Jobs
        </NavLink>
        <NavLink href="/leads/permits" icon={<FileText size={15} />}>
          Permits
        </NavLink>
        <NavLink href="/leads/prospecting" icon={<Search size={15} />}>
          Prospecting
        </NavLink>
        <NavLink href="/leads/import" icon={<Upload size={15} />}>
          Import
        </NavLink>
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 14px 12px' }}>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            borderRadius: '5px',
            padding: '5px 8px',
            fontSize: '12px',
            color: '#9ca3af',
            textDecoration: 'none',
            marginBottom: '8px',
            transition: 'background 0.1s, color 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLAnchorElement).style.color = '#374151' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = '#9ca3af' }}
        >
          <Home size={13} />
          All tools
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <UserButton appearance={{ elements: { avatarBox: 'w-7 h-7' } }} />
          <Link
            href="/leads/settings"
            style={{
              borderRadius: '5px',
              padding: '5px',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLAnchorElement).style.color = '#374151' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = '#9ca3af' }}
          >
            <Settings size={15} />
          </Link>
        </div>
      </div>
    </aside>
  )
}
