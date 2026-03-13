-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('NEW', 'QUALIFYING', 'ACTIVE', 'INACTIVE', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('JOB_POSTING', 'PERMIT', 'LICENSE', 'NEWS', 'WEBSITE_CONTENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('COMPANY_WEBSITE', 'PERMIT', 'LICENSE', 'CSV_IMPORT', 'MANUAL');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "domain" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT DEFAULT 'GA',
    "zip" TEXT,
    "county" TEXT,
    "region" TEXT,
    "territory" TEXT,
    "description" TEXT,
    "serviceAreas" TEXT[],
    "segments" TEXT[],
    "specialties" TEXT[],
    "employeeSizeEstimate" TEXT,
    "sourceConfidence" DOUBLE PRECISION DEFAULT 0,
    "activeScore" DOUBLE PRECISION DEFAULT 0,
    "leadScore" DOUBLE PRECISION DEFAULT 0,
    "status" "CompanyStatus" NOT NULL DEFAULT 'NEW',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastEnrichedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT,
    "snippet" TEXT,
    "rawText" TEXT,
    "signalType" "SignalType" NOT NULL,
    "signalDate" TIMESTAMP(3),
    "county" TEXT,
    "city" TEXT,
    "metadata" JSONB,
    "relevanceScore" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT,
    "confidenceScore" DOUBLE PRECISION DEFAULT 0,
    "manualOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "status" "CrawlJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "recordsFound" INTEGER DEFAULT 0,
    "recordsCreated" INTEGER DEFAULT 0,
    "recordsUpdated" INTEGER DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyTag" (
    "companyId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "CompanyTag_pkey" PRIMARY KEY ("companyId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");

-- CreateIndex
CREATE INDEX "Company_county_idx" ON "Company"("county");

-- CreateIndex
CREATE INDEX "Company_leadScore_idx" ON "Company"("leadScore");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");

-- CreateIndex
CREATE INDEX "Signal_companyId_idx" ON "Signal"("companyId");

-- CreateIndex
CREATE INDEX "Signal_signalType_idx" ON "Signal"("signalType");

-- CreateIndex
CREATE INDEX "Signal_signalDate_idx" ON "Signal"("signalDate");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");

-- CreateIndex
CREATE INDEX "CrawlJob_sourceType_idx" ON "CrawlJob"("sourceType");

-- CreateIndex
CREATE INDEX "CrawlJob_createdAt_idx" ON "CrawlJob"("createdAt");

-- CreateIndex
CREATE INDEX "UserNote_companyId_idx" ON "UserNote"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTag" ADD CONSTRAINT "CompanyTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTag" ADD CONSTRAINT "CompanyTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
