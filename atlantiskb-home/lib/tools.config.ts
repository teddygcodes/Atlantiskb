export type ToolStatus = 'live' | 'coming-soon'

export interface Tool {
  id: string
  index: string
  name: string
  description: string
  tag: string
  url: string | null
  status: ToolStatus
}

export const tools: Tool[] = [
  {
    id: 'leads',
    index: '01',
    name: 'Leads',
    description:
      'Permit-driven contractor lead engine for Metro Atlanta and North Georgia. Scores, enriches, and surfaces electrical contractors ready to buy.',
    tag: 'Lead Generation',
    url: '/leads',
    status: 'live',
  },
  {
    id: 'comex',
    index: '02',
    name: 'COMEX',
    description:
      'Real-time copper and aluminum futures prices from COMEX. Historical charts, moving averages, and 30/60/90-day linear regression forecasts.',
    tag: 'Metals Pricing',
    url: '/comex',
    status: 'live',
  },
]
