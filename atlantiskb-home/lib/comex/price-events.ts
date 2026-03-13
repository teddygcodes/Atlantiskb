import { NewsMetal, PriceDirection, PriceMagnitude } from '@prisma/client'
import { db } from '@/lib/db'

export async function syncPriceEvents(metal: string): Promise<void> {
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
      continue
    }

    const direction =
      changePercent >= 0 ? PriceDirection.up : PriceDirection.down
    const magnitude =
      Math.abs(changePercent) >= 2 ? PriceMagnitude.large : PriceMagnitude.medium

    await db.priceEvent.upsert({
      where: {
        metal_date: {
          metal: metal as NewsMetal,
          date: curr.settlementDate,
        },
      },
      create: {
        metal: metal as NewsMetal,
        date: curr.settlementDate,
        close: curr.close,
        prevClose: prev.close,
        change: changePercent,
        direction,
        magnitude,
      },
      update: {
        close: curr.close,
        prevClose: prev.close,
        change: changePercent,
        direction,
        magnitude,
      },
    })
  }
}
