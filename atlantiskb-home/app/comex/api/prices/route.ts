import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { METAL_KEYS } from '@/lib/comex/constants'
import { computeMA } from '@/lib/comex/moving-average'
import { linearRegression } from '@/lib/comex/predictions'
import type { DailyPrice } from '@/lib/comex/fetch-prices'

/**
 * GET /comex/api/prices
 * Returns last 365 days of price history + MA30 + 30/60/90-day predictions for each metal.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date()
  since.setDate(since.getDate() - 365)

  const response: Record<string, unknown> = {}

  for (const metal of METAL_KEYS) {
    const rows = await db.commodityPrice.findMany({
      where: { metal, settlementDate: { gte: since } },
      orderBy: { settlementDate: 'asc' },
      select: { settlementDate: true, open: true, high: true, low: true, close: true },
    })

    const history: DailyPrice[] = rows.map((r) => ({
      date: r.settlementDate.toISOString().slice(0, 10),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }))

    const ma30 = computeMA(history, 30)
    const predictions = linearRegression(history)

    response[metal] = { history, ma30, predictions }
  }

  return NextResponse.json(response)
}
