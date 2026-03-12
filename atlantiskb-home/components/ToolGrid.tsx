import { tools, type Tool } from '@/lib/tools.config'
import ToolCard from './ToolCard'

// Placeholder card — same height as a live card, dashed border, no interaction
function PlaceholderCard() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px dashed rgba(0,0,0,0.15)',
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

export default function ToolGrid() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '16px',
      }}
    >
      {tools.map((tool: Tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
      <PlaceholderCard />
    </div>
  )
}
