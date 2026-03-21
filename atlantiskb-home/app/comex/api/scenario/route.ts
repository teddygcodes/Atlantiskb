import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { computeTechnicalSummary } from '@/lib/comex/technical-indicators'
import type { OHLC } from '@/lib/comex/technical-indicators'
import type { ScenarioData } from '@/lib/comex/types'

// ---------------------------------------------------------------------------
// POST /comex/api/scenario
// Body: { metal: 'copper' | 'aluminum' }
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  id: string
  type: string
  role: string
  content: Array<{ type: string; text: string }>
  model: string
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Validate body
  let body: { metal?: unknown }
  try {
    body = (await request.json()) as { metal?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { metal } = body
  if (metal !== 'copper' && metal !== 'aluminum') {
    return NextResponse.json(
      { error: 'Invalid metal. Must be "copper" or "aluminum".' },
      { status: 400 }
    )
  }

  // 3. Fetch last 365 OHLC rows from DB
  const rows = (
    await db.commodityPrice.findMany({
      where: { metal },
      orderBy: { settlementDate: 'desc' },
      take: 365,
    })
  ).reverse()

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_price_data' }, { status: 404 })
  }

  // 4. Map to OHLC array
  const ohlcData: OHLC[] = rows.map((row) => ({
    date: row.settlementDate.toISOString().slice(0, 10),
    open: row.open ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    close: row.close,
  }))

  // 5. Compute technical summary
  const summary = computeTechnicalSummary(ohlcData, metal)

  // 6. Fetch recent news (last 7 days, for this metal or 'both')
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentNews = await db.newsArticle.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      metal: { in: [metal, 'both'] },
    },
    orderBy: { publishedAt: 'desc' },
    take: 10,
  })

  // 7. Build news snippets string
  const newsSnippets =
    recentNews.length > 0
      ? recentNews.map((a) => `- ${a.headline} (${a.source})`).join('\n')
      : 'No recent news available.'

  // 8. Build the Claude prompt
  const prompt = `You are a commodities analyst generating a scenario outlook for ${metal} futures.

This is a scenario analysis, NOT a calibrated prediction. Do not assign probability percentages — just label scenarios as bull/base/bear.

Current technical data:
- Price: $${summary.currentPrice}
- SMA alignment: 10-day ${summary.sma10 ?? 'N/A'} | 30-day ${summary.sma30 ?? 'N/A'} | 50-day ${summary.sma50 ?? 'N/A'} → trend: ${summary.trendDirection}
- RSI(14): ${summary.rsi14 ?? 'N/A'} — ${summary.rsiSignal}
- MACD histogram: ${summary.macdHistogram ?? 'N/A'} — ${summary.macdSignal}
- Stochastic %K: ${summary.stochasticK ?? 'N/A'} — ${summary.stochasticSignal}
- Bollinger position: ${summary.bollingerPosition} (bandwidth: ${summary.bollingerBandwidth ?? 'N/A'})
- ATR(14): ${summary.atr14 ?? 'N/A'} — volatility: ${summary.volatility}
- Support: ${summary.support.join(', ') || 'N/A'}
- Resistance: ${summary.resistance.join(', ') || 'N/A'}
- Overall technical signal: ${summary.overallSignal}
- Technical confidence: ${summary.confidence}

Recent news:
${newsSnippets}

Generate a scenario outlook. Return ONLY valid JSON (no markdown, no explanation):
{
  "metal": "${metal}",
  "currentPrice": ${summary.currentPrice},
  "asOfDate": "${new Date().toISOString().slice(0, 10)}",
  "scenarios": {
    "bull": {
      "1week": { "low": number, "high": number },
      "30day": { "low": number, "high": number },
      "90day": { "low": number, "high": number },
      "catalyst": "string"
    },
    "base": {
      "1week": { "low": number, "high": number },
      "30day": { "low": number, "high": number },
      "90day": { "low": number, "high": number },
      "catalyst": "string"
    },
    "bear": {
      "1week": { "low": number, "high": number },
      "30day": { "low": number, "high": number },
      "90day": { "low": number, "high": number },
      "catalyst": "string"
    }
  },
  "keyLevels": {
    "strongSupport": number,
    "support": number,
    "resistance": number,
    "strongResistance": number
  },
  "technicalBias": "string",
  "newsSentiment": "bullish" | "bearish" | "mixed" | "neutral",
  "summary": "string"
}

Base scenario ranges on: current ATR for short-term ranges, Bollinger bandwidth for medium-term, support/resistance levels for boundaries. Do NOT invent catalysts not supported by the news context.`

  // 9. Call Anthropic API (non-streaming)
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!anthropicApiKey) {
    return NextResponse.json({ error: 'scenario_generation_failed' }, { status: 500 })
  }

  let anthropicResponse: Response
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    console.error('[comex-scenario] Anthropic fetch error', err)
    return NextResponse.json({ error: 'scenario_generation_failed' }, { status: 500 })
  }

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text()
    console.error('[comex-scenario] Anthropic error', anthropicResponse.status, errorText)
    return NextResponse.json({ error: 'scenario_generation_failed' }, { status: 500 })
  }

  const anthropicData = (await anthropicResponse.json()) as AnthropicMessage
  const rawText = anthropicData.content?.[0]?.text ?? ''

  // 10. Parse JSON response
  let scenarioData: ScenarioData
  try {
    // Strip any accidental markdown code fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    scenarioData = JSON.parse(cleaned) as ScenarioData
  } catch (err) {
    console.error('[comex-scenario] JSON parse error', err, rawText.slice(0, 500))
    return NextResponse.json({ error: 'scenario_generation_failed' }, { status: 500 })
  }

  return NextResponse.json(scenarioData)
}
