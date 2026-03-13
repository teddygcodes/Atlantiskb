import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export interface ComexSchemaReadiness {
  checkedAt: string
  ready: boolean
  degraded: boolean
  remediation: string
  required: {
    newsArticleTable: boolean
    priceEventTable: boolean
  }
  optional: {
    embeddingColumn: boolean
    vectorExtension: boolean
    vectorSearchReady: boolean
  }
}

const REMEDIATION = 'run prisma migrate deploy'
let lastLoggedFingerprint = ''

function buildReadinessFromChecks(checks: {
  hasNewsArticleTable: boolean
  hasPriceEventTable: boolean
  hasEmbeddingColumn: boolean
  hasVectorExtension: boolean
}): ComexSchemaReadiness {
  const required = {
    newsArticleTable: toBool(checks.hasNewsArticleTable),
    priceEventTable: toBool(checks.hasPriceEventTable),
  }

  const optional = {
    embeddingColumn: toBool(checks.hasEmbeddingColumn),
    vectorExtension: toBool(checks.hasVectorExtension),
    vectorSearchReady: toBool(checks.hasEmbeddingColumn) && toBool(checks.hasVectorExtension),
  }

  const ready = required.newsArticleTable && required.priceEventTable

  return {
    checkedAt: new Date().toISOString(),
    ready,
    degraded: !ready,
    remediation: REMEDIATION,
    required,
    optional,
  }
}

function toBool(value: unknown): boolean {
  return value === true
}

function logOperationalSchemaErrorOnce(readiness: ComexSchemaReadiness): void {
  const fingerprint = JSON.stringify({
    required: readiness.required,
    optional: readiness.optional,
  })

  if (fingerprint === lastLoggedFingerprint) return
  lastLoggedFingerprint = fingerprint

  if (!readiness.ready) {
    console.error(
      '[comex-schema] Required COMEX schema objects are missing. Agent is running in degraded mode. Remediation: run prisma migrate deploy',
      {
        readiness,
      },
    )
  }
}

export async function getComexSchemaReadiness(): Promise<ComexSchemaReadiness> {
  try {
    const checks = await db.$queryRaw<
      Array<{
        hasNewsArticleTable: boolean
        hasPriceEventTable: boolean
        hasEmbeddingColumn: boolean
        hasVectorExtension: boolean
      }>
    >(Prisma.sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'NewsArticle'
      ) AS "hasNewsArticleTable",
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'PriceEvent'
      ) AS "hasPriceEventTable",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'NewsArticle'
          AND column_name = 'embedding'
      ) AS "hasEmbeddingColumn",
      EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
      ) AS "hasVectorExtension"
  `)

    const row = checks[0]

    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: toBool(row?.hasNewsArticleTable),
      hasPriceEventTable: toBool(row?.hasPriceEventTable),
      hasEmbeddingColumn: toBool(row?.hasEmbeddingColumn),
      hasVectorExtension: toBool(row?.hasVectorExtension),
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  } catch (error) {
    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: false,
      hasPriceEventTable: false,
      hasEmbeddingColumn: false,
      hasVectorExtension: false,
    })

    console.error('[comex-schema] Failed to verify COMEX schema readiness. Agent is running in degraded mode. Remediation: run prisma migrate deploy', {
      error,
      readiness,
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  }
}
