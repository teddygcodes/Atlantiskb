import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { embedText } from '@/lib/comex/embeddings'
import { METAL_KEYS, type MetalKey } from '@/lib/comex/constants'

interface SimilarityRow {
  id: string
  snippet: string
  url: string
  metal: MetalKey | 'both'
  publishedAt: Date
  similarity: number
}

interface PriceEventRow {
  id: string
  metal: MetalKey | 'both'
  date: Date
  direction: 'up' | 'down'
  magnitude: 'medium' | 'large'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isMissingRelationError(error: unknown, relation: string): boolean {
  const message = getErrorMessage(error)
  return message.includes(`relation "${relation}" does not exist`)
}

export interface RetrievedArticle {
  id: string
  snippet: string
  url: string
  metal: MetalKey | 'both'
  publishedAt: string
  similarity: number
  relatedEvents: Array<{
    id: string
    metal: MetalKey | 'both'
    date: string
    direction: 'up' | 'down'
    magnitude: 'medium' | 'large'
  }>
}

export interface PriceSummary {
  metal: MetalKey
  current: number | null
  change30dPct: number | null
  change90dPct: number | null
  recentLargeEvents: Array<{
    id: string
    date: string
    direction: 'up' | 'down'
    magnitude: 'large'
  }>
}

export interface RAGContext {
  question: string
  articles: RetrievedArticle[]
  prices: Record<MetalKey, PriceSummary>
}

const FALLBACK_RECENCY_DAYS = 30
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'aluminum', 'also', 'among', 'because', 'been', 'before',
  'between', 'comex', 'could', 'copper', 'does', 'from', 'have', 'into', 'just', 'market', 'metal',
  'more', 'news', 'price', 'prices', 'should', 'their', 'there', 'these', 'this', 'those', 'under',
  'what', 'when', 'where', 'which', 'while', 'would',
])

function toVectorLiteral(embedding: number[]): string {
  const clean = embedding.filter((value) => Number.isFinite(value))
  return `[${clean.join(',')}]`
}

function pctChange(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null
  return ((current - baseline) / baseline) * 100
}

function subDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() - days)
  return next
}

function extractQuestionKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))

  return [...new Set(words)].slice(0, 6)
}

async function fetchRelatedEvents(activeMetals: MetalKey[], articleDate: Date, articleId: string): Promise<PriceEventRow[]> {
  const windowStart = subDays(articleDate, 3)
  const windowEnd = new Date(articleDate)
  windowEnd.setDate(windowEnd.getDate() + 3)

  try {
    return await db.$queryRaw<PriceEventRow[]>(Prisma.sql`
      SELECT
        "id",
        "metal",
        "date",
        "direction",
        "magnitude"
      FROM "PriceEvent"
      WHERE "metal" IN (${Prisma.join(activeMetals)})
        AND "date" BETWEEN ${windowStart} AND ${windowEnd}
      ORDER BY "date" DESC
    `)
  } catch (error) {
    if (isMissingRelationError(error, 'PriceEvent')) {
      console.warn('[comex-rag] PriceEvent relation is missing. Returning article without related events.', {
        articleId,
      })
      return []
    }

    console.error('[comex-rag] related events retrieval failed; returning article without related events', {
      error,
      articleId,
    })
    return []
  }
}

async function buildRetrievedArticles(similarRows: SimilarityRow[], activeMetals: MetalKey[]): Promise<RetrievedArticle[]> {
  const articles: RetrievedArticle[] = []

  for (const row of similarRows) {
    const relatedEvents = await fetchRelatedEvents(activeMetals, row.publishedAt, row.id)

    articles.push({
      id: row.id,
      snippet: row.snippet,
      url: row.url,
      metal: row.metal,
      publishedAt: row.publishedAt.toISOString(),
      similarity: Number(row.similarity.toFixed(4)),
      relatedEvents: relatedEvents.map((event) => ({
        id: event.id,
        metal: event.metal,
        date: event.date.toISOString(),
        direction: event.direction,
        magnitude: event.magnitude,
      })),
    })
  }

  return articles
}

async function fetchFallbackRows(question: string, activeMetals: MetalKey[]): Promise<SimilarityRow[]> {
  const since = subDays(new Date(), FALLBACK_RECENCY_DAYS)
  const keywords = extractQuestionKeywords(question)
  const metalFilter = [...activeMetals, 'both'] as Array<MetalKey | 'both'>

  const articleSelect = {
    id: true,
    snippet: true,
    url: true,
    metal: true,
    publishedAt: true,
  } as const

  let candidateRows: Array<{
    id: string
    snippet: string
    url: string
    metal: string
    publishedAt: Date
  }> = []

  try {
    candidateRows = await db.newsArticle.findMany({
      where: {
        metal: { in: metalFilter },
        publishedAt: { gte: since },
      },
      orderBy: { publishedAt: 'desc' },
      select: articleSelect,
      take: 24,
    })
  } catch (error) {
    if (isMissingRelationError(error, 'NewsArticle')) {
      console.warn('[comex-rag] NewsArticle relation is missing. Degrading to empty article context.', {
        activeMetals,
        strategy: 'fallback_recent',
      })
      return []
    }

    throw error
  }

  if (candidateRows.length === 0) {
    try {
      candidateRows = await db.newsArticle.findMany({
        where: {
          metal: { in: metalFilter },
        },
        orderBy: { publishedAt: 'desc' },
        select: articleSelect,
        take: 8,
      })
    } catch (error) {
      if (isMissingRelationError(error, 'NewsArticle')) {
        console.warn('[comex-rag] NewsArticle relation is missing. Degrading to empty article context.', {
          activeMetals,
          strategy: 'fallback_global',
        })
        return []
      }

      throw error
    }
  }

  const scored = candidateRows.map((row) => {
    const snippet = row.snippet.toLowerCase()
    const keywordHits = keywords.filter((term) => snippet.includes(term)).length
    return {
      ...row,
      keywordHits,
      similarity: keywordHits > 0 ? 0.45 + Math.min(keywordHits, 5) * 0.1 : 0.3,
    }
  })

  const prioritized = scored
    .sort((a, b) => {
      if (b.keywordHits !== a.keywordHits) return b.keywordHits - a.keywordHits
      return b.publishedAt.getTime() - a.publishedAt.getTime()
    })
    .slice(0, 8)

  return prioritized.map((row) => ({
    id: row.id,
    snippet: row.snippet,
    url: row.url,
    metal: row.metal as MetalKey | 'both',
    publishedAt: row.publishedAt,
    similarity: row.similarity,
  }))
}

