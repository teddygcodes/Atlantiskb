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
  embeddingColumnType: string | null
  required: {
    newsArticleTable: boolean
    priceEventTable: boolean
    commodityPriceTable: boolean
  }
  optional: {
    embeddingColumn: boolean
    vectorExtension: boolean
    embeddingDimensionDetected: boolean
    vectorSearchReady: boolean
  }
  diagnostics: {
    embeddingTypeLooksLikeVector: boolean
    embeddingDimensionSource: "atttypmod" | "type_parse" | "none"
    vectorSearchReadyReason:
      | "ready"
      | "missing_embedding_column"
      | "missing_vector_extension"
      | "embedding_dimension_unknown"
      | "embedding_dimension_mismatch"
  }
}

const REMEDIATION = 'run prisma migrate deploy'
const EXPECTED_EMBEDDING_DIMENSION = 512
let lastLoggedFingerprint = ''

function detectEmbeddingDimension(checks: {
  embeddingDimension: number | null
  embeddingColumnType: string | null
}): {
  embeddingDimension: number | null
  source: "atttypmod" | "type_parse" | "none"
  typeLooksLikeVector: boolean
} {
  const embeddingType = typeof checks.embeddingColumnType === "string" ? checks.embeddingColumnType : ""

  // Prefer format_type string — canonical and handles schema-prefixed types
  // (e.g. Supabase may return "extensions.vector(512)" instead of "vector(512)").
  // Use unanchored match so any prefix is tolerated.
  const vectorMatch = embeddingType.match(/vector\((\d+)\)/i)
  if (vectorMatch) {
    const parsed = Number(vectorMatch[1])
    return {
      embeddingDimension: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      source: "type_parse",
      typeLooksLikeVector: true,
    }
  }

  // Fallback: atttypmod (pgvector stores dim+4; SQL computes NULLIF(atttypmod,-1)-4)
  const dimensionFromTypmod = toNullableNumber(checks.embeddingDimension)
  if (dimensionFromTypmod) {
    return {
      embeddingDimension: dimensionFromTypmod,
      source: "atttypmod",
      typeLooksLikeVector: /vector/i.test(embeddingType),
    }
  }

  return {
    embeddingDimension: null,
    source: "none",
    typeLooksLikeVector: /vector/i.test(embeddingType),
  }
}

function buildReadinessFromChecks(checks: {
  hasNewsArticleTable: boolean
  hasPriceEventTable: boolean
  hasCommodityPriceTable: boolean
  hasHeadlineColumn: boolean
  hasSourceColumn: boolean
  hasCreatedAtColumn: boolean
  hasEmbeddingColumn: boolean
  hasVectorExtension: boolean
  embeddingDimension: number | null
  embeddingColumnType: string | null
}): ComexSchemaReadiness {
  const embeddingDetails = detectEmbeddingDimension({
    embeddingDimension: checks.embeddingDimension,
    embeddingColumnType: checks.embeddingColumnType,
  })
  const embeddingDimension = embeddingDetails.embeddingDimension
  const embeddingDimensionMatches = embeddingDimension === EXPECTED_EMBEDDING_DIMENSION

  const required = {
    newsArticleTable:
      toBool(checks.hasNewsArticleTable)
      && toBool(checks.hasHeadlineColumn)
      && toBool(checks.hasSourceColumn)
      && toBool(checks.hasCreatedAtColumn),
    priceEventTable: toBool(checks.hasPriceEventTable),
    commodityPriceTable: toBool(checks.hasCommodityPriceTable),
  }

  const hasEmbeddingColumn = toBool(checks.hasEmbeddingColumn)
  const hasVectorExtension = toBool(checks.hasVectorExtension)
  const embeddingDimensionDetected = embeddingDimension !== null

  let vectorSearchReadyReason: ComexSchemaReadiness["diagnostics"]["vectorSearchReadyReason"] = "ready"

  if (!hasEmbeddingColumn) {
    vectorSearchReadyReason = "missing_embedding_column"
  } else if (!hasVectorExtension) {
    vectorSearchReadyReason = "missing_vector_extension"
  } else if (!embeddingDimensionDetected) {
    vectorSearchReadyReason = "embedding_dimension_unknown"
  } else if (!embeddingDimensionMatches) {
    vectorSearchReadyReason = "embedding_dimension_mismatch"
  }

  const optional = {
    embeddingColumn: hasEmbeddingColumn,
    vectorExtension: hasVectorExtension,
    embeddingDimensionDetected,
    vectorSearchReady: vectorSearchReadyReason === "ready",
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
    embeddingColumnType: checks.embeddingColumnType,
    required,
    optional,
    diagnostics: {
      embeddingTypeLooksLikeVector: embeddingDetails.typeLooksLikeVector,
      embeddingDimensionSource: embeddingDetails.source,
      vectorSearchReadyReason,
    },
  }
}

