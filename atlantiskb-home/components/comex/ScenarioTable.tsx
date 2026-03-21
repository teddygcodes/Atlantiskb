'use client'

import type { ScenarioData, Range } from '@/lib/comex/types'

// Re-export for consumers
export type { ScenarioData } from '@/lib/comex/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScenarioTableProps {
  scenario: ScenarioData
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRange(range: Range): string {
  return `$${range.low.toFixed(2)}–${range.high.toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function sentimentBadgeColor(sentiment: ScenarioData['newsSentiment']): string {
  switch (sentiment) {
    case 'bullish':
      return '#16a34a'
    case 'bearish':
      return '#dc2626'
    case 'mixed':
      return '#d97706'
    default:
      return '#6b7280'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScenarioTable({ scenario }: ScenarioTableProps) {
  const { metal, currentPrice, asOfDate, scenarios, keyLevels, technicalBias, newsSentiment, summary } = scenario

  const metalLabel = metal.charAt(0).toUpperCase() + metal.slice(1)
  const dateLabel = formatDate(asOfDate)

  return (
    <div className="text-sm font-mono">
      {/* Header */}
      <div className="mb-3">
        <div className="text-base font-semibold font-sans">
          {metalLabel} scenario outlook ({dateLabel})
        </div>
        <div className="text-xs text-gray-500 mt-1 font-sans">
          Current:{' '}
          <span className="font-medium text-gray-700">${currentPrice.toFixed(2)}/lb</span>
          {' | '}
          Technical bias:{' '}
          <span className="font-medium text-gray-700">{technicalBias}</span>
          {' | '}
          News:{' '}
          <span
            className="font-medium"
            style={{ color: sentimentBadgeColor(newsSentiment) }}
          >
            {newsSentiment}
          </span>
        </div>
      </div>

      {/* Scenario grid */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left pr-4 py-1 text-gray-400 font-normal w-16" />
              <th className="text-right px-4 py-1 text-gray-400 font-normal">1 week</th>
              <th className="text-right px-4 py-1 text-gray-400 font-normal">30 day</th>
              <th className="text-right px-4 py-1 text-gray-400 font-normal">90 day</th>
            </tr>
          </thead>
          <tbody>
            {/* Bull */}
            <tr className="border-b border-gray-100">
              <td className="pr-4 py-1.5 text-green-600 font-semibold">Bull:</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bull['1week'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bull['30day'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bull['90day'])}</td>
            </tr>
            {/* Base */}
            <tr className="border-b border-gray-100">
              <td className="pr-4 py-1.5 text-blue-600 font-semibold">Base:</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.base['1week'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.base['30day'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.base['90day'])}</td>
            </tr>
            {/* Bear */}
            <tr>
              <td className="pr-4 py-1.5 text-red-600 font-semibold">Bear:</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bear['1week'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bear['30day'])}</td>
              <td className="text-right px-4 py-1.5 tabular-nums">{formatRange(scenarios.bear['90day'])}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Key levels */}
      <div className="mt-3 text-xs text-gray-600">
        Key levels:{' '}
        <span className="text-green-600">
          Support ${keyLevels.support.toFixed(2)} / ${keyLevels.strongSupport.toFixed(2)}
        </span>
        {' | '}
        <span className="text-red-600">
          Resistance ${keyLevels.resistance.toFixed(2)} / ${keyLevels.strongResistance.toFixed(2)}
        </span>
      </div>

      {/* Catalysts */}
      <div className="mt-3 space-y-1 text-xs text-gray-600">
        <div>
          <span className="text-green-600 font-semibold">Bull catalyst:</span>{' '}
          {scenarios.bull.catalyst}
        </div>
        <div>
          <span className="text-red-600 font-semibold">Bear catalyst:</span>{' '}
          {scenarios.bear.catalyst}
        </div>
      </div>

      {/* AI summary */}
      <div className="mt-3 text-xs text-gray-700 font-sans leading-relaxed">
        {summary}
      </div>

      {/* Disclaimer */}
      <div className="mt-3 text-xs text-gray-400 italic font-sans">
        *Not financial or purchasing advice.*
      </div>
    </div>
  )
}
