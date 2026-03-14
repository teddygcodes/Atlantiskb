import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { Prisma } from "@prisma/client";
import { db as prisma } from "@/lib/db";
import { embedBatch } from "@/lib/comex/embeddings";
import { NEWS_SOURCES, inferMetal, isRelevant } from "@/lib/comex/news-sources";
import { syncPriceEvents } from "@/lib/comex/price-events";
import { getComexSchemaReadiness } from "@/lib/comex/schema-readiness";
import type { NewsMetal } from "@prisma/client";

type SourceResult = {
  source: string;
  rssUrl: string;
  fetched: number;
  relevant: number;
  skipped: number;
  inserted: number;
  embeddedSuccess: number;
  embeddedFailed: number;
  errored: number;
  timedOut: number;
  metalCounts: Record<NewsMetal, number>;
  errors: string[];
  insertRowsAttempted: number;
  insertDurationMs: number;
  insertBatchCount: number;
};

const SOURCE_TIMEOUT_MS = 12_000;
const STAGE_TIMEOUT_MS = 8_000;

class TimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`${stage}_timeout_${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(
  stage: string,
  timeoutMs: number,
  task: () => Promise<T>,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new TimeoutError(stage, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function stageTimer(source: string, stage: string): () => void {
  const start = Date.now();
  console.info("news.sync.stage.start", {
    source,
    stage,
    startedAt: new Date(start).toISOString(),
  });

  return () => {
    console.info("news.sync.stage.end", {
      source,
      stage,
      durationMs: Date.now() - start,
      endedAt: new Date().toISOString(),
    });
  };
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SNIPPET_BOILERPLATE =
  /\b(read more|full story|read the full|more at|sign up|subscribe|newsletter|click here|follow us)\b.*/gi

function toSnippet(title: string, content: string): string {
  const cleaned = stripHtml(content)
    .replace(SNIPPET_BOILERPLATE, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Avoid prepending title if content already starts with it
  const startsWithTitle = cleaned.toLowerCase().startsWith(title.toLowerCase().slice(0, 40))
  const text = startsWithTitle ? cleaned : `${title} ${cleaned}`
  return text.slice(0, 500).trim()
}

function createCuid(seed: string): string {
  const ts = Date.now().toString(36);
  const random = randomBytes(10).toString("hex").slice(0, 16);
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return `c${ts}${random}${hash}`.slice(0, 30);
}

function toNewsMetalSqlLiteral(metal: NewsMetal): Prisma.Sql {
  switch (metal) {
    case "copper":
      return Prisma.sql`'copper'::"NewsMetal"`;
    case "aluminum":
      return Prisma.sql`'aluminum'::"NewsMetal"`;
    case "both":
      return Prisma.sql`'both'::"NewsMetal"`;
  }
}

export async function GET() {
  const parser = new Parser({ timeout: STAGE_TIMEOUT_MS });
  const results: SourceResult[] = [];

  let schemaReadiness;
  try {
    schemaReadiness = await withTimeout(
      "schema_readiness",
      STAGE_TIMEOUT_MS,
      () => getComexSchemaReadiness(),
    );
  } catch (error) {
    console.error("news.sync.schema_readiness_failure", { error });
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        reason: "schema_readiness_failure",
        totals: {
          fetched: 0,
          relevant: 0,
          inserted: 0,
          skipped: 0,
          errored: NEWS_SOURCES.length,
        },
        results,
        errors: [error instanceof Error ? error.message : String(error)],
      },
      { status: 500 },
    );
  }

  if (schemaReadiness.degraded) {
    console.error("news.sync.schema_degraded", { readiness: schemaReadiness });
    return NextResponse.json({
      ok: false,
      degraded: true,
      reason: "required_schema_missing",
      readiness: schemaReadiness,
      totals: {
        fetched: 0,
        relevant: 0,
        inserted: 0,
        skipped: 0,
        errored: NEWS_SOURCES.length,
      },
      results,
    });
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
      timedOut: 0,
      metalCounts: { copper: 0, aluminum: 0, both: 0 },
      errors: [],
      insertRowsAttempted: 0,
      insertDurationMs: 0,
      insertBatchCount: 0,
    };

    try {
      await withTimeout("source_processing", SOURCE_TIMEOUT_MS, async () => {
        const fetchEnd = stageTimer(source.name, "fetch");
        const rssXml = await withTimeout(
          "fetch",
          STAGE_TIMEOUT_MS,
          async () => {
            const response = await fetch(source.rssUrl, {
              headers: {
                "User-Agent": "AtlantisKB-COMEX-NewsSync/1.0",
              },
              cache: "no-store",
            });

            if (!response.ok) {
              throw new Error(`fetch_failed_status_${response.status}`);
            }

            return response.text();
          },
        ).finally(fetchEnd);

        const parseEnd = stageTimer(source.name, "parse");
        const feed = await withTimeout("parse", STAGE_TIMEOUT_MS, () =>
          parser.parseString(rssXml),
        ).finally(parseEnd);

        const items = feed.items ?? [];
        sourceResult.fetched = items.length;
        console.info("news.sync.source_fetch", {
          source: source.name,
          rssUrl: source.rssUrl,
          fetched: items.length,
        });

        const relevanceEnd = stageTimer(source.name, "relevance_filtering");
        const relevantItems = items
          .map((item) => {
            const title = (item.title ?? "").trim();
            const url = (item.link ?? "").trim();
            const content = (item.contentSnippet ?? item.content ?? "").trim();

            if (!title || !url) return null;
            if (!isRelevant(`${title} ${content}`)) return null;

            return {
              title,
              url,
              content,
              publishedAt:
                item.isoDate ?? item.pubDate ?? new Date().toISOString(),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        relevanceEnd();

        sourceResult.relevant = relevantItems.length;
        console.info("news.sync.source_relevance", {
          source: source.name,
          fetched: sourceResult.fetched,
          relevant: sourceResult.relevant,
        });

        const uniqueByUrl = new Map<string, (typeof relevantItems)[number]>();
        for (const item of relevantItems) {
          if (!uniqueByUrl.has(item.url)) uniqueByUrl.set(item.url, item);
        }

        const candidates = [...uniqueByUrl.values()];
        const candidateUrls = candidates.map((item) => item.url);

        const existing = candidateUrls.length
          ? await prisma.newsArticle.findMany({
              where: { url: { in: candidateUrls } },
              select: { url: true },
            })
          : [];

        const existingUrls = new Set(existing.map((row) => row.url));
        const toInsert = candidates.filter(
          (item) => !existingUrls.has(item.url),
        );
        sourceResult.skipped = candidates.length - toInsert.length;
        console.info("news.sync.source_dedup", {
          source: source.name,
          candidates: candidates.length,
          skippedExisting: sourceResult.skipped,
          toInsert: toInsert.length,
        });

        if (toInsert.length === 0) {
          return;
        }

        const snippets = toInsert.map((item) =>
          toSnippet(item.title, item.content),
        );
        const supportsVectorSearch = schemaReadiness.optional.vectorSearchReady;
        const embeddingsByIndex: Array<number[] | null> = toInsert.map(
          () => null,
        );

        if (supportsVectorSearch) {
          try {
            const embeddingEnd = stageTimer(source.name, "embedding");
            const expectedEmbeddingDimension =
              schemaReadiness.expectedEmbeddingDimension;
            const embeddings = await withTimeout(
              "embedding",
              STAGE_TIMEOUT_MS,
              () => embedBatch(snippets),
            ).finally(embeddingEnd);

            if (embeddings.length !== toInsert.length) {
              sourceResult.embeddedFailed = toInsert.length;
              sourceResult.errors.push(
                `embedding_length_mismatch:${embeddings.length}/${toInsert.length}`,
              );
              console.error("news.sync.embedding_length_mismatch", {
                source: source.name,
                expectedRows: toInsert.length,
                actualEmbeddings: embeddings.length,
                action: "insert_without_embedding",
              });
            } else {
              embeddings.forEach((embedding, index) => {
                if (embedding.length !== expectedEmbeddingDimension) {
                  sourceResult.embeddedFailed += 1;
                  console.error("news.sync.embedding_dimension_mismatch", {
                    source: source.name,
                    index,
                    url: toInsert[index]?.url,
                    expectedDimension: expectedEmbeddingDimension,
                    actualDimension: embedding.length,
                    action: "insert_without_embedding",
                  });
                  return;
                }

                embeddingsByIndex[index] = embedding;
                sourceResult.embeddedSuccess += 1;
              });
            }
          } catch (error) {
            sourceResult.embeddedFailed = toInsert.length;
            sourceResult.errors.push(
              `embedding_failure:${error instanceof Error ? error.message : String(error)}`,
            );
            console.error("news.sync.embedding_failure", {
              source: source.name,
              error,
              action: "insert_without_embedding",
            });
          }
        } else {
          sourceResult.embeddedFailed = toInsert.length;
          sourceResult.errors.push(
            "embedding_unavailable:schema_vector_not_ready",
          );
        }

        const insertEnd = stageTimer(source.name, "insert_rows");
        const insertStart = Date.now();
        sourceResult.insertRowsAttempted = toInsert.length;
        let insertBatchCount = 0;
        const CHUNK_SIZE = 25;

        // Pre-compute metal for each item and update metalCounts upfront.
        // Split into two typed arrays so each INSERT uses a consistent column list.
        const withoutEmbedding: Array<{
          item: (typeof toInsert)[number];
          snippet: string;
          metal: NewsMetal;
        }> = [];
        const withEmbedding: Array<{
          item: (typeof toInsert)[number];
          snippet: string;
          metal: NewsMetal;
          embedding: number[];
        }> = [];

        for (const [index, item] of toInsert.entries()) {
          const snippet = snippets[index] ?? "";
          const metal = inferMetal(`${item.title} ${snippet}`);
          sourceResult.metalCounts[metal] += 1;
          const emb = embeddingsByIndex[index];
          if (Array.isArray(emb)) {
            withEmbedding.push({ item, snippet, metal, embedding: emb });
          } else {
            withoutEmbedding.push({ item, snippet, metal });
          }
        }

        sourceResult.inserted = await withTimeout(
          "insert_rows",
          STAGE_TIMEOUT_MS,
          async () => {
            let inserted = 0;

            // Batch insert rows without embedding (chunked at CHUNK_SIZE rows)
            for (let i = 0; i < withoutEmbedding.length; i += CHUNK_SIZE) {
              const chunk = withoutEmbedding.slice(i, i + CHUNK_SIZE);
              const rowFragments = chunk.map(({ item, snippet, metal }) => {
                const metalSql = toNewsMetalSqlLiteral(metal);
                return Prisma.sql`(
                  ${createCuid(item.url + item.publishedAt)},
                  ${item.title},
                  ${snippet},
                  ${item.url},
                  ${source.name},
                  ${metalSql},
                  ${new Date(item.publishedAt)}
                )`;
              });
              const count = await prisma.$executeRaw(Prisma.sql`
                INSERT INTO "NewsArticle" ("id", "headline", "snippet", "url", "source", "metal", "publishedAt")
                VALUES ${Prisma.join(rowFragments)}
                ON CONFLICT ("url") DO NOTHING
              `);
              inserted += Number(count);
              insertBatchCount += 1;
            }

            // Batch insert rows with embedding (chunked at CHUNK_SIZE rows)
            for (let i = 0; i < withEmbedding.length; i += CHUNK_SIZE) {
              const chunk = withEmbedding.slice(i, i + CHUNK_SIZE);
              const rowFragments = chunk.map(({ item, snippet, metal, embedding }) => {
                const metalSql = toNewsMetalSqlLiteral(metal);
                return Prisma.sql`(
                  ${createCuid(item.url + item.publishedAt)},
                  ${item.title},
                  ${snippet},
                  ${item.url},
                  ${source.name},
                  ${metalSql},
                  ${new Date(item.publishedAt)},
                  ${`[${embedding.join(",")}]`}::vector
                )`;
              });
              const count = await prisma.$executeRaw(Prisma.sql`
                INSERT INTO "NewsArticle" ("id", "headline", "snippet", "url", "source", "metal", "publishedAt", "embedding")
                VALUES ${Prisma.join(rowFragments)}
                ON CONFLICT ("url") DO NOTHING
              `);
              inserted += Number(count);
              insertBatchCount += 1;
            }

            return inserted;
          },
        ).finally(insertEnd);

        sourceResult.insertDurationMs = Date.now() - insertStart;
        sourceResult.insertBatchCount = insertBatchCount;

        console.info("news.sync.insert_batch", {
          source: source.name,
          rowsAttempted: sourceResult.insertRowsAttempted,
          insertDurationMs: sourceResult.insertDurationMs,
          batchCount: sourceResult.insertBatchCount,
        });

        console.info("news.sync.source_insert", {
          source: source.name,
          inserted: sourceResult.inserted,
          skippedExisting: sourceResult.skipped,
          embeddedSuccess: sourceResult.embeddedSuccess,
          embeddedFailed: sourceResult.embeddedFailed,
          metalCounts: sourceResult.metalCounts,
        });
      });
    } catch (err) {
      if (err instanceof TimeoutError) {
        sourceResult.timedOut += 1;
      }
      sourceResult.errored += 1;
      sourceResult.errors.push(
        err instanceof Error ? err.message : String(err),
      );
      console.error("news.sync.source_failure", {
        source: source.name,
        rssUrl: source.rssUrl,
        error: err,
      });
    }

    results.push(sourceResult);
  }

  try {
    await withTimeout("sync_price_events_copper", STAGE_TIMEOUT_MS, () =>
      syncPriceEvents("copper"),
    );
    await withTimeout("sync_price_events_aluminum", STAGE_TIMEOUT_MS, () =>
      syncPriceEvents("aluminum"),
    );
  } catch (error) {
    console.error("news.sync.price_events_failure", { error });
  }

  const totals = results.reduce(
    (acc, result) => {
      acc.fetched += result.fetched;
      acc.relevant += result.relevant;
      acc.inserted += result.inserted;
      acc.skipped += result.skipped;
      acc.errored += result.errored;
      return acc;
    },
    { fetched: 0, relevant: 0, inserted: 0, skipped: 0, errored: 0 },
  );

  const ok = totals.inserted > 0 && totals.errored === 0;

  return NextResponse.json({
    ok,
    degraded: false,
    readiness: schemaReadiness,
    syncDiagnostics: {
      vectorExtensionPresent: schemaReadiness.optional.vectorExtension,
      embeddingColumnPresent: schemaReadiness.optional.embeddingColumn,
      embeddingDimensionDetected: schemaReadiness.optional.embeddingDimensionDetected,
      embeddingColumnType: schemaReadiness.embeddingColumnType,
      vectorSearchReady: schemaReadiness.optional.vectorSearchReady,
      expectedEmbeddingDimension: schemaReadiness.expectedEmbeddingDimension,
      embeddingDimensionMatches: schemaReadiness.embeddingDimensionMatches,
      vectorSearchReadyReason: schemaReadiness.diagnostics.vectorSearchReadyReason,
      embeddingDimensionSource: schemaReadiness.diagnostics.embeddingDimensionSource,
      embeddingTypeLooksLikeVector: schemaReadiness.diagnostics.embeddingTypeLooksLikeVector,
    },
    message: ok
      ? "sync_completed"
      : "sync_completed_with_zero_inserts_or_errors",
    totals,
    results,
  });
}