function toBool(value: unknown): boolean {
  return value === true
}

function toNullableNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string'
          ? Number(value)
          : NaN

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null
  }

  return parsed
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
        hasHeadlineColumn: boolean
        hasSourceColumn: boolean
        hasCreatedAtColumn: boolean
        hasEmbeddingColumn: boolean
        hasVectorExtension: boolean
        embeddingDimension: number | null
        embeddingColumnType: string | null
      }>
    >(Prisma.sql`
    WITH news_article AS (
      SELECT c.oid
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'NewsArticle'
        AND c.relkind = 'r'
      LIMIT 1
    ),
    embedding_column AS (
      SELECT
        a.atttypmod,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS embedding_type
      FROM pg_catalog.pg_attribute a
      INNER JOIN news_article na
        ON na.oid = a.attrelid
      WHERE a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
      LIMIT 1
    )
    SELECT
      EXISTS (
        SELECT 1 FROM news_article
      ) AS "hasNewsArticleTable",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'PriceEvent'
          AND c.relkind = 'r'
      ) AS "hasPriceEventTable",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'CommodityPrice'
          AND c.relkind = 'r'
      ) AS "hasCommodityPriceTable",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute a
        INNER JOIN news_article na
          ON na.oid = a.attrelid
        WHERE a.attname = 'headline'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS "hasHeadlineColumn",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute a
        INNER JOIN news_article na
          ON na.oid = a.attrelid
        WHERE a.attname = 'source'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS "hasSourceColumn",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute a
        INNER JOIN news_article na
          ON na.oid = a.attrelid
        WHERE a.attname = 'createdAt'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS "hasCreatedAtColumn",
      EXISTS (
        SELECT 1 FROM embedding_column
      ) AS "hasEmbeddingColumn",
      EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
      ) AS "hasVectorExtension",
      (
        SELECT NULLIF(atttypmod, -1) - 4
        FROM embedding_column
      ) AS "embeddingDimension",
      (
        SELECT embedding_type
        FROM embedding_column
      ) AS "embeddingColumnType"
  `)

    const row = checks[0]

    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: toBool(row?.hasNewsArticleTable),
      hasPriceEventTable: toBool(row?.hasPriceEventTable),
      hasCommodityPriceTable: toBool(row?.hasCommodityPriceTable),
      hasHeadlineColumn: toBool(row?.hasHeadlineColumn),
      hasSourceColumn: toBool(row?.hasSourceColumn),
      hasCreatedAtColumn: toBool(row?.hasCreatedAtColumn),
      hasEmbeddingColumn: toBool(row?.hasEmbeddingColumn),
      hasVectorExtension: toBool(row?.hasVectorExtension),
      embeddingDimension: toNullableNumber(row?.embeddingDimension),
      embeddingColumnType:
        typeof row?.embeddingColumnType === 'string' ? row.embeddingColumnType : null,
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  } catch (error) {
    const readiness = buildReadinessFromChecks({
      hasNewsArticleTable: false,
      hasPriceEventTable: false,
      hasCommodityPriceTable: false,
      hasHeadlineColumn: false,
      hasSourceColumn: false,
      hasCreatedAtColumn: false,
      hasEmbeddingColumn: false,
      hasVectorExtension: false,
      embeddingDimension: null,
      embeddingColumnType: null,
    })

    console.error('[comex-schema] Failed to verify COMEX schema readiness. Agent is running in degraded mode. Remediation: run prisma migrate deploy', {
      error,
      readiness,
    })

    logOperationalSchemaErrorOnce(readiness)

    return readiness
  }
}
