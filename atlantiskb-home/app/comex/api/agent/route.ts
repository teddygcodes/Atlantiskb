import { auth } from '@clerk/nextjs/server'
import { METAL_KEYS, type MetalKey } from '@/lib/comex/constants'
import { buildRAGContext, type RetrievalMode } from '@/lib/comex/rag'
import { getComexSchemaReadiness } from '@/lib/comex/schema-readiness'
import { db } from '@/lib/db'
import { computeTechnicalSummary } from '@/lib/comex/technical-indicators'
import type { OHLC } from '@/lib/comex/technical-indicators'

type SetupStage = 'auth' | 'validation' | 'config' | 'embedding' | 'vector_retrieval' | 'anthropic'
type ErrorCode =
  | 'auth_error'
  | 'validation_error'
  | 'config_error'
  | 'embedding_error'
  | 'retrieval_error'
  | 'retrieval_fallback'
  | 'retrieval_prices'
  | 'retrieval_events'
  | 'anthropic_error'

interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  question?: unknown
  history?: unknown
  metal?: unknown
}

interface ErrorResponseOptions {
  detail?: string
  code: ErrorCode
  requestId: string
}

function normalizeQuestion(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 500)
}

function resolveMetals(metal: unknown): MetalKey[] {
  if (typeof metal !== 'string') return METAL_KEYS
  return METAL_KEYS.includes(metal as MetalKey) ? [metal as MetalKey] : METAL_KEYS
}

function normalizeHistory(history: unknown): HistoryTurn[] {
  if (!Array.isArray(history)) return []

  return history
    .map((turn): HistoryTurn | null => {
      if (!turn || typeof turn !== 'object') return null
      const role = (turn as { role?: unknown }).role
      const content = (turn as { content?: unknown }).content
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
      const trimmed = content.trim()
      if (!trimmed) return null
      return { role, content: trimmed.slice(0, 4000) }
    })
    .filter((turn): turn is HistoryTurn => turn !== null)
}

function buildSystemPrompt(contextJson: string, technicalContext?: string): string {
  const technicalSection = technicalContext ?? ''
  return `You are an internal COMEX pricing desk for Atlantiskb. Sales reps use your answers before quoting jobs. They need fast, specific numbers — not analysis essays.

RESPONSE FORMAT (required for every price/forecast question):
Lead with the number on line 1. Then one sentence on direction. Then confidence. Done.

Example format:
Copper: $5.37/lb now → ~$5.25-5.45/lb next Wednesday. Sideways to slightly soft, 30-day downtrend still in play. Confidence: low.

Aluminum: $3,127/ton now → ~$3,100-3,200/ton next Wednesday. Grinding higher, supply tightness driving momentum. Confidence: medium.

TECHNICAL ANALYSIS:
When asked about technical indicators, explain simply and directly using these patterns:
- RSI > 70: "Copper is overbought — could see a pullback."
- RSI < 30: "Copper is oversold — watch for a bounce."
- RSI 30-70: "RSI is neutral at {value} — no extreme signal."
- MACD histogram positive: "Momentum is building."
- MACD histogram negative: "Momentum is fading."
- Price near Bollinger upper band: "Price is at the top of its recent range."
- Price near Bollinger lower band: "Price is at the bottom of its recent range."
- Narrow Bollinger bands (bandwidth < 0.05): "Volatility is compressed — a big move is likely coming, direction unclear."
- SMA10 > SMA30 > SMA50: "Short-term trend is bullish — all moving averages aligned upward."
- SMA10 < SMA30 < SMA50: "Short-term trend is bearish — all moving averages aligned downward."

DISTINGUISH between three answer types:
1. DESCRIPTIVE (what data shows right now): State facts directly. No hedging. E.g. "RSI is 42, neutral."
2. CONDITIONAL (if/then levels): Frame as levels to watch. E.g. "If copper holds above $5.15, the base case holds. Break below that, watch $4.98."
3. SCENARIO OUTLOOK (where price might go): Present as bull/base/bear with catalysts. Never assign probability percentages. Always end with "Not financial or purchasing advice."

When asked about "should I lock in pricing", "should I buy now", or similar purchasing decisions:
- Give the technical picture (descriptive)
- State key levels to watch (conditional)
- Note the overall technical signal
- End with: "Not financial or purchasing advice."

FORMAT for scenario outlook responses (when you receive scenario data in context):
{Metal} scenario outlook ({date}):
Current: \${price}/lb | Technical bias: {bias}

              1 week        30 day        90 day
Bull:         \${range}      \${range}      \${range}
Base:         \${range}      \${range}      \${range}
Bear:         \${range}      \${range}      \${range}

Key levels: Support \${level} | Resistance \${level}

Bull catalyst: {catalyst}
Bear catalyst: {catalyst}

{1-2 sentence summary}
Not financial or purchasing advice.

Keep it tight. No essays. Lead with numbers.

Rules:
1. First line = current price + near-term range. Always. No exceptions.
2. 3–4 sentences max per metal. No paragraphs.
3. Only add context if it materially changes the forecast (e.g., "tariff announcement could spike copper $0.20+"). Skip macro color that doesn't move the number.
4. Confidence label is required: high / medium / low. One word only.
5. No hedging phrases: no "may go up or down", no "cannot be confirmed", no "consult a professional", no "it's important to note".
6. If data is thin, give a low-confidence range. Only skip the range if context is completely unusable.
7. If sources are available, keep the existing [SOURCES]...[/SOURCES] block format for the UI.
8. End with: *Not financial advice.*

Context:
${contextJson}${technicalSection}`
}

