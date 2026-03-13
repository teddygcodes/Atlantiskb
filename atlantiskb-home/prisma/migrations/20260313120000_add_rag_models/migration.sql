-- CreateEnum
CREATE TYPE "NewsMetal" AS ENUM ('copper', 'aluminum', 'both');

-- CreateEnum
CREATE TYPE "PriceDirection" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "PriceMagnitude" AS ENUM ('medium', 'large');

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "metal" "NewsMetal" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceEvent" (
    "id" TEXT NOT NULL,
    "metal" "NewsMetal" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" "PriceDirection" NOT NULL,
    "magnitude" "PriceMagnitude" NOT NULL,

    CONSTRAINT "PriceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_url_key" ON "NewsArticle"("url");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_metal_idx" ON "NewsArticle"("metal");

-- CreateIndex
CREATE UNIQUE INDEX "PriceEvent_metal_date_key" ON "PriceEvent"("metal", "date");

-- CreateIndex
CREATE INDEX "PriceEvent_metal_idx" ON "PriceEvent"("metal");

-- CreateIndex
CREATE INDEX "PriceEvent_date_idx" ON "PriceEvent"("date");

-- Post-migration raw SQL for vector embeddings (intentionally not in Prisma schema)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "NewsArticle" ADD COLUMN "embedding" vector(1536);
