-- AlterTable
ALTER TABLE "Company" ADD COLUMN "googlePlaceId" TEXT,
ADD COLUMN "googleRating" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Company_googlePlaceId_key" ON "Company"("googlePlaceId");
