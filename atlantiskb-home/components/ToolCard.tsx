'use client'

import { useState } from 'react'
import type { Tool } from '@/lib/tools.config'

interface ToolCardProps {
  tool: Tool
}

export default function ToolCard({ tool }: ToolCardProps) {
  const [hovered, setHovered] = useState(false)

  if (tool.status === 'coming-soon') {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1.5px dashed rgba(0,0,0,0.15)',
          padding: '24px',
          minHeight: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>More coming soon</span>
      </div>
    )
  }

  return (
    <div
      onClick={() => tool.url && window.open(tool.url, '_blank', 'noopener,noreferrer')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        borderTop: '3px solid #d13438',
        padding: '20px 20px 16px',
        minHeight: '180px',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Top row: index + Live badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tool.index}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--live)',
            background: 'var(--live-bg)',
            padding: '2px 7px',
            letterSpacing: '0.03em',
          }}
        >
          Live
        </span>
      </div>

      {/* Tool name */}
      <p
        style={{
          fontSize: '17px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
          lineHeight: 1.2,
        }}
      >
        {tool.name}
      </p>

      {/* Description */}
      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: 0,
          flex: 1,
        }}
      >
        {tool.description}
      </p>

      {/* Bottom row: tag + open arrow */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
          {tool.tag}
        </span>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--accent)',
            fontWeight: 600,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          Open ↗
        </span>
      </div>
    </div>
  )
}