export async function buildRAGContext(question: string, metals: MetalKey[]): Promise<RAGContext> {
  const selectedMetals = metals.filter((metal): metal is MetalKey => METAL_KEYS.includes(metal))
  const activeMetals = selectedMetals.length > 0 ? selectedMetals : METAL_KEYS

  const hasVoyageApiKey = Boolean(process.env.VOYAGE_API_KEY)
  let similarRows: SimilarityRow[] = []

  if (hasVoyageApiKey) {
    try {
      const questionEmbedding = await embedText(question)
      const vectorLiteral = toVectorLiteral(questionEmbedding)
      const metalFilter = Prisma.join([...activeMetals, 'both'])

      similarRows = await db.$queryRaw<SimilarityRow[]>(Prisma.sql`
        SELECT
          "id",
          "snippet",
          "url",
          "metal",
          "publishedAt",
          1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
        FROM "NewsArticle"
        WHERE "embedding" IS NOT NULL
          AND "metal" IN (${metalFilter})
          AND 1 - ("embedding" <=> ${vectorLiteral}::vector) >= 0.60
        ORDER BY "similarity" DESC
        LIMIT 8
      `)
    } catch (error) {
      console.error('[comex-rag] semantic retrieval unavailable; falling back to recency path', {
        error,
        questionLength: question.length,
        activeMetals,
      })
    }
  } else {
    console.warn('[comex-rag] VOYAGE_API_KEY missing; falling back to recency path', {
      activeMetals,
    })
  }

  if (similarRows.length === 0) {
    try {
      similarRows = await fetchFallbackRows(question, activeMetals)
    } catch (error) {
      console.error('[comex-rag] fallback retrieval query failed', {
        error,
        activeMetals,
      })
      throw new Error(`Fallback retrieval failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const articles = await buildRetrievedArticles(similarRows, activeMetals)

  const since90d = subDays(new Date(), 90)
  const prices = {} as Record<MetalKey, PriceSummary>

  for (const metal of METAL_KEYS) {
    let rows: Array<{ settlementDate: Date; close: number }>
    try {
      rows = await db.commodityPrice.findMany({
        where: {
          metal,
          settlementDate: { gte: since90d },
        },
        orderBy: { settlementDate: 'asc' },
        select: {
          settlementDate: true,
          close: true,
        },
      })
    } catch (error) {
      if (isMissingRelationError(error, 'CommodityPrice')) {
        console.warn('[comex-rag] CommodityPrice relation is missing. Returning null price summary.', {
          metal,
        })
        rows = []
      } else {
        console.error('[comex-rag] price history retrieval failed', {
          error,
          metal,
        })
        throw new Error(`Price history retrieval failed: metal=${metal}; ${getErrorMessage(error)}`)
      }
    }

    const current = rows.at(-1)?.close ?? null
    const baseline30 = rows.find((row) => row.settlementDate >= subDays(new Date(), 30))?.close ?? null
    const baseline90 = rows[0]?.close ?? null

    let recentLargeEvents: PriceEventRow[]
    try {
      recentLargeEvents = await db.$queryRaw<PriceEventRow[]>(Prisma.sql`
        SELECT
          "id",
          "metal",
          "date",
          "direction",
          "magnitude"
        FROM "PriceEvent"
        WHERE "metal" = ${metal}
          AND "magnitude" = 'large'
        ORDER BY "date" DESC
        LIMIT 5
      `)
    } catch (error) {
      if (isMissingRelationError(error, 'PriceEvent')) {
        console.warn('[comex-rag] PriceEvent relation is missing. Returning no large events.', {
          metal,
        })
        recentLargeEvents = []
      } else {
        console.error('[comex-rag] large events retrieval failed', {
          error,
          metal,
        })
        throw new Error(`Large event retrieval failed: metal=${metal}; ${getErrorMessage(error)}`)
      }
    }

    prices[metal] = {
      metal,
      current,
      change30dPct: current !== null && baseline30 !== null ? pctChange(current, baseline30) : null,
      change90dPct: current !== null && baseline90 !== null ? pctChange(current, baseline90) : null,
      recentLargeEvents: recentLargeEvents.map((event) => ({
        id: event.id,
        date: event.date.toISOString(),
        direction: event.direction,
        magnitude: 'large',
      })),
    }
  }

  return {
    question,
    articles,
    prices,
  }
}
