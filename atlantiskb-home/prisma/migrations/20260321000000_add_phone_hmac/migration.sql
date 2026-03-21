-- AddColumn: phoneHmac for deterministic HMAC lookup of encrypted phone numbers
ALTER TABLE "Company" ADD COLUMN "phoneHmac" TEXT;

-- AddIndex: enables efficient WHERE "phoneHmac" = ? queries (places/check deduplication)
CREATE INDEX "Company_phoneHmac_idx" ON "Company"("phoneHmac");