function getRequestId(req: Request): string {
  const incoming = req.headers.get('x-request-id')?.trim()
  if (incoming) return incoming.slice(0, 128)
  return crypto.randomUUID()
}

function shouldExposeDetail(userId: string | null): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (!userId) return false

  const adminIds = (process.env.COMEX_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return adminIds.includes(userId)
}

function sanitizeDetail(detail: string): string {
  return detail.replace(/\s+/g, ' ').trim().slice(0, 400)
}

function resolveRetrievalStage(detail?: string): { stage: SetupStage; code: ErrorCode } {
  if (!detail) return { stage: 'vector_retrieval', code: 'retrieval_error' }
  const normalized = detail.toLowerCase()
  if (detail.startsWith('Fallback retrieval failed:')) return { stage: 'vector_retrieval', code: 'retrieval_fallback' }
  if (normalized.includes('vector dimensions') || normalized.includes('different vector dimensions')) {
    return { stage: 'vector_retrieval', code: 'retrieval_fallback' }
  }
  if (detail.startsWith('Price history retrieval failed:')) return { stage: 'vector_retrieval', code: 'retrieval_prices' }
  if (detail.startsWith('Large event retrieval failed:')) return { stage: 'vector_retrieval', code: 'retrieval_events' }
  return { stage: 'vector_retrieval', code: 'retrieval_error' }
}

function jsonError(
  status: number,
  stage: SetupStage,
  message: string,
  { detail, code, requestId }: ErrorResponseOptions,
): Response {
  return new Response(JSON.stringify({ error: message, stage, code, requestId, detail }), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  })
}

function logStageError(stage: SetupStage, error: unknown, extras?: Record<string, unknown>): void {
  console.error('[comex-agent] setup failure', {
    stage,
    error,
    ...extras,
  })
}

