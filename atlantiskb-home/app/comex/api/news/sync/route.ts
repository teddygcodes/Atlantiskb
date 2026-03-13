import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { db as prisma } from '@/lib/db'
import { embedBatch } from '@/lib/comex/embeddings'
import { NEWS_SOURCES, inferMetal, isRelevant } from '@/lib/comex/news-sources'
import { syncPriceEvents } from '@/lib/comex/price-events'
import { getComexSchemaReadiness } from '@/lib/comex/schema-readiness'
import type { NewsMetal } from '@prisma/client'

type SourceResult = {
  source: string
  rssUrl: string
  fetched: number
  relevant: number
  skipped: number
  inserted: number
  embeddedSuccess: number
  embeddedFailed: number
  errored: number
  metalCounts: Record<NewsMetal, number>
  errors: string[]
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toSnippet(title: string, content: string): string {
  const combined = `${title} ${content}`.trim()
  return stripHtml(combined).slice(0, 500)
}

function createCuid(seed: string): string {
  const ts = Date.now().toString(36)
  const random = randomBytes(10).toString('hex').slice(0, 16)
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 8)
  return `c${ts}${random}${hash}`.slice(0, 30)
}

export async function GET() {
  const parser = new Parser({ timeout: 10_000 })
  const results: SourceResult[] = []
  const schemaReadiness = await getComexSchemaReadiness()

  if (schemaReadiness.degraded) {
    console.error('news.sync.schema_degraded', { readiness: schemaReadiness })
    return NextResponse.json({
      ok: false,
      degraded: true,
      reason: 'required_schema_missing',
      readiness: schemaReadiness,
      totals: {
        fetched: 0,
        relevant: 0,
        inserted: 0,
        skipped: 0,
        errored: NEWS_SOURCES.length,
      },
      results,
    })
  }

  for (const source of NEWS_SOURCES) {
    const sourceResult: SourceResult = {
      source: source.name,
      rssUrl: source.rssUrl,
      fetched: 0,
      relevant: 0,
      skipped: 0,
      inserted: 0,
      embeddedSuccess: 0,
      embeddedFailed: 0,
      errored: 0,
      metalCounts: { copper: 0, aluminum: 0, both: 0 },
      errors: [],
    }

    try {
      const feed = await parser.parseURL(source.rssUrl)
      const items = feed.items ?? []
      sourceResult.fetched = items.length
      console.info('news.sync.source_fetch', {
        source: source.name,
        rssUrl: source.rssUrl,
        fetched: items.length,
      })

      const relevantItems = items
        .map((item) => {
          const title = (item.title ?? '').trim()
          const url = (item.link ?? '').trim()
          const content = (item.contentSnippet ?? item.content ?? '').trim()

          if (!title || !url) return null
          if (!isRelevant(`${title} ${content}`)) return null

          return {
            title,
            url,
            content,
            publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      sourceResult.relevant = relevantItems.length
      console.info('news.sync.source_relevance', {
        source: source.name,
        fetched: sourceResult.fetched,
        relevant: sourceResult.relevant,
      })

      const uniqueByUrl = new Map<string, (typeof relevantItems)[number]>()
      for (const item of relevantItems) {
        if (!uniqueByUrl.has(item.url)) uniqueByUrl.set(item.url, item)
      }

      const candidates = [...uniqueByUrl.values()]
      const candidateUrls = candidates.map((item) => item.url)

      const existing = candidateUrls.length
        ? await prisma.newsArticle.findMany({
            where: { url: { in: candidateUrls } },
            select: { url: true },
          })
        : []

      const existingUrls = new Set(existing.map((row) => row.url))
      const toInsert = candidates.filter((item) => !existingUrls.has(item.url))
      sourceResult.skipped = candidates.length - toInsert.length
      console.info('news.sync.source_dedup', {
        source: source.name,
        candidates: candidates.length,
        skippedExisting: sourceResult.skipped,
        toInsert: toInsert.length,
      })

      if (toInsert.length === 0) {
        results.push(sourceResult)
        continue
      }

      const snippets = toInsert.map((item) => toSnippet(item.title, item.content))
      const supportsVectorSearch = schemaReadiness.optional.vectorSearchReady
      const embeddingsByIndex: Array<number[] | null> = toInsert.map(() => null)

      if (supportsVectorSearch) {
        try {
          const expectedEmbeddingDimension = schemaReadiness.expectedEmbeddingDimension
          const embeddings = await embedBatch(snippets)

          if (embeddings.length !== toInsert.length) {
            sourceResult.embeddedFailed = toInsert.length
            sourceResult.errors.push(`embedding_length_mismatch:${embeddings.length}/${toInsert.length}`)
            console.error('news.sync.embedding_length_mismatch', {
              source: source.name,
              expectedRows: toInsert.length,
              actualEmbeddings: embeddings.length,
              action: 'insert_without_embedding',
            })
          } else {
            embeddings.forEach((embedding, index) => {
              if (embedding.length !== expectedEmbeddingDimension) {
                sourceResult.embeddedFailed += 1
                console.error('news.sync.embedding_dimension_mismatch', {
                  source: source.name,
                  index,
                  url: toInsert[index]?.url,
                  expectedDimension: expectedEmbeddingDimension,
                  actualDimension: embedding.length,
                  action: 'insert_without_embedding',
                })
                return
              }

              embeddingsByIndex[index] = embedding
              sourceResult.embeddedSuccess += 1
            })
          }
        } catch (error) {
          sourceResult.embeddedFailed = toInsert.length
          sourceResult.errors.push(
            `embedding_failure:${error instanceof Error ? error.message : String(error)}`,
          )
          console.error('news.sync.embedding_failure', {
            source: source.name,
            error,
            action: 'insert_without_embedding',
          })
        }
      } else {
        sourceResult.embeddedFailed = toInsert.length
        sourceResult.errors.push('embedding_unavailable:schema_vector_not_ready')
      }

      sourceResult.inserted = await prisma.$transaction(async (tx) => {
        let inserted = 0

        for (const [index, item] of toInsert.entries()) {
          const snippet = snippets[index]
          const embedding = embeddingsByIndex[index]
          const metal = inferMetal(`${item.title} ${snippet}`)
          sourceResult.metalCounts[metal] += 1

          const rowCount = embedding
            ? await tx.$executeRaw`
                INSERT INTO "NewsArticle" ("id", "headline", "snippet", "url", "source", "metal", "publishedAt", "embedding")
                VALUES (
                  ${createCuid(item.url + item.publishedAt)},
                  ${item.title},
                  ${snippet},
                  ${item.url},
                  ${source.name},
                  ${metal},
                  ${new Date(item.publishedAt)},
                  ${`[${embedding.join(',')}]`}::vector
                )
                ON CONFLICT ("url") DO NOTHING
              `
            : await tx.$executeRaw`
                INSERT INTO "NewsArticle" ("id", "headline", "snippet", "url", "source", "metal", "publishedAt")
                VALUES (
                  ${createCuid(item.url + item.publishedAt)},
                  ${item.title},
                  ${snippet},
                  ${item.url},
                  ${source.name},
                  ${metal},
                  ${new Date(item.publishedAt)}
                )
                ON CONFLICT ("url") DO NOTHING
              `

          inserted += Number(rowCount)
        }

        return inserted
      })

      console.info('news.sync.source_insert', {
        source: source.name,
        inserted: sourceResult.inserted,
        skippedExisting: sourceResult.skipped,
        embeddedSuccess: sourceResult.embeddedSuccess,
        embeddedFailed: sourceResult.embeddedFailed,
        metalCounts: sourceResult.metalCounts,
      })
    } catch (err) {
      sourceResult.errored += 1
      sourceResult.errors.push(err instanceof Error ? err.message : String(err))
      console.error('news.sync.source_failure', {
        source: source.name,
        rssUrl: source.rssUrl,
        error: err,
      })
    }

    results.push(sourceResult)
  }

  await syncPriceEvents('copper')
  await syncPriceEvents('aluminum')

  const totals = results.reduce(
    (acc, result) => {
      acc.fetched += result.fetched
      acc.relevant += result.relevant
      acc.inserted += result.inserted
      acc.skipped += result.skipped
      acc.errored += result.errored
      return acc
    },
    { fetched: 0, relevant: 0, inserted: 0, skipped: 0, errored: 0 },
  )

  const ok = totals.inserted > 0 && totals.errored === 0

  return NextResponse.json({
    ok,
    degraded: false,
    readiness: schemaReadiness,
    message: ok ? 'sync_completed' : 'sync_completed_with_zero_inserts_or_errors',
    totals,
    results,
  })
}
