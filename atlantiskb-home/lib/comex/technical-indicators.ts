/**
 * technical-indicators.ts
 * Pure math library of standard technical analysis indicators.
 * No external dependencies, no API calls, no Prisma imports.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface OHLC {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
}

export interface IndicatorPoint {
  date: string
  value: number | null
}

export interface MACDPoint {
  date: string
  macd: number | null
  signal: number | null
  histogram: number | null
}

export interface BollingerPoint {
  date: string
  upper: number | null
  middle: number | null
  lower: number | null
  bandwidth: number | null
}

export interface SupportResistance {
  support: number[]
  resistance: number[]
}

export interface StochasticPoint {
  date: string
  k: number | null
  d: number | null
}

export interface TechnicalSummary {
  metal: string
  currentPrice: number
  date: string
  computedAt: string

  sma10: number | null
  sma30: number | null
  sma50: number | null
  trendDirection: 'bullish' | 'bearish' | 'neutral'

  rsi14: number | null
  rsiSignal: 'overbought' | 'oversold' | 'neutral'
  macdHistogram: number | null
  macdSignal: 'bullish' | 'bearish' | 'neutral'
  stochasticK: number | null
  stochasticSignal: 'overbought' | 'oversold' | 'neutral'

  bollingerPosition: 'upper' | 'middle' | 'lower'
  bollingerBandwidth: number | null
  atr14: number | null
  volatility: 'high' | 'medium' | 'low'

  support: number[]
  resistance: number[]

  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'
  signalCount: { bullish: number; bearish: number; neutral: number }
  confidence: 'high' | 'medium' | 'low'
  hasFullOHLC: boolean
}

// ---------------------------------------------------------------------------
// Simple Moving Average
// ---------------------------------------------------------------------------

/**
 * Compute SMA on close prices.
 * Returns an array aligned to input dates; first (period - 1) values are null.
 */
export function sma(data: OHLC[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ date: data[i].date, value: null })
      continue
    }

    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close
    }
    result.push({ date: data[i].date, value: sum / period })
  }

  return result
}

// ---------------------------------------------------------------------------
// Exponential Moving Average
// ---------------------------------------------------------------------------

/**
 * Compute EMA on close prices.
 * Seed = SMA of first `period` closes.
 * Smoothing factor: 2 / (period + 1).
 * First (period - 1) values are null.
 */
export function ema(data: OHLC[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = []
  const k = 2 / (period + 1)
  let currentEma: number | null = null

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ date: data[i].date, value: null })
      continue
    }

    if (i === period - 1) {
      // Seed: SMA of first `period` closes
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[j].close
      }
      currentEma = sum / period
    } else {
      // EMA = close * k + prevEma * (1 - k)
      currentEma = data[i].close * k + (currentEma as number) * (1 - k)
    }

    result.push({ date: data[i].date, value: currentEma })
  }

  return result
}

// ---------------------------------------------------------------------------
// RSI (Relative Strength Index)
// ---------------------------------------------------------------------------

/**
 * Compute RSI using Wilder's smoothing (alpha = 1/period).
 * First `period` values are null (need `period` price changes).
 * Returns 0–100 scale.
 */
