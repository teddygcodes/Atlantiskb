'use client'

interface TopbarProps {
  initials: string
}

export default function Topbar({ initials }: TopbarProps) {
  return (
    <header
      style={{
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
      }}
    >
      {/* Left: icon + brand + divider + nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        {/* 2×2 grid icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect x="1" y="1" width="7" height="7" fill="white" />
          <rect x="10" y="1" width="7" height="7" fill="white" />
          <rect x="1" y="10" width="7" height="7" fill="white" />
          <rect x="10" y="10" width="7" height="7" fill="white" />
        </svg>

        <span
          style={{
            marginLeft: '8px',
            fontWeight: 700,
            fontSize: '14px',
            color: '#ffffff',
            letterSpacing: '-0.01em',
          }}
        >
          Atlantis KB
        </span>

        {/* Divider */}
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
          Home
        </span>
      </div>

      {/* Right: avatar */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#ffffff',
          color: '#d13438',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {initials}
      </div>
    </header>
  )
}
