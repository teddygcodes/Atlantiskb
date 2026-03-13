-- Align NewsArticle with intended COMEX schema and embedding settings.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "NewsArticle"
  ADD COLUMN IF NOT EXISTS "headline" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "NewsArticle"
SET
  "headline" = COALESCE(NULLIF("headline", ''), left("snippet", 200)),
  "source" = COALESCE(NULLIF("source", ''), 'unknown')
WHERE "headline" IS NULL
   OR "headline" = ''
   OR "source" IS NULL
   OR "source" = '';

ALTER TABLE "NewsArticle"
  ALTER COLUMN "headline" SET NOT NULL,
  ALTER COLUMN "source" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "NewsArticle"
  ADD COLUMN IF NOT EXISTS "embedding" vector(512);

ALTER TABLE "NewsArticle"
  ALTER COLUMN "embedding" TYPE vector(512)
  USING CASE
    WHEN "embedding" IS NULL THEN NULL
    ELSE "embedding"::vector(512)
  END;

CREATE INDEX IF NOT EXISTS "NewsArticle_createdAt_idx" ON "NewsArticle"("createdAt");