export function rsi(data: OHLC[], period: number = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = []

  // Need at least period+1 bars to produce first RSI value (period changes)
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push({ date: data[i].date, value: null })
      continue
    }

    if (i === period) {
      // Seed: simple average of first `period` gains and losses
      let avgGain = 0
      let avgLoss = 0
      for (let j = 1; j <= period; j++) {
        const change = data[j].close - data[j - 1].close
        if (change > 0) avgGain += change
        else avgLoss += Math.abs(change)
      }
      avgGain /= period
      avgLoss /= period

      // Store running values in a side structure — we'll compute via closure
      // Re-seed from scratch each time would be O(n^2); instead we track state
      // outside the loop. We break here and restart with Wilder's smoothing.
      // (handled below via the seeded-EMA approach)
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
      const rsiValue = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs)
      result.push({ date: data[i].date, value: rsiValue })
    } else {
      // Wilder's smoothing: use previous avgGain/avgLoss
      // We need to reconstruct avgGain/avgLoss at each step — track via re-scan
      // For correctness, recompute from seed at i===period then smooth forward.
      // The loop above only handles i===period; for i>period we fall through here.
      // We'll fix this by computing RSI in a single pass below.
      result.push({ date: data[i].date, value: null }) // placeholder, replaced below
    }
  }

  // Single-pass Wilder RSI computation, overwriting placeholders
  if (data.length <= period) return result

  // Seed
  let avgGain = 0
  let avgLoss = 0
  for (let j = 1; j <= period; j++) {
    const change = data[j].close - data[j - 1].close
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  const seedRs = avgLoss === 0 ? Infinity : avgGain / avgLoss
  result[period] = {
    date: data[period].date,
    value: avgLoss === 0 ? 100 : 100 - 100 / (1 + seedRs),
  }

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
    result[i] = {
      date: data[i].date,
      value: avgLoss === 0 ? 100 : 100 - 100 / (1 + rs),
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

/**
 * MACD line = EMA12 - EMA26
 * Signal = EMA9 of MACD line
 * Histogram = MACD - Signal
 * Warm-up: first 33 values null (25 for EMA26 seed + 8 for signal EMA seed)
 */
export function macd(data: OHLC[]): MACDPoint[] {
  const ema12 = ema(data, 12)
  const ema26 = ema(data, 26)

  // MACD line: only valid where both EMAs are non-null (i.e., i >= 25)
  const macdLine: (number | null)[] = data.map((_, i) => {
    const v12 = ema12[i].value
    const v26 = ema26[i].value
    if (v12 === null || v26 === null) return null
    return v12 - v26
  })

  // Compute EMA9 of the MACD line using only valid MACD values
  // Find the index where MACD first becomes non-null
  const firstMacdIdx = macdLine.findIndex((v) => v !== null)

  const signalLine: (number | null)[] = new Array(data.length).fill(null)
  const histogram: (number | null)[] = new Array(data.length).fill(null)

  if (firstMacdIdx === -1 || firstMacdIdx + 9 > data.length) {
    return data.map((bar, i) => ({
      date: bar.date,
      macd: macdLine[i],
      signal: null,
      histogram: null,
    }))
  }

  // Seed signal EMA at firstMacdIdx + 8 (9-period SMA of first 9 MACD values)
  const signalPeriod = 9
  const signalSeedIdx = firstMacdIdx + signalPeriod - 1

  if (signalSeedIdx >= data.length) {
    return data.map((bar, i) => ({
      date: bar.date,
      macd: macdLine[i],
      signal: null,
      histogram: null,
    }))
  }

  let signalEma = 0
  for (let j = firstMacdIdx; j <= signalSeedIdx; j++) {
    signalEma += macdLine[j] as number
  }
  signalEma /= signalPeriod
  signalLine[signalSeedIdx] = signalEma
  const macdAtSeed = macdLine[signalSeedIdx] as number
  histogram[signalSeedIdx] = macdAtSeed - signalEma

  const kSignal = 2 / (signalPeriod + 1)
  for (let i = signalSeedIdx + 1; i < data.length; i++) {
    if (macdLine[i] === null) continue
    signalEma = (macdLine[i] as number) * kSignal + signalEma * (1 - kSignal)
    signalLine[i] = signalEma
    histogram[i] = (macdLine[i] as number) - signalEma
  }

  return data.map((bar, i) => ({
    date: bar.date,
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: histogram[i],
  }))
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

/**
 * Middle = SMA(close, period)
 * Upper = middle + stdDev * multiplier
 * Lower = middle - stdDev * multiplier
 * Bandwidth = (upper - lower) / middle
 * Warm-up: first (period - 1) values are null.
 */
export function bollingerBands(
  data: OHLC[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerPoint[] {
  const result: BollingerPoint[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ date: data[i].date, upper: null, middle: null, lower: null, bandwidth: null })
      continue
    }

    // Compute mean of closes over window
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close
    }
    const mean = sum / period

    // Compute population std dev
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - mean
      variance += diff * diff
    }
    const stdDev = Math.sqrt(variance / period)

    const upper = mean + stdDevMultiplier * stdDev
    const lower = mean - stdDevMultiplier * stdDev
    const bandwidth = mean !== 0 ? (upper - lower) / mean : null

    result.push({ date: data[i].date, upper, middle: mean, lower, bandwidth })
  }

  return result
}

// ---------------------------------------------------------------------------
// Support / Resistance
// ---------------------------------------------------------------------------

