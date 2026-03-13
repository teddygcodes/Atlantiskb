import { NewsMetal, PriceDirection, PriceMagnitude } from '@prisma/client'
import { db } from '@/lib/db'

export async function syncPriceEvents(metal: string): Promise<void> {
  const eventMetal = metal as NewsMetal
  const prices = await db.commodityPrice.findMany({
    where: { metal },
    orderBy: { settlementDate: 'asc' },
  })

  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1]
    const curr = prices[i]

    if (!prev || prev.close === 0) {
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
  }
}
