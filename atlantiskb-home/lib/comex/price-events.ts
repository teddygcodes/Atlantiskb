codex/create-price-events.ts-for-price-syncing
import { NewsMetal, PriceDirection, PriceMagnitude } from '@prisma/client'
import { db } from '@/lib/db'

const NEWS_METALS = new Set<string>(Object.values(NewsMetal))

function toNewsMetal(metal: string): NewsMetal {
  if (NEWS_METALS.has(metal)) {
    return metal as NewsMetal
  }

  throw new Error(`Invalid metal for PriceEvent: ${metal}`)
}

export async function syncPriceEvents(metal: string): Promise<void> {
  const eventMetal = toNewsMetal(metal)
  const prices = await db.commodityPrice.findMany({
    where: { metal },
    orderBy: { settlementDate: 'asc' },
  })

  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1]
    const curr = prices[i]

    if (prev.close === 0) {
      continue
    }

    const changePercent = ((curr.close - prev.close) / prev.close) * 100

    if (Math.abs(changePercent) < 1) {
      await db.priceEvent.deleteMany({
        where: {
          metal: eventMetal,
          date: curr.settlementDate,
        },
      })
      continue
    }

    const direction =
      changePercent >= 0 ? PriceDirection.up : PriceDirection.down
    const magnitude =
      Math.abs(changePercent) >= 2 ? PriceMagnitude.large : PriceMagnitude.medium

    await db.priceEvent.upsert({
      where: {
        metal_date: {
          metal: eventMetal,
          date: curr.settlementDate,
        },
      },
      create: {
        metal: eventMetal,
        date: curr.settlementDate,
        close: curr.close,
        prevClose: prev.close,
        changePercent,
        direction,
        magnitude,
      },
      update: {
        close: curr.close,
        prevClose: prev.close,
        changePercent,
        direction,
        magnitude,
      },
    })
=======
import type { NewsMetal, Prisma } from '@prisma/client'

export function buildPriceEventCreateManyInput(
  metal: NewsMetal,
  previousClose: number,
  currentClose: number,
  date: Date,
): Prisma.PriceEventCreateManyInput | null {
  if (!Number.isFinite(previousClose) || !Number.isFinite(currentClose) || previousClose === 0) {
    return null
  }

  const changePercent = ((currentClose - previousClose) / previousClose) * 100
  const absoluteChangePercent = Math.abs(changePercent)

  if (absoluteChangePercent < 1) {
    return null
  }

  return {
    metal,
    date,
    direction: changePercent >= 0 ? 'up' : 'down',
    magnitude: absoluteChangePercent >= 3 ? 'large' : 'medium',
 main
  }
}