/**
 * Find local pivot highs/lows in the last `lookback` bars.
 * Pivot: bar is lower/higher than 3 bars on each side.
 * Cluster nearby levels within 1.5% of each other (use average).
 * Weight by recency: linear decay — pivot at index i from end gets weight i/lookback.
 * Return top 3 support (below current price) and top 3 resistance (above current price),
 * sorted by proximity.
 */
export function findSupportResistance(
  data: OHLC[],
  lookback: number = 60
): SupportResistance {
  if (data.length === 0) return { support: [], resistance: [] }

  const slice = data.slice(Math.max(0, data.length - lookback))
  const currentPrice = slice[slice.length - 1].close
  const n = slice.length

  interface WeightedLevel {
    price: number
    weight: number
  }

  const pivots: WeightedLevel[] = []
  const wing = 3

  for (let i = wing; i < n - wing; i++) {
    const bar = slice[i]
    // Weight: position from end of slice, normalized by lookback
    const distFromEnd = n - 1 - i
    const weight = (lookback - distFromEnd) / lookback

    // Local minimum (support candidate)
    const low = bar.low ?? bar.close
    let isMin = true
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue
      const cmp = slice[j].low ?? slice[j].close
      if (cmp <= low) {
        isMin = false
        break
      }
    }
    if (isMin) pivots.push({ price: low, weight })

    // Local maximum (resistance candidate)
    const high = bar.high ?? bar.close
    let isMax = true
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue
      const cmp = slice[j].high ?? slice[j].close
      if (cmp >= high) {
        isMax = false
        break
      }
    }
    if (isMax) pivots.push({ price: high, weight })
  }

  // Cluster nearby levels within 1.5%
  const clusters: WeightedLevel[] = []
  for (const pivot of pivots) {
    const existing = clusters.find(
      (c) => Math.abs(c.price - pivot.price) / Math.max(c.price, pivot.price) <= 0.015
    )
    if (existing) {
      // Merge: weighted average price, sum weights
      const totalWeight = existing.weight + pivot.weight
      existing.price = (existing.price * existing.weight + pivot.price * pivot.weight) / totalWeight
      existing.weight = totalWeight
    } else {
      clusters.push({ price: pivot.price, weight: pivot.weight })
    }
  }

  // Sort by weight descending
  clusters.sort((a, b) => b.weight - a.weight)

  // Separate into support (below current) and resistance (above current)
  const supportLevels = clusters
    .filter((c) => c.price < currentPrice)
    .slice(0, 3)
    .map((c) => c.price)
    .sort((a, b) => b - a) // closest to price first

  const resistanceLevels = clusters
    .filter((c) => c.price > currentPrice)
    .slice(0, 3)
    .map((c) => c.price)
    .sort((a, b) => a - b) // closest to price first

  return { support: supportLevels, resistance: resistanceLevels }
}

// ---------------------------------------------------------------------------
// ATR (Average True Range)
// ---------------------------------------------------------------------------

/**
 * True Range = max(high - low, abs(high - prevClose), abs(low - prevClose))
 * ATR = SMA of True Range over period.
 * Returns null for bars with null high or low.
 * Warm-up: first `period` values are null.
 */
export function atr(data: OHLC[], period: number = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = []

  // Compute true range for each bar
  const trueRanges: (number | null)[] = data.map((bar, i) => {
    if (bar.high === null || bar.low === null) return null
    if (i === 0) return bar.high - bar.low
    const prevClose = data[i - 1].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose))
  })

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push({ date: data[i].date, value: null })
      continue
    }

    // SMA of true ranges in window [i-period+1, i]
    // If any TR in the window is null, return null
    let sum = 0
    let valid = true
    for (let j = i - period + 1; j <= i; j++) {
      if (trueRanges[j] === null) {
        valid = false
        break
      }
      sum += trueRanges[j] as number
    }

    result.push({ date: data[i].date, value: valid ? sum / period : null })
  }

  return result
}

// ---------------------------------------------------------------------------
// Stochastic Oscillator
// ---------------------------------------------------------------------------

/**
 * %K = (close - lowestLow) / (highestHigh - lowestLow) * 100
 * %D = 3-period SMA of %K
 * Returns null for %K when division by zero or no valid bars in window.
 * Warm-up: first (period - 1) values null for %K, first (period + 1) values null for %D.
 */
