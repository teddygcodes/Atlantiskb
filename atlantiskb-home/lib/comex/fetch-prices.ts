export interface DailyPrice {
  date: string // YYYY-MM-DD
  open: number | null
  high: number | null
  low: number | null
  close: number
}

/**
 * Fetch daily OHLC price history from Yahoo Finance unofficial API.
 * Returns up to 400 days of trading days. Filters rows where close is null.
 */
export async function fetchYahooPrices(symbol: string): Promise<DailyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=400d`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return []

    const data = await res.json()
    const chart = data?.chart?.result?.[0]
    if (!chart) return []

    const timestamps: number[] = chart.timestamp ?? []
    const quotes = chart.indicators?.quote?.[0] ?? {}
    const opens: (number | null)[] = quotes.open ?? []
    const highs: (number | null)[] = quotes.high ?? []
    const lows: (number | null)[] = quotes.low ?? []
    const closes: (number | null)[] = quotes.close ?? []

    const prices: DailyPrice[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (close == null) continue
      const d = new Date(timestamps[i] * 1000)
      const date = d.toISOString().slice(0, 10)
      prices.push({
        date,
        open: opens[i] ?? null,
        high: highs[i] ?? null,
        low: lows[i] ?? null,
        close,
      })
    }

    return prices
  } catch {
    return []
  }
}
