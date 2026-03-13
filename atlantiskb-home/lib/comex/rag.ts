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

export async function buildRAGContext(question: string, metals: MetalKey[]): Promise<RAGContext> {
  const selectedMetals = metals.filter((metal): metal is MetalKey => METAL_KEYS.includes(metal))
  const activeMetals = selectedMetals.length > 0 ? selectedMetals : METAL_KEYS

  let questionEmbedding: number[]
  try {
    questionEmbedding = await embedText(question)
  } catch (error) {
    console.error('[comex-rag] embedding generation failed', {
      error,
      questionLength: question.length,
      activeMetals,
    })
    throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const vectorLiteral = toVectorLiteral(questionEmbedding)

  const metalFilter = Prisma.join([...activeMetals, 'both'])
  let similarRows: SimilarityRow[]
  try {
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
    console.error('[comex-rag] vector retrieval query failed', {
      error,
      activeMetals,
    })
    throw new Error(`Vector retrieval failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const articles: RetrievedArticle[] = []

  for (const row of similarRows) {
    const windowStart = subDays(row.publishedAt, 3)
    const windowEnd = new Date(row.publishedAt)
    windowEnd.setDate(windowEnd.getDate() + 3)

    let relatedEvents: PriceEventRow[]
    try {
      relatedEvents = await db.$queryRaw<PriceEventRow[]>(Prisma.sql`
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
      console.error('[comex-rag] related events retrieval failed', {
        error,
        articleId: row.id,
      })
      throw new Error(`Related price event retrieval failed: ${error instanceof Error ? error.message : String(error)}`)
    }

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
      console.error('[comex-rag] price history retrieval failed', {
        error,
        metal,
      })
      throw new Error(`Price history retrieval failed for ${metal}: ${error instanceof Error ? error.message : String(error)}`)
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
      console.error('[comex-rag] large events retrieval failed', {
        error,
        metal,
      })
      throw new Error(`Large event retrieval failed for ${metal}: ${error instanceof Error ? error.message : String(error)}`)
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
