import { auth } from '@clerk/nextjs/server'
import { METAL_KEYS, type MetalKey } from '@/lib/comex/constants'
import { buildRAGContext, type RetrievalMode } from '@/lib/comex/rag'
import { getComexSchemaReadiness } from '@/lib/comex/schema-readiness'

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

function buildSystemPrompt(contextJson: string): string {
  return `You are Atlantiskb's COMEX market assistant. You must answer using only the provided context.

MANDATORY REQUIREMENTS (NO EXCEPTIONS):
1) Include this exact disclaimer sentence in every answer: "Disclaimer: This is informational only and not financial advice."
2) Include a source block in this exact format at the end of every answer:
[SOURCES]
- <source 1>
- <source 2>
[/SOURCES]
3) Every listed source must come from the provided context URLs. Do not invent sources.
4) If context is insufficient, clearly say so while still including the disclaimer and source block.
5) Keep the answer concise and factual.

Context JSON:
${contextJson}`
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

  const system = buildSystemPrompt(JSON.stringify(ragContext, null, 2))

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
