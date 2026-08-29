ALTER TABLE "Listing" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Listing_sellerId_clientRequestId_key"
ON "Listing"("sellerId", "clientRequestId");
