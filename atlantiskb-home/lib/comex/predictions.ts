import type { DailyPrice } from './fetch-prices'

export interface Prediction {
  days: number
  date: string
  price: number
}

/**
 * Ordinary least squares linear regression on close prices.
 * Uses index as x-axis. Requires at least 14 data points.
 * Returns 30, 60, and 90-day forward projections.
 */
export function linearRegression(prices: DailyPrice[]): Prediction[] {
  if (prices.length < 14) return []

  const n = prices.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += prices[i].close
    sumXY += i * prices[i].close
    sumX2 += i * i
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return []

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const lastDate = new Date(prices[n - 1].date)
  const horizons = [30, 60, 90]

  return horizons.map((days) => {
    const futureX = n - 1 + days
    const price = intercept + slope * futureX
    const futureDate = new Date(lastDate)
    futureDate.setDate(futureDate.getDate() + days)
    return {
      days,
      date: futureDate.toISOString().slice(0, 10),
      price: Math.max(0, price),
    }
  })
}
