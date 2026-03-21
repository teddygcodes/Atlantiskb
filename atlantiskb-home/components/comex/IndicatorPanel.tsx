'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import type { IndicatorPoint, MACDPoint, StochasticPoint } from '@/lib/comex/technical-indicators'

// ── Types ────────────────────────────────────────────────────────────────────

export interface IndicatorPanelProps {
  data: {
    indicators: {
      rsi: IndicatorPoint[]
      macd: MACDPoint[]
      stochastic: StochasticPoint[]
    }
    priceHistory: Array<{ date: string; close: number }>
  }
}

// ── Processed data shapes ─────────────────────────────────────────────────────

interface RSIPoint {
  date: string
  value: number | null
}

interface MACDChartPoint {
  date: string
  macd: number | null
  signal: number | null
  histPos: number | null
  histNeg: number | null
}

interface StochPoint {
  date: string
  k: number | null
  d: number | null
}

// ── Data builders ─────────────────────────────────────────────────────────────

function buildRsiData(
  priceHistory: Array<{ date: string; close: number }>,
  rsi: IndicatorPoint[]
): RSIPoint[] {
  const rsiMap = new Map(rsi.map((p) => [p.date, p.value]))
  return priceHistory.map((p) => ({
    date: p.date,
    value: rsiMap.get(p.date) ?? null,
  }))
}

function buildMacdData(
  priceHistory: Array<{ date: string; close: number }>,
  macd: MACDPoint[]
): MACDChartPoint[] {
  const macdMap = new Map(macd.map((p) => [p.date, p]))
  return priceHistory.map((p) => {
    const m = macdMap.get(p.date)
    const hist = m?.histogram ?? null
    return {
      date: p.date,
      macd: m?.macd ?? null,
      signal: m?.signal ?? null,
      histPos: hist !== null && hist > 0 ? hist : null,
      histNeg: hist !== null && hist < 0 ? hist : null,
    }
  })
}

function buildStochData(
  priceHistory: Array<{ date: string; close: number }>,
  stochastic: StochasticPoint[]
): StochPoint[] {
  const stochMap = new Map(stochastic.map((p) => [p.date, p]))
  return priceHistory.map((p) => {
    const s = stochMap.get(p.date)
    return {
      date: p.date,
      k: s?.k ?? null,
      d: s?.d ?? null,
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function xTicks(data: Array<{ date: string }>, count = 4): string[] {
  const interval = Math.max(1, Math.floor(data.length / count))
  return data.filter((_, i) => i % interval === 0).map((p) => p.date)
}

const sharedContentStyle = {
  fontSize: 11,
  border: '1px solid var(--border)',
  borderRadius: 6,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IndicatorPanel({ data }: IndicatorPanelProps) {
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(false)
  const [showStoch, setShowStoch] = useState(false)

  const { priceHistory, indicators } = data

  const rsiData = buildRsiData(priceHistory, indicators.rsi)
  const macdData = buildMacdData(priceHistory, indicators.macd)
  const stochData = buildStochData(priceHistory, indicators.stochastic)

  const hasAny = showRsi || showMacd || showStoch

  return (
    <div style={{ marginTop: 16 }}>
      {/* Toggle buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setShowRsi(!showRsi)}
          className={showRsi
            ? 'px-3 py-1 text-sm rounded bg-red-600 text-white'
            : 'px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 bg-white'}
        >
          RSI
        </button>
        <button
          onClick={() => setShowMacd(!showMacd)}
          className={showMacd
            ? 'px-3 py-1 text-sm rounded bg-red-600 text-white'
            : 'px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 bg-white'}
        >
          MACD
        </button>
        <button
          onClick={() => setShowStoch(!showStoch)}
          className={showStoch
            ? 'px-3 py-1 text-sm rounded bg-red-600 text-white'
            : 'px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 bg-white'}
        >
          Stochastic
        </button>
      </div>

      {/* Panels */}
      {hasAny && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* RSI Panel */}
          {showRsi && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                RSI(14)
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={rsiData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <ReferenceArea y1={70} y2={100} fill="rgba(239,68,68,0.08)" />
                  <ReferenceArea y1={0} y2={30} fill="rgba(34,197,94,0.08)" />
                  <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={0.5} />
                  <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={0.5} />
                  <XAxis
                    dataKey="date"
                    ticks={xTicks(rsiData)}
                    tickFormatter={formatDate}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 30, 50, 70, 100]}
                    width={30}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={sharedContentStyle}
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value) => {
                      const num = value == null ? null : Number(value)
                      return [num != null ? num.toFixed(2) : '—', 'RSI']
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MACD Panel */}
          {showMacd && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                MACD(12,26,9)
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={macdData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={0.5} />
                  <XAxis
                    dataKey="date"
                    ticks={xTicks(macdData)}
                    tickFormatter={formatDate}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={30}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => v.toFixed(3)}
                  />
                  <Tooltip
                    contentStyle={sharedContentStyle}
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        histPos: 'Histogram',
                        histNeg: 'Histogram',
                        macd: 'MACD',
                        signal: 'Signal',
                      }
                      const num = value == null ? null : Number(value)
                      return [num != null ? num.toFixed(4) : '—', labels[String(name)] ?? String(name)]
                    }}
                  />
                  <Bar dataKey="histPos" fill="#22c55e" />
                  <Bar dataKey="histNeg" fill="#ef4444" />
                  <Line
                    type="monotone"
                    dataKey="macd"
                    stroke="#2563eb"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="signal"
                    stroke="#f97316"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Stochastic Panel */}
          {showStoch && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                Stoch(14)
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={stochData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <ReferenceArea y1={80} y2={100} fill="rgba(239,68,68,0.08)" />
                  <ReferenceArea y1={0} y2={20} fill="rgba(34,197,94,0.08)" />
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={0.5} />
                  <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={0.5} />
                  <XAxis
                    dataKey="date"
                    ticks={xTicks(stochData)}
                    tickFormatter={formatDate}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 50, 80, 100]}
                    width={30}
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={sharedContentStyle}
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { k: '%K', d: '%D' }
                      const num = value == null ? null : Number(value)
                      return [num != null ? num.toFixed(2) : '—', labels[String(name)] ?? String(name)]
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="k"
                    stroke="#2563eb"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="d"
                    stroke="#f97316"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
