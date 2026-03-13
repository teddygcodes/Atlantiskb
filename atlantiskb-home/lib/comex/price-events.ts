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
  }
}
