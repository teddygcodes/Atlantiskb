-- Ensure pgvector extension exists before altering vector column type
CREATE EXTENSION IF NOT EXISTS vector;

-- Preflight check: verify existing embedding dimensions before conversion.
-- Any rows returned here indicate mixed/unexpected dimensions that may fail casting.
SELECT
  vector_dims("embedding") AS embedding_dims,
  COUNT(*)::int AS row_count
FROM "NewsArticle"
WHERE "embedding" IS NOT NULL
GROUP BY vector_dims("embedding")
ORDER BY embedding_dims;

-- Convert embeddings from vector(1536) to vector(512).
ALTER TABLE "NewsArticle"
ALTER COLUMN "embedding" TYPE vector(512)
USING "embedding"::vector(512);

-- Runbook fallback (if conversion fails due to mixed dimensions):
-- 1) UPDATE "NewsArticle" SET "embedding" = NULL;
-- 2) Re-run the embedding sync job to repopulate with 512-d vectors.
