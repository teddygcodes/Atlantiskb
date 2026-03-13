import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { db as prisma } from '@/lib/db'
import { embedBatch } from '@/lib/comex/embeddings'
import { NEWS_SOURCES, inferMetal, isRelevant } from '@/lib/comex/news-sources'
import { syncPriceEvents } from '@/lib/comex/price-events'
import { getComexSchemaReadiness } from '@/lib/comex/schema-readiness'

type SourceResult = {
  source: string
  fetched: number
  embedded: number
  insertedWithoutEmbedding?: number
  skipped: number
  error?: string
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
    return NextResponse.json({
      ok: true,
      degraded: true,
      readiness: schemaReadiness,
      results,
    })
  }

  for (const source of NEWS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.rssUrl)
      const items = feed.items ?? []

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

      if (toInsert.length === 0) {
        results.push({
          source: source.name,
          fetched: items.length,
          embedded: 0,
          skipped: candidates.length,
        })
        continue
      }

      const snippets = toInsert.map((item) => toSnippet(item.title, item.content))
      const supportsVectorSearch = schemaReadiness.optional.vectorSearchReady
      const embeddingsByIndex: Array<number[] | null> = toInsert.map(() => null)
      let insertedWithoutEmbedding = 0

      if (supportsVectorSearch) {
        const expectedEmbeddingDimension = 512
        const embeddings = await embedBatch(snippets)

        if (embeddings.length !== toInsert.length) {
          insertedWithoutEmbedding = toInsert.length
          console.error('news.sync.embedding_length_mismatch', {
            source: source.name,
            expectedRows: toInsert.length,
            actualEmbeddings: embeddings.length,
            action: 'insert_without_embedding',
          })
        } else {
          embeddings.forEach((embedding, index) => {
            if (embedding.length !== expectedEmbeddingDimension) {
              insertedWithoutEmbedding += 1
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
          })
        }
      }

      const embeddedCount = embeddingsByIndex.filter((embedding) => embedding !== null).length

      await prisma.$transaction(
        toInsert.map((item, index) => {
          const snippet = snippets[index]
          const embedding = embeddingsByIndex[index]

          if (embedding) {
            const embeddingLiteral = `[${embedding.join(',')}]`

            // `embedding` is intentionally unmanaged by Prisma in this model.
            // We set it via raw SQL only when vector-search readiness checks pass.
            return prisma.$executeRaw`
              INSERT INTO "NewsArticle" ("id", "snippet", "url", "metal", "publishedAt", "embedding")
              VALUES (
                ${createCuid(item.url + item.publishedAt)},
                ${snippet},
                ${item.url},
                ${inferMetal(`${item.title} ${snippet}`)},
                ${new Date(item.publishedAt)},
                ${embeddingLiteral}::vector
              )
              ON CONFLICT ("url") DO NOTHING
            `
          }

          // Fallback insert path without `embedding` for readiness/validation failures.
          return prisma.$executeRaw`
            INSERT INTO "NewsArticle" ("id", "snippet", "url", "metal", "publishedAt")
            VALUES (
              ${createCuid(item.url + item.publishedAt)},
              ${snippet},
              ${item.url},
              ${inferMetal(`${item.title} ${snippet}`)},
              ${new Date(item.publishedAt)}
            )
            ON CONFLICT ("url") DO NOTHING
          `
        }),
      )

      results.push({
        source: source.name,
        fetched: items.length,
        embedded: embeddedCount,
        insertedWithoutEmbedding,
        skipped: candidates.length - toInsert.length,
      })
    } catch (err) {
      results.push({
        source: source.name,
        fetched: 0,
        embedded: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await syncPriceEvents('copper')
  await syncPriceEvents('aluminum')

  return NextResponse.json({
    ok: true,
    degraded: false,
    readiness: schemaReadiness,
    results,
  })
}
