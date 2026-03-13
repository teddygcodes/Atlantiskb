-- AlterEnum
ALTER TYPE "RecordOrigin" ADD VALUE 'PERMIT_DISCOVERY';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "activeJobCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "lastPermitAt" TIMESTAMP(3),
ADD COLUMN     "permitCount30Days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "permitSignalScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "jobAddress" TEXT,
    "county" TEXT NOT NULL,
    "jobValue" DOUBLE PRECISION,
    "isResidential" BOOLEAN NOT NULL DEFAULT false,
    "estimatedValueBucket" TEXT,
    "valueIsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "valueEstimatedAt" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "inspectionAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "contractorName" TEXT NOT NULL,
    "contractorPhone" TEXT,
    "contractorLicense" TEXT,
    "companyId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Permit_county_idx" ON "Permit"("county");

-- CreateIndex
CREATE INDEX "Permit_companyId_idx" ON "Permit"("companyId");

-- CreateIndex
CREATE INDEX "Permit_filedAt_idx" ON "Permit"("filedAt");

-- CreateIndex
CREATE INDEX "Permit_status_idx" ON "Permit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Permit_source_externalId_key" ON "Permit"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
