import { auth } from '@clerk/nextjs/server'
import { METAL_KEYS, type MetalKey } from '@/lib/comex/constants'
import { buildRAGContext } from '@/lib/comex/rag'

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

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const body = (await req.json()) as RequestBody
  const question = normalizeQuestion(body.question)
  if (!question) {
    return new Response(JSON.stringify({ error: 'Question is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const metals = resolveMetals(body.metal)
  const history = normalizeHistory(body.history)
  const ragContext = await buildRAGContext(question, metals)
  const system = buildSystemPrompt(JSON.stringify(ragContext, null, 2))

  const messages = [
    ...history.slice(-6).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: question },
  ]

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
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

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errorText = await anthropicResponse.text()
    return new Response(
      JSON.stringify({ error: 'Anthropic request failed', status: anthropicResponse.status, detail: errorText }),
      {
        status: 502,
        headers: { 'content-type': 'application/json' },
      },
    )
  }

  return new Response(anthropicResponse.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
