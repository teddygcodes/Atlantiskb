'use client'

import { useEffect, useState } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DailyPrice } from '@/lib/comex/fetch-prices'
import type { MAPoint } from '@/lib/comex/moving-average'
import type { Prediction } from '@/lib/comex/predictions'
import { METAL_CONFIG, METAL_KEYS, type MetalKey } from '@/lib/comex/constants'

// ── Types ────────────────────────────────────────────────────────────────────

interface MetalData {
  history: DailyPrice[]
  ma30: MAPoint[]
  predictions: Prediction[]
}

type PricesResponse = Partial<Record<MetalKey, MetalData>>

// ── Chart data merge ─────────────────────────────────────────────────────────

interface ChartPoint {
  date: string
  close?: number
  ma30?: number
  prediction?: number
}

function buildChartData(data: MetalData): ChartPoint[] {
  // Use last 90 days of history for the chart
  const history = data.history.slice(-90)

  // MA30 lookup by date
  const maByDate = new Map(data.ma30.map((p) => [p.date, p.ma]))

  // Historical points
  const points: ChartPoint[] = history.map((p) => ({
    date: p.date,
    close: p.close,
    ma30: maByDate.get(p.date),
  }))

  // Prediction points — extend beyond last historical date
  for (const pred of data.predictions) {
    points.push({ date: pred.date, prediction: pred.price })
  }

  return points.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number | undefined | null, decimals = 4): string {
  if (value == null) return '—'
  return value.toFixed(decimals)
}

function pctChange(history: DailyPrice[]): { abs: number; pct: number } | null {
  if (history.length < 2) return null
  const prev = history[history.length - 2].close
  const curr = history[history.length - 1].close
  return { abs: curr - prev, pct: ((curr - prev) / prev) * 100 }
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function lastSyncedLabel(history: DailyPrice[]): string {
  if (!history.length) return '—'
  return formatDate(history[history.length - 1].date)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriceChange({ history }: { history: DailyPrice[] }) {
  const change = pctChange(history)
  if (!change) return null
  const positive = change.abs >= 0
  const color = positive ? 'var(--live)' : 'var(--accent)'
  return (
    <span style={{ fontSize: 13, color, fontWeight: 500 }}>
      {positive ? '+' : ''}
      {fmt(change.abs, 4)} ({positive ? '+' : ''}
      {change.pct.toFixed(2)}%)
    </span>
  )
}

function PredictionGrid({ predictions, unit }: { predictions: Prediction[]; unit: string }) {
  if (!predictions.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        Insufficient data for predictions (need ≥14 days)
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
      {predictions.map((p) => (
        <div
          key={p.days}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            +{p.days}d forecast
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {fmt(p.price, 4)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{unit}</div>
        </div>
      ))}
    </div>
  )
}

function MetalChart({ data, unit }: { data: MetalData; unit: string }) {
  const chartData = buildChartData(data)
  const latest = data.history[data.history.length - 1]?.close

  // Determine y-axis domain with padding
  const closes = chartData.map((p) => p.close ?? p.prediction ?? 0).filter(Boolean)
  const minVal = Math.min(...closes)
  const maxVal = Math.max(...closes)
  const pad = (maxVal - minVal) * 0.05 || 0.01
  const yMin = Math.max(0, minVal - pad)
  const yMax = maxVal + pad

  // Show every ~15 dates on x-axis
  const xTicks = chartData
    .filter((_, i) => i % 15 === 0)
    .map((p) => p.date)

  return (
    <>
      {/* Current price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {fmt(latest, 4)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unit}</span>
      </div>
      <div style={{ marginBottom: 14 }}>
        <PriceChange history={data.history} />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
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
            domain={[yMin, yMax]}
            tickFormatter={(v) => v.toFixed(3)}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                close: 'Close',
                ma30: 'MA 30',
                prediction: 'Forecast',
              }
              const num = typeof value === 'number' ? value : Number(value)
              return [num.toFixed(4), labels[String(name)] ?? String(name)]
            }}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 6,
              boxShadow: 'var(--shadow-sm)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(value) =>
              value === 'close' ? 'Close' : value === 'ma30' ? 'MA 30' : 'Forecast'
            }
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="ma30"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="prediction"
            stroke="#dc2626"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: '#dc2626' }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <PredictionGrid predictions={data.predictions} unit={unit} />
    </>
  )
}

function MetalCard({ metalKey, data }: { metalKey: MetalKey; data: MetalData }) {
  const config = METAL_CONFIG[metalKey]
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        padding: '20px 20px 16px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {config.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {config.symbol} · {config.unit}
        </div>
      </div>

      <MetalChart data={data} unit={config.unit} />
    </div>
  )
}

// ── Empty / loading states ────────────────────────────────────────────────────

function EmptyState({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-sm)',
          padding: '40px 48px',
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          No price data yet
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          Fetch the latest copper and aluminum futures history from Yahoo Finance to get started.
        </p>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            background: syncing ? 'var(--text-muted)' : 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            padding: '8px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: syncing ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {syncing ? 'Syncing…' : 'Sync Prices'}
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ComexPage() {
  const [data, setData] = useState<PricesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function loadPrices() {
    try {
      const res = await fetch('/comex/api/prices')
      if (!res.ok) throw new Error('Failed to load prices')
      const json: PricesResponse = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/comex/api/prices/sync')
      const json = await res.json()
      const summary = (json.results as Array<{ metal: string; upserted: number; error?: string }>)
        .map((r) => `${r.metal}: ${r.error ? `error — ${r.error}` : `${r.upserted} rows`}`)
        .join(' · ')
      setSyncResult(summary)
      await loadPrices()
    } catch {
      setSyncResult('Sync failed — check console')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadPrices() }, [])

  // Determine if we have any data
  const hasData = data && METAL_KEYS.some((k) => (data[k]?.history?.length ?? 0) > 0)

  // Last synced label
  const lastSynced = hasData
    ? lastSyncedLabel(data[METAL_KEYS.find((k) => (data[k]?.history?.length ?? 0) > 0)!]!.history)
    : null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              COMEX Metals Pricing
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Copper &amp; Aluminum futures · Yahoo Finance · 90-day history + forecast
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastSynced && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Last settlement: {lastSynced}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing || loading}
              style={{
                background: syncing ? 'var(--text-muted)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 5,
                padding: '7px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: syncing || loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {syncing ? 'Syncing…' : 'Sync Prices'}
            </button>
          </div>
        </div>

        {syncResult && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 10px', display: 'inline-block' }}>
            {syncResult}
          </p>
        )}
      </div>

      {/* Content */}
      {loading && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading prices…</p>
      )}

      {!loading && error && (
        <p style={{ color: 'var(--accent)', fontSize: 13 }}>Error: {error}</p>
      )}

      {!loading && !error && !hasData && (
        <EmptyState onSync={handleSync} syncing={syncing} />
      )}

      {!loading && !error && hasData && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {METAL_KEYS.map((metalKey) => {
            const metalData = data?.[metalKey]
            if (!metalData || metalData.history.length === 0) return null
            return <MetalCard key={metalKey} metalKey={metalKey} data={metalData} />
          })}
        </div>
      )}
    </div>
  )
}