export function stochastic(data: OHLC[], period: number = 14): StochasticPoint[] {
  const kValues: (number | null)[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      kValues.push(null)
      continue
    }

    // Gather highs and lows in window, skipping bars with nulls
    let highestHigh = -Infinity
    let lowestLow = Infinity
    let hasValid = false

    for (let j = i - period + 1; j <= i; j++) {
      const h = data[j].high
      const l = data[j].low
      if (h === null || l === null) continue
      hasValid = true
      if (h > highestHigh) highestHigh = h
      if (l < lowestLow) lowestLow = l
    }

    if (!hasValid) {
      kValues.push(null)
      continue
    }

    if (highestHigh === lowestLow) {
      kValues.push(null)
      continue
    }

    const k = ((data[i].close - lowestLow) / (highestHigh - lowestLow)) * 100
    kValues.push(k)
  }

  // %D = 3-period SMA of %K
  const dPeriod = 3
  const result: StochasticPoint[] = []

  for (let i = 0; i < data.length; i++) {
    const k = kValues[i]

    // %D requires 3 consecutive non-null %K values ending at i
    if (i < period - 1 + dPeriod - 1) {
      result.push({ date: data[i].date, k, d: null })
      continue
    }

    const k0 = kValues[i]
    const k1 = kValues[i - 1]
    const k2 = kValues[i - 2]

    if (k0 === null || k1 === null || k2 === null) {
      result.push({ date: data[i].date, k, d: null })
      continue
    }

    const d = (k0 + k1 + k2) / dPeriod
    result.push({ date: data[i].date, k, d })
  }

  return result
}

// ---------------------------------------------------------------------------
// Helper: last non-null value in IndicatorPoint array
// ---------------------------------------------------------------------------
function lastValue(points: IndicatorPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null) return points[i].value
  }
  return null
}

// ---------------------------------------------------------------------------
// computeTechnicalSummary
// ---------------------------------------------------------------------------

/**
 * Compute all indicators and produce a structured summary of the latest values.
 */
