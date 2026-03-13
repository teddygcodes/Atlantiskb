-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('DEMO', 'DISCOVERED', 'IMPORTED', 'MANUAL');

-- AlterEnum
ALTER TYPE "SignalType" ADD VALUE 'DISCOVERY';

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'COMPANY_DISCOVERY';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'DEMO';

-- CreateIndex
CREATE INDEX "Company_recordOrigin_idx" ON "Company"("recordOrigin");
