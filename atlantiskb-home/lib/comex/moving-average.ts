import type { DailyPrice } from './fetch-prices'

export interface MAPoint {
  date: string
  ma: number
}

/**
 * Compute a simple moving average over close prices.
 * Returns one MAPoint per data point where enough history exists (i >= window - 1).
 */
export function computeMA(prices: DailyPrice[], window = 30): MAPoint[] {
  if (prices.length < window) return []

  const result: MAPoint[] = []
  for (let i = window - 1; i < prices.length; i++) {
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) {
      sum += prices[j].close
    }
    result.push({ date: prices[i].date, ma: sum / window })
  }
  return result
}
