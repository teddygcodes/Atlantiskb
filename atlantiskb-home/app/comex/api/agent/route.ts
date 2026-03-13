import { auth } from '@clerk/nextjs/server'
import { METAL_KEYS, type MetalKey } from '@/lib/comex/constants'
import { buildRAGContext } from '@/lib/comex/rag'

type SetupStage = 'auth' | 'validation' | 'config' | 'embedding' | 'vector_retrieval' | 'anthropic'

interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  question?: unknown
  history?: unknown
  metal?: unknown
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

function jsonError(status: number, stage: SetupStage, message: string, detail?: string): Response {
  return new Response(JSON.stringify({ error: message, stage, detail }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function logStageError(stage: SetupStage, error: unknown, extras?: Record<string, unknown>): void {
  console.error('[comex-agent] setup failure', {
    stage,
    error,
    ...extras,
  })
}

function getRuntimeConfig(): { anthropicApiKey: string; hasDatabaseUrl: boolean; hasDirectUrl: boolean } {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
  const hasDirectUrl = Boolean(process.env.DIRECT_URL)

  return { anthropicApiKey, hasDatabaseUrl, hasDirectUrl }
}

export async function POST(req: Request): Promise<Response> {
  let userId: string | null = null
  try {
    const authResult = await auth()
    userId = authResult.userId
  } catch (error) {
    logStageError('auth', error)
    return jsonError(500, 'auth', 'Auth failed during request setup')
  }

  if (!userId) {
    return jsonError(401, 'auth', 'Unauthorized')
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch (error) {
    logStageError('validation', error)
    return jsonError(400, 'validation', 'Invalid JSON body')
  }

  const question = normalizeQuestion(body.question)
  if (!question) {
    return jsonError(400, 'validation', 'Question is required')
  }

  const { anthropicApiKey, hasDatabaseUrl, hasDirectUrl } = getRuntimeConfig()
  if (!anthropicApiKey) {
    logStageError('config', new Error('ANTHROPIC_API_KEY is missing'))
    return jsonError(500, 'config', 'ANTHROPIC_API_KEY is not configured')
  }

  if (!hasDatabaseUrl && !hasDirectUrl) {
    logStageError('config', new Error('DATABASE_URL and DIRECT_URL are both missing'))
  }

  const metals = resolveMetals(body.metal)
  const history = normalizeHistory(body.history)
  let ragContext
  try {
    ragContext = await buildRAGContext(question, metals)
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined
    const stage = detail?.startsWith('Embedding generation failed:') ? 'embedding' : 'vector_retrieval'
    logStageError(stage, error, { metals, questionLength: question.length })
    return jsonError(500, stage, 'Failed to build retrieval context', detail)
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
    logStageError('anthropic', error, { userId })
    return jsonError(502, 'anthropic', 'Anthropic request threw before receiving a response', error instanceof Error ? error.message : undefined)
  }

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errorText = await anthropicResponse.text()
    logStageError('anthropic', new Error('Anthropic request failed'), {
      status: anthropicResponse.status,
      detail: errorText,
    })

    return jsonError(502, 'anthropic', 'Anthropic request failed', `status=${anthropicResponse.status} ${errorText}`)
  }

  return new Response(anthropicResponse.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
