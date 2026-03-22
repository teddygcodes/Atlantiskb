'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { ScenarioData } from '@/lib/comex/types'

// Re-export types for consumers
export type { ScenarioData } from '@/lib/comex/types'
export type { Range } from '@/lib/comex/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioChartProps {
  scenario: ScenarioData
  priceHistory: Array<{ date: string; close: number }>
  currentPrice: number
}

type Horizon = '1week' | '30day' | '90day'

interface HistoricalPoint {
  date: string
  close: number
  isForecast: false
  bullBase: null
  bullDelta: null
  baseBase: null
  baseDelta: null
  bearBase: null
  bearDelta: null
}

interface ForecastPoint {
  date: string
  close: null
  isForecast: true
  bullBase: number
  bullDelta: number
  baseBase: number
  baseDelta: number
  bearBase: number
  bearDelta: number
}

type ChartPoint = HistoricalPoint | ForecastPoint

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Generate N trading days (Mon–Fri) starting from the day after `fromDate`.
 */
function generateTradingDays(fromDate: string, count: number): string[] {
  const dates: string[] = []
  const current = new Date(fromDate + 'T00:00:00')
  while (dates.length < count) {
    current.setDate(current.getDate() + 1)
    const day = current.getDay() // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().slice(0, 10))
    }
  }
  return dates
}

const HORIZON_DAYS: Record<Horizon, number> = {
  '1week': 5,
  '30day': 21,
  '90day': 63,
}

function buildChartData(
  priceHistory: Array<{ date: string; close: number }>,
  scenario: ScenarioData,
  horizon: Horizon,
  currentPrice: number
): { points: ChartPoint[]; todayDate: string } {
  // Use last 90 days of history
  const history = priceHistory.slice(-90)

  // Historical points
  const historical: HistoricalPoint[] = history.map((p) => ({
    date: p.date,
    close: p.close,
    isForecast: false as const,
    bullBase: null,
    bullDelta: null,
    baseBase: null,
    baseDelta: null,
    bearBase: null,
    bearDelta: null,
  }))

  // Today date (last historical date or today)
  const todayDate =
    history.length > 0
      ? history[history.length - 1].date
      : new Date().toISOString().slice(0, 10)

  // Forward trading days
  const N = HORIZON_DAYS[horizon]
  const forwardDates = generateTradingDays(todayDate, N)
  const horizonData = scenario.scenarios

  const forecast: ForecastPoint[] = forwardDates.map((date, i) => {
    const t = (i + 1) / N

    const bullHigh = currentPrice + t * (horizonData.bull[horizon].high - currentPrice)
    const bullLow = currentPrice + t * (horizonData.bull[horizon].low - currentPrice)
    const baseHigh = currentPrice + t * (horizonData.base[horizon].high - currentPrice)
    const baseLow = currentPrice + t * (horizonData.base[horizon].low - currentPrice)
    const bearHigh = currentPrice + t * (horizonData.bear[horizon].high - currentPrice)
    const bearLow = currentPrice + t * (horizonData.bear[horizon].low - currentPrice)

    // Enforce non-overlap: bear can't exceed bull low (clamp if AI ranges cross)
    const adjBearHigh = Math.min(bearHigh, bullLow)
    const adjBullLow  = Math.max(bullLow, adjBearHigh)

    // Base band = the gap between bear top and bull bottom (inherently non-overlapping)
    const bandBearLow  = bearLow
    const bandBearHigh = adjBearHigh
    const bandBaseLow  = adjBearHigh  // starts exactly where bear ends
    const bandBaseHigh = adjBullLow   // ends exactly where bull starts
    const bandBullLow  = adjBullLow
    const bandBullHigh = bullHigh

    return {
      date,
      close: null,
      isForecast: true as const,
      bearBase:  bandBearLow,
      bearDelta: Math.max(0, bandBearHigh - bandBearLow),
      baseBase:  bandBaseLow,
      baseDelta: Math.max(0, bandBaseHigh - bandBaseLow),
      bullBase:  bandBullLow,
      bullDelta: Math.max(0, bandBullHigh - bandBullLow),
    }
  })

  return { points: [...historical, ...forecast], todayDate }
}

// ---------------------------------------------------------------------------
// Band label: positioned at right edge of forecast zone
// ---------------------------------------------------------------------------

interface BandLabelProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number }
  value?: string
  color?: string
}

