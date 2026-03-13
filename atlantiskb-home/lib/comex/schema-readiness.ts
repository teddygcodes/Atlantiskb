import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export interface ComexSchemaReadiness {
  checkedAt: string
  ready: boolean
  degraded: boolean
  remediation: string
  embeddingDimension: number | null
  expectedEmbeddingDimension: number
  embeddingDimensionMatches: boolean
  required: {
    newsArticleTable: boolean
    priceEventTable: boolean
    commodityPriceTable: boolean
  }
  optional: {
    embeddingColumn: boolean
    vectorExtension: boolean
    vectorSearchReady: boolean
  }
}

const REMEDIATION = 'run prisma migrate deploy'
const EXPECTED_EMBEDDING_DIMENSION = 512
let lastLoggedFingerprint = ''

function buildReadinessFromChecks(checks: {
  hasNewsArticleTable: boolean
  hasPriceEventTable: boolean
  hasCommodityPriceTable: boolean
  hasEmbeddingColumn: boolean
  hasVectorExtension: boolean
  embeddingDimension: number | null
}): ComexSchemaReadiness {
  const embeddingDimension = toNullableNumber(checks.embeddingDimension)
  const embeddingDimensionMatches = embeddingDimension === EXPECTED_EMBEDDING_DIMENSION

  const required = {
    newsArticleTable: toBool(checks.hasNewsArticleTable),
    priceEventTable: toBool(checks.hasPriceEventTable),
    commodityPriceTable: toBool(checks.hasCommodityPriceTable),
  }

  const optional = {
    embeddingColumn: toBool(checks.hasEmbeddingColumn),
    vectorExtension: toBool(checks.hasVectorExtension),
    vectorSearchReady:
      toBool(checks.hasEmbeddingColumn) && toBool(checks.hasVectorExtension) && embeddingDimensionMatches,
  }

  const ready = required.newsArticleTable && required.priceEventTable && required.commodityPriceTable

  return {
    checkedAt: new Date().toISOString(),
    ready,
    degraded: !ready,
    remediation: REMEDIATION,
    embeddingDimension,
    expectedEmbeddingDimension: EXPECTED_EMBEDDING_DIMENSION,
    embeddingDimensionMatches,
    required,
    optional,
  }
}

function toBool(value: unknown): boolean {
  return value === true
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return null
  }

  return value
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
        hasCommodityPriceTable: boolean
        hasEmbeddingColumn: boolean
        hasVectorExtension: boolean
        embeddingDimension: number | null
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
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'CommodityPrice'
      ) AS "hasCommodityPriceTable",
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
      ) AS "hasVectorExtension",
      (
        SELECT NULLIF(att.atttypmod, -1) - 4
        FROM pg_catalog.pg_attribute att
        INNER JOIN pg_catalog.pg_class cls
          ON cls.oid = att.attrelid
        INNER JOIN pg_catalog.pg_namespace ns
          ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = 'NewsArticle'
          AND att.attname = 'embedding'
          AND att.attnum > 0
          AND NOT att.attisdropped
      ) AS "embeddingDimension"
  `)

    const row = checks[0]

    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: toBool(row?.hasNewsArticleTable),
      hasPriceEventTable: toBool(row?.hasPriceEventTable),
      hasCommodityPriceTable: toBool(row?.hasCommodityPriceTable),
      hasEmbeddingColumn: toBool(row?.hasEmbeddingColumn),
      hasVectorExtension: toBool(row?.hasVectorExtension),
      embeddingDimension: toNullableNumber(row?.embeddingDimension),
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  } catch (error) {
    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: false,
      hasPriceEventTable: false,
      hasCommodityPriceTable: false,
      hasEmbeddingColumn: false,
      hasVectorExtension: false,
      embeddingDimension: null,
    })

    console.error('[comex-schema] Failed to verify COMEX schema readiness. Agent is running in degraded mode. Remediation: run prisma migrate deploy', {
      error,
      readiness,
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  }
}
