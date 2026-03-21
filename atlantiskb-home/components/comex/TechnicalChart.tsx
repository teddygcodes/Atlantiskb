'use client'

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
import type { IndicatorPoint, BollingerPoint, TechnicalSummary } from '@/lib/comex/technical-indicators'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TechnicalChartProps {
  data: {
    priceHistory: Array<{ date: string; close: number; open: number | null; high: number | null; low: number | null }>
    indicators: {
      sma: { sma10: IndicatorPoint[]; sma30: IndicatorPoint[]; sma50: IndicatorPoint[] }
      bollinger: BollingerPoint[]
    }
    supportResistance: { support: number[]; resistance: number[] }
    summary: TechnicalSummary
  }
  metal: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatSignal(signal: TechnicalSummary['overallSignal']): string {
  return signal.replace('_', ' ').toUpperCase()
}

// ── Chart data merge ──────────────────────────────────────────────────────────

interface ChartPoint {
  date: string
  close: number
  sma10: number | null
  sma30: number | null
  sma50: number | null
  bollingerLower: number | null  // base of the band fill (lower band value)
  bollingerDelta: number | null  // upper - lower (stacked fill height)
}

function buildChartData(props: TechnicalChartProps['data']): ChartPoint[] {
  const { priceHistory, indicators } = props

  const sma10Map = new Map(indicators.sma.sma10.map((p) => [p.date, p.value]))
  const sma30Map = new Map(indicators.sma.sma30.map((p) => [p.date, p.value]))
  const sma50Map = new Map(indicators.sma.sma50.map((p) => [p.date, p.value]))
  const bollingerMap = new Map(indicators.bollinger.map((p) => [p.date, p]))

  return priceHistory.map((p) => {
    const bb = bollingerMap.get(p.date)
    const upper = bb?.upper ?? null
    const lower = bb?.lower ?? null
    // stackId band: base Area uses bollingerLower, delta Area fills the gap
    const bollingerDelta = upper !== null && lower !== null ? upper - lower : null

    return {
      date: p.date,
      close: p.close,
      sma10: sma10Map.get(p.date) ?? null,
      sma30: sma30Map.get(p.date) ?? null,
      sma50: sma50Map.get(p.date) ?? null,
      bollingerLower: lower,
      bollingerDelta,
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TechnicalChart({ data, metal }: TechnicalChartProps) {
  const chartData = buildChartData(data)
  const { summary, supportResistance } = data

  // Ticks: show ~6 labels
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6))
  const xTicks = chartData
    .filter((_, i) => i % tickInterval === 0)
    .map((p) => p.date)

  // Summary badge date
  const summaryDate = new Date(summary.date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  const rsiLabel = summary.rsi14 !== null
    ? `RSI: ${summary.rsi14.toFixed(0)} (${summary.rsiSignal})`
    : 'RSI: —'

  return (
    <div style={{ marginTop: 20 }}>
      {/* Title + summary badges */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Technical Analysis
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {rsiLabel}
          {' | '}
          MACD: {summary.macdSignal}
          {' | '}
          Bollinger: {summary.bollingerPosition}
          {' | '}
          Signal: <span style={{ fontWeight: 600 }}>{formatSignal(summary.overallSignal)}</span>
          {' | '}
          as of {summaryDate}
          {!summary.hasFullOHLC && (
            <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (limited OHLC)
            </span>
          )}
        </div>
      </div>

      {/* Main price chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={55}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                close: 'Close',
                sma10: 'SMA10',
                sma30: 'SMA30',
                sma50: 'SMA50',
              }
              const num = value == null ? null : Number(value)
              return [num != null ? num.toFixed(4) : '—', labels[String(name)] ?? String(name)]
            }}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 6,
              boxShadow: 'var(--shadow-sm)',
            }}
          />

          {/* Bollinger Bands shaded area */}
          <Area
            type="monotone"
            dataKey="bollingerLower"
            fill="transparent"
            stroke="none"
            stackId="bollinger"
            dot={false}
            legendType="none"
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="bollingerDelta"
            fill="rgba(147,197,253,0.15)"
            stroke="rgba(147,197,253,0.4)"
            stackId="bollinger"
            strokeWidth={1}
            dot={false}
            legendType="none"
            connectNulls={false}
          />

          {/* SMA lines */}
          <Line
            type="monotone"
            dataKey="sma10"
            stroke="#9ca3af"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="sma30"
            stroke="#60a5fa"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="sma50"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            legendType="none"
          />

          {/* Close price line */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />

          {/* Support levels */}
          {supportResistance.support.map((level) => (
            <ReferenceLine
              key={`support-${level}`}
              y={level}
              stroke="#22c55e"
              strokeDasharray="4 4"
              label={{ value: `$${level.toFixed(2)}`, position: 'insideBottomRight', fontSize: 9, fill: '#22c55e' }}
            />
          ))}

          {/* Resistance levels */}
          {supportResistance.resistance.map((level) => (
            <ReferenceLine
              key={`resistance-${level}`}
              y={level}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: `$${level.toFixed(2)}`, position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