function BandLabel({ viewBox, value, color }: BandLabelProps) {
  if (!viewBox || viewBox.x === undefined || viewBox.y === undefined) return null
  return (
    <text
      x={(viewBox.x ?? 0) + (viewBox.width ?? 0) + 4}
      y={(viewBox.y ?? 0) + (viewBox.height ?? 0) / 2}
      fill={color}
      fontSize={10}
      dominantBaseline="middle"
    >
      {value}
    </text>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScenarioChart({
  scenario,
  priceHistory,
  currentPrice,
}: ScenarioChartProps) {
  const [horizon, setHorizon] = useState<Horizon>('30day')

  const { points, todayDate } = buildChartData(priceHistory, scenario, horizon, currentPrice)

  // Compute y-axis domain from all chart values to avoid defaulting to [0, auto]
  const allYValues: number[] = []
  for (const p of points) {
    if (!p.isForecast) {
      allYValues.push(p.close)
    } else {
      allYValues.push(p.bearBase)
      allYValues.push(p.bearBase + p.bearDelta)
      allYValues.push(p.bullBase)
      allYValues.push(p.bullBase + p.bullDelta)
      allYValues.push(p.baseBase)
      allYValues.push(p.baseBase + p.baseDelta)
    }
  }
  const yMin = Math.min(...allYValues)
  const yMax = Math.max(...allYValues)
  const yPad = (yMax - yMin) * 0.05 || 1
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad]

  // X-axis ticks: ~6 labels spread across the data
  const tickInterval = Math.max(1, Math.floor(points.length / 6))
  const xTicks = points.filter((_, i) => i % tickInterval === 0).map((p) => p.date)

  const horizonLabels: Record<Horizon, string> = {
    '1week': '1 week',
    '30day': '30 day',
    '90day': '90 day',
  }

  return (
    <div style={{ marginTop: 20 }}>
      {/* Horizon tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['1week', '30day', '90day'] as Horizon[]).map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: horizon === h ? 'var(--accent)' : 'transparent',
              color: horizon === h ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: horizon === h ? 600 : 400,
            }}
          >
            {horizonLabels[h]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points} margin={{ top: 4, right: 60, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            ticks={xTicks}
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            orientation="right"
            domain={yDomain}
            allowDataOverflow
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={55}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Tooltip
            formatter={(value, name, _item, _index, payload) => {
              if (name === 'close') return [`$${Number(value).toFixed(2)}`, 'Price']
              // Hide transparent spacer entries
              if (['bullBase', 'baseBase', 'bearBase'].includes(String(name))) return [null, null]
              // For delta entries show actual low–high range
              const baseKey = String(name).replace('Delta', 'Base')
              const baseVal = (payload as readonly { dataKey: string; value: number }[])?.find(
                (p) => p.dataKey === baseKey
              )?.value ?? 0
              const low = Number(baseVal)
              const high = low + Number(value)
              const labels: Record<string, string> = { bullDelta: 'Bull', baseDelta: 'Base', bearDelta: 'Bear' }
              if (Number(value) <= 0) return [null, null]
              return [`$${low.toFixed(2)} – $${high.toFixed(2)}`, labels[String(name)] ?? '']
            }}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          />

          {/* "Now" divider */}
          <ReferenceLine
            x={todayDate}
            stroke="#9ca3af"
            strokeDasharray="5 5"
            label={{ value: 'Now', position: 'top', fontSize: 10 }}
          />

          {/* Bear band: transparent spacer + red fill */}
          <Area
            dataKey="bearBase"
            fill="transparent"
            stroke="none"
            stackId="bear"
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            dataKey="bearDelta"
            fill="#fee2e2"
            stroke="#ef4444"
            stackId="bear"
            strokeWidth={1.5}
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
            label={<BandLabel value="Bear" color="#ef4444" />}
          />

          {/* Base band: transparent spacer + blue fill */}
          <Area
            dataKey="baseBase"
            fill="transparent"
            stroke="none"
            stackId="base"
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            dataKey="baseDelta"
            fill="#dbeafe"
            stroke="#3b82f6"
            stackId="base"
            strokeWidth={1.5}
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
            label={<BandLabel value="Base" color="#3b82f6" />}
          />

          {/* Bull band: transparent spacer + green fill */}
          <Area
            dataKey="bullBase"
            fill="transparent"
            stroke="none"
            stackId="bull"
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            dataKey="bullDelta"
            fill="#dcfce7"
            stroke="#22c55e"
            stackId="bull"
            strokeWidth={1.5}
            connectNulls={false}
            dot={false}
            legendType="none"
            isAnimationActive={false}
            label={<BandLabel value="Bull" color="#22c55e" />}
          />

          {/* Historical close line */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            legendType="none"
            isAnimationActive={false}
          />

          {/* Key support / resistance lines */}
          <ReferenceLine
            y={scenario.keyLevels.support}
            stroke="#22c55e"
            strokeDasharray="4 4"
            label={{ value: `$${scenario.keyLevels.support}`, fontSize: 10 }}
          />
          <ReferenceLine
            y={scenario.keyLevels.resistance}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: `$${scenario.keyLevels.resistance}`, fontSize: 10 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