function getRuntimeConfig(): {
  anthropicApiKey: string
  hasVoyageApiKey: boolean
  hasDatabaseUrl: boolean
  hasDirectUrl: boolean
} {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const hasVoyageApiKey = Boolean(process.env.VOYAGE_API_KEY)
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
  const hasDirectUrl = Boolean(process.env.DIRECT_URL)

  return { anthropicApiKey, hasVoyageApiKey, hasDatabaseUrl, hasDirectUrl }
}

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  let userId: string | null = null

  try {
    const authResult = await auth()
    userId = authResult.userId
  } catch (error) {
    logStageError('auth', error, { requestId })
    return jsonError(500, 'auth', 'Request failed. Please try again later.', {
      code: 'auth_error',
      requestId,
    })
  }

  if (!userId) {
    return jsonError(401, 'auth', 'Request failed. Please try again later.', {
      code: 'auth_error',
      requestId,
    })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch (error) {
    logStageError('validation', error, { requestId, userId })
    return jsonError(400, 'validation', 'Request failed. Please try again later.', {
      code: 'validation_error',
      requestId,
    })
  }

  const question = normalizeQuestion(body.question)
  if (!question) {
    return jsonError(400, 'validation', 'Request failed. Please try again later.', {
      code: 'validation_error',
      requestId,
    })
  }

  const { anthropicApiKey, hasVoyageApiKey, hasDatabaseUrl, hasDirectUrl } = getRuntimeConfig()
  if (!anthropicApiKey) {
    logStageError('config', new Error('ANTHROPIC_API_KEY is missing'), { requestId, userId })
    return jsonError(500, 'config', 'Request failed. Please try again later.', {
      code: 'config_error',
      requestId,
    })
  }

  if (!hasVoyageApiKey) {
    logStageError('config', new Error('VOYAGE_API_KEY is missing; semantic retrieval will be skipped'), { requestId, userId })
  }

  if (!hasDatabaseUrl && !hasDirectUrl) {
    logStageError('config', new Error('DATABASE_URL and DIRECT_URL are both missing'), { requestId, userId })
  }

  const metals = resolveMetals(body.metal)
  const history = normalizeHistory(body.history)
  const schemaReadiness = await getComexSchemaReadiness()

  // Detect technical analysis questions — inject indicator data if relevant
  const TECHNICAL_KEYWORDS = ['rsi', 'macd', 'bollinger', 'support', 'resistance', 'overbought', 'oversold', 'trend', 'moving average', 'sma', 'ema', 'stochastic', 'atr', 'volatility', 'technical', 'indicator', 'breakout', 'breakdown', 'level']
  const isTechnicalQuestion = TECHNICAL_KEYWORDS.some(kw => question.toLowerCase().includes(kw))

  let technicalContext = ''
  if (isTechnicalQuestion) {
    try {
      const technicalData = await Promise.all(
        metals.map(async (metal) => {
          const rows = await db.commodityPrice.findMany({
            where: { metal },
            orderBy: { settlementDate: 'desc' },
            take: 365,
          })
          const ohlcData: OHLC[] = rows.reverse().map(row => ({
            date: row.settlementDate.toISOString().slice(0, 10),
            open: row.open ?? null,
            high: row.high ?? null,
            low: row.low ?? null,
            close: row.close,
          }))
          if (ohlcData.length === 0) return null
          const summary = computeTechnicalSummary(ohlcData, metal)
          return { metal, summary }
        })
      )

      const validData = technicalData.filter(Boolean)
      if (validData.length > 0) {
        technicalContext = '\n\nCURRENT TECHNICAL DATA:\n' + validData.map(d => {
          const s = d!.summary
          return `${d!.metal.toUpperCase()}:
  Price: $${s.currentPrice} | Trend: ${s.trendDirection} | Overall signal: ${s.overallSignal}
  RSI(14): ${s.rsi14 ?? 'N/A'} (${s.rsiSignal}) | MACD: ${s.macdSignal} | Bollinger: ${s.bollingerPosition}
  Support: ${s.support.join(', ') || 'N/A'} | Resistance: ${s.resistance.join(', ') || 'N/A'}
  ATR(14): ${s.atr14 ?? 'N/A'} | Volatility: ${s.volatility}`
        }).join('\n\n')
      }
    } catch {
      // If technical data fails, continue without it — don't block the response
    }
  }

  let ragContext
  let retrievalMode: RetrievalMode = 'none'
  if (schemaReadiness.degraded) {
    ragContext = {
      question,
      articles: [],
      prices: {
        copper: {
          metal: 'copper' as const,
          current: null,
          change30dPct: null,
          change90dPct: null,
          recentLargeEvents: [],
        },
        aluminum: {
          metal: 'aluminum' as const,
          current: null,
          change30dPct: null,
          change90dPct: null,
          recentLargeEvents: [],
        },
      },
    }
    retrievalMode = 'none'
  } else {
    try {
      const ragResult = await buildRAGContext(question, metals)
      ragContext = ragResult.context
      retrievalMode = ragResult.retrievalMode
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined
      const stageAndCode = detail?.startsWith('Embedding generation failed:')
        ? { stage: 'embedding' as const, code: 'embedding_error' as const }
        : resolveRetrievalStage(detail)

      logStageError(stageAndCode.stage, error, {
        requestId,
        userId,
        code: stageAndCode.code,
        metals,
        questionLength: question.length,
      })

      const clientDetail = shouldExposeDetail(userId) && detail ? sanitizeDetail(detail) : undefined
      return jsonError(500, stageAndCode.stage, 'Request failed. Please try again later.', {
        code: stageAndCode.code,
        requestId,
        detail: clientDetail,
      })
    }
  }

  const system = buildSystemPrompt(JSON.stringify(ragContext, null, 2), technicalContext || undefined)

  const messages = [
    ...history.slice(-6).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: question },
  ]

  let anthropicResponse: globalThis.Response
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
        max_tokens: 2048,
        stream: true,
        system,
        messages,
      }),
    })
  } catch (error) {
    logStageError('anthropic', error, { requestId, userId })
    return jsonError(502, 'anthropic', 'Request failed. Please try again later.', {
      code: 'anthropic_error',
      requestId,
      detail: shouldExposeDetail(userId) && error instanceof Error ? sanitizeDetail(error.message) : undefined,
    })
  }

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errorText = await anthropicResponse.text()
    logStageError('anthropic', new Error('Anthropic request failed'), {
      requestId,
      userId,
      status: anthropicResponse.status,
      detail: errorText,
    })

    return jsonError(502, 'anthropic', 'Request failed. Please try again later.', {
      code: 'anthropic_error',
      requestId,
      detail: shouldExposeDetail(userId) ? sanitizeDetail(`status=${anthropicResponse.status} ${errorText}`) : undefined,
    })
  }

  return new Response(anthropicResponse.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-comex-schema-ready': String(schemaReadiness.ready),
      'x-comex-agent-mode': schemaReadiness.degraded ? 'degraded' : 'normal',
      'x-comex-retrieval-mode': retrievalMode,
      'x-request-id': requestId,
    },
  })
}