export function computeTechnicalSummary(data: OHLC[], metal: string): TechnicalSummary {
  if (data.length === 0) {
    throw new Error('computeTechnicalSummary requires at least one data point')
  }

  const last = data[data.length - 1]
  const currentPrice = last.close

  // Compute all indicators
  const sma10Points = sma(data, 10)
  const sma30Points = sma(data, 30)
  const sma50Points = sma(data, 50)
  const rsi14Points = rsi(data, 14)
  const macdPoints = macd(data)
  const bollingerPoints = bollingerBands(data, 20, 2)
  const atr14Points = atr(data, 14)
  const stochasticPoints = stochastic(data, 14)
  const srLevels = findSupportResistance(data, 60)

  // Extract latest non-null values
  const sma10 = lastValue(sma10Points)
  const sma30 = lastValue(sma30Points)
  const sma50 = lastValue(sma50Points)
  const rsi14 = lastValue(rsi14Points)
  const atr14 = lastValue(atr14Points)

  // MACD: find last non-null histogram
  let macdHistogram: number | null = null
  for (let i = macdPoints.length - 1; i >= 0; i--) {
    if (macdPoints[i].histogram !== null) {
      macdHistogram = macdPoints[i].histogram
      break
    }
  }

  // Stochastic: find last non-null k
  let stochasticK: number | null = null
  for (let i = stochasticPoints.length - 1; i >= 0; i--) {
    if (stochasticPoints[i].k !== null) {
      stochasticK = stochasticPoints[i].k
      break
    }
  }

  // Bollinger: find last non-null point
  let bollingerUpper: number | null = null
  let bollingerLower: number | null = null
  let bollingerBandwidth: number | null = null
  for (let i = bollingerPoints.length - 1; i >= 0; i--) {
    if (bollingerPoints[i].upper !== null) {
      bollingerUpper = bollingerPoints[i].upper
      bollingerLower = bollingerPoints[i].lower
      bollingerBandwidth = bollingerPoints[i].bandwidth
      break
    }
  }

  // ---------------------------------------------------------------------------
  // Signal counting
  // ---------------------------------------------------------------------------
  const signals: ('bullish' | 'bearish' | 'neutral')[] = []

  // 1. Trend: price vs sma50
  if (sma50 !== null) {
    if (currentPrice > sma50) signals.push('bullish')
    else if (currentPrice < sma50) signals.push('bearish')
    else signals.push('neutral')
  } else {
    signals.push('neutral')
  }

  // 2. SMA alignment: sma10 > sma30 > sma50
  if (sma10 !== null && sma30 !== null && sma50 !== null) {
    if (sma10 > sma30 && sma30 > sma50) signals.push('bullish')
    else if (sma10 < sma30 && sma30 < sma50) signals.push('bearish')
    else signals.push('neutral')
  } else {
    signals.push('neutral')
  }

  // 3. RSI
  let rsiSignal: 'overbought' | 'oversold' | 'neutral' = 'neutral'
  if (rsi14 !== null) {
    if (rsi14 > 70) rsiSignal = 'overbought'
    else if (rsi14 < 30) rsiSignal = 'oversold'
  }
  // RSI overbought = bearish signal, oversold = bullish signal
  if (rsiSignal === 'overbought') signals.push('bearish')
  else if (rsiSignal === 'oversold') signals.push('bullish')
  else signals.push('neutral')

  // 4. MACD histogram
  let macdSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  if (macdHistogram !== null) {
    if (macdHistogram > 0) macdSignal = 'bullish'
    else if (macdHistogram < 0) macdSignal = 'bearish'
  }
  signals.push(macdSignal)

  // 5. Stochastic
  let stochasticSignal: 'overbought' | 'oversold' | 'neutral' = 'neutral'
  if (stochasticK !== null) {
    if (stochasticK < 20) stochasticSignal = 'oversold'
    else if (stochasticK > 80) stochasticSignal = 'overbought'
  }
  if (stochasticSignal === 'oversold') signals.push('bullish')
  else if (stochasticSignal === 'overbought') signals.push('bearish')
  else signals.push('neutral')

  // 6. Bollinger position
  let bollingerPosition: 'upper' | 'middle' | 'lower' = 'middle'
  if (bollingerUpper !== null && bollingerLower !== null) {
    if (currentPrice > bollingerUpper) bollingerPosition = 'upper'
    else if (currentPrice < bollingerLower) bollingerPosition = 'lower'
  }
  if (bollingerPosition === 'lower') signals.push('bullish')
  else if (bollingerPosition === 'upper') signals.push('bearish')
  else signals.push('neutral')

  // Count signals
  const signalCount = { bullish: 0, bearish: 0, neutral: 0 }
  for (const s of signals) signalCount[s]++

  // Overall signal
  let overallSignal: TechnicalSummary['overallSignal'] = 'neutral'
  if (signalCount.bullish >= 5) overallSignal = 'strong_buy'
  else if (signalCount.bullish >= 3) overallSignal = 'buy'
  else if (signalCount.bearish >= 5) overallSignal = 'strong_sell'
  else if (signalCount.bearish >= 3) overallSignal = 'sell'

  // Trend direction: based on SMA alignment (sma10 vs sma30)
  let trendDirection: TechnicalSummary['trendDirection'] = 'neutral'
  if (sma10 !== null && sma30 !== null) {
    if (sma10 > sma30) trendDirection = 'bullish'
    else if (sma10 < sma30) trendDirection = 'bearish'
  }

  // Volatility
  let volatility: TechnicalSummary['volatility'] = 'low'
  if (atr14 !== null && currentPrice > 0) {
    const ratio = atr14 / currentPrice
    if (ratio > 0.02) volatility = 'high'
    else if (ratio > 0.01) volatility = 'medium'
  }

  // Confidence based on data length
  let confidence: TechnicalSummary['confidence'] = 'low'
  if (data.length >= 200) confidence = 'high'
  else if (data.length >= 100) confidence = 'medium'

  // hasFullOHLC: >= 80% of bars have non-null high and low
  const fullOHLCCount = data.filter((b) => b.high !== null && b.low !== null).length
  const hasFullOHLC = fullOHLCCount / data.length >= 0.8

  return {
    metal,
    currentPrice,
    date: last.date,
    computedAt: new Date().toISOString(),

    sma10,
    sma30,
    sma50,
    trendDirection,

    rsi14,
    rsiSignal,
    macdHistogram,
    macdSignal,
    stochasticK,
    stochasticSignal,

    bollingerPosition,
    bollingerBandwidth,
    atr14,
    volatility,

    support: srLevels.support,
    resistance: srLevels.resistance,

    overallSignal,
    signalCount,
    confidence,
    hasFullOHLC,
  }
}
