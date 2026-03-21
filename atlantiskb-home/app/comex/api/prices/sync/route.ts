import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { METAL_KEYS, METAL_CONFIG } from '@/lib/comex/constants'
import { fetchYahooPrices } from '@/lib/comex/fetch-prices'

/**
 * GET /comex/api/prices/sync
 * Fetches price history from Yahoo Finance and upserts into CommodityPrice.
 * Allowed by: Vercel cron (CRON_SECRET bearer token) or authenticated Clerk user.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`
  if (!isCron) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const results: Array<{ metal: string; upserted: number; error?: string }> = []

  for (const metal of METAL_KEYS) {
    const { symbol } = METAL_CONFIG[metal]
    try {
      const prices = await fetchYahooPrices(symbol)

      if (prices.length === 0) {
        results.push({ metal, upserted: 0, error: 'No prices returned from Yahoo Finance' })
        continue
      }

      // Bulk insert new rows (skips existing rows on unique constraint).
      // Historical settlement prices are stable so skipDuplicates is safe for old data.
      const { count } = await db.commodityPrice.createMany({
        data: prices.map((price) => ({
          metal,
          sourceSymbol: symbol,
          close: price.close,
          open: price.open ?? undefined,
          high: price.high ?? undefined,
          low: price.low ?? undefined,
          settlementDate: new Date(price.date),
        })),
        skipDuplicates: true,
      })

      // Also upsert the most recent row — today's settlement may still be updating.
      const latest = prices[prices.length - 1]
      await db.commodityPrice.upsert({
        where: { metal_settlementDate: { metal, settlementDate: new Date(latest.date) } },
        create: {
          metal,
          sourceSymbol: symbol,
          close: latest.close,
          open: latest.open ?? undefined,
          high: latest.high ?? undefined,
          low: latest.low ?? undefined,
          settlementDate: new Date(latest.date),
        },
        update: {
          close: latest.close,
          open: latest.open ?? undefined,
          high: latest.high ?? undefined,
          low: latest.low ?? undefined,
        },
      })

      results.push({ metal, upserted: count + 1 })
    } catch (err) {
      results.push({
        metal,
        upserted: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ ok: true, results })
}
