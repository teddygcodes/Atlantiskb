import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  sma,
  rsi,
  macd,
  bollingerBands,
  stochastic,
  atr,
  findSupportResistance,
  computeTechnicalSummary,
} from '@/lib/comex/technical-indicators'
import type {
  OHLC,
  IndicatorPoint,
  MACDPoint,
  BollingerPoint,
  StochasticPoint,
  TechnicalSummary,
  SupportResistance,
} from '@/lib/comex/technical-indicators'

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: TechnicalsResponse
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface TechnicalsResponse {
  metal: string
  currentPrice: number
  computedAt: string
  summary: TechnicalSummary
  indicators: {
    sma: {
      sma10: IndicatorPoint[]
      sma30: IndicatorPoint[]
      sma50: IndicatorPoint[]
    }
    rsi: IndicatorPoint[]
    macd: MACDPoint[]
    bollinger: BollingerPoint[]
    stochastic: StochasticPoint[]
    atr: IndicatorPoint[]
  }
  supportResistance: SupportResistance
  priceHistory: Array<{
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number
  }>
}

// ---------------------------------------------------------------------------
// GET /comex/api/technicals?metal=copper
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // 1. Auth check
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Validate metal param
  const { searchParams } = request.nextUrl
  const metalParam = searchParams.get('metal')
  if (metalParam !== 'copper' && metalParam !== 'aluminum') {
    return NextResponse.json(
      { error: 'Invalid metal. Must be "copper" or "aluminum".' },
      { status: 400 }
    )
  }

  // 3. Check in-memory cache
  const cacheKey = metalParam
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  // 4. Fetch last 365 rows from DB (desc + reverse = most recent 365, chronological order)
  const rows = (
    await db.commodityPrice.findMany({
      where: { metal: metalParam },
      orderBy: { settlementDate: 'desc' },
      take: 365,
    })
  ).reverse()

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_price_data' }, { status: 404 })
  }

  // 5. Map DB rows to OHLC format
  const ohlcData: OHLC[] = rows.map((row) => ({
    date: row.settlementDate.toISOString().slice(0, 10),
    open: row.open ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    close: row.close,
  }))

  // 6. Compute SMA30 from OHLC data (DB ma30 field is not populated by sync route)
  const sma30Points = sma(ohlcData, 30)

  // 7. Compute technical indicators
  const sma10Points = sma(ohlcData, 10)
  const sma50Points = sma(ohlcData, 50)
  const rsiPoints = rsi(ohlcData)
  const macdPoints = macd(ohlcData)
  const bollingerPoints = bollingerBands(ohlcData)
  const stochasticPoints = stochastic(ohlcData)
  const atrPoints = atr(ohlcData)
  const supportResistance = findSupportResistance(ohlcData)
  const summary = computeTechnicalSummary(ohlcData, metalParam)

  // ohlcData and priceHistory are the same shape — reuse
  const currentPrice = ohlcData[ohlcData.length - 1].close
  const computedAt = new Date().toISOString()

  const result: TechnicalsResponse = {
    metal: metalParam,
    currentPrice,
    computedAt,
    summary,
    indicators: {
      sma: {
        sma10: sma10Points,
        sma30: sma30Points,
        sma50: sma50Points,
      },
      rsi: rsiPoints,
      macd: macdPoints,
      bollinger: bollingerPoints,
      stochastic: stochasticPoints,
      atr: atrPoints,
    },
    supportResistance,
    priceHistory: ohlcData,
  }

  cache.set(cacheKey, { data: result, timestamp: Date.now() })

  return NextResponse.json(result)
}
