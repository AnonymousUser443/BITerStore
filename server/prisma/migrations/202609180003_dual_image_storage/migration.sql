ALTER TABLE "ListingImage"
  ADD COLUMN "localStoredAt" TIMESTAMP(3),
  ADD COLUMN "remoteStoredAt" TIMESTAMP(3),
  ADD COLUMN "backupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "backupError" TEXT;

CREATE INDEX "ListingImage_remoteStoredAt_idx" ON "ListingImage"("remoteStoredAt");
