-- Campus-verified sellers can publish directly. Promote historical review
-- entries so existing listings become visible under the same policy.
ALTER TABLE "Listing" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

UPDATE "Listing" AS listing
SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
FROM "User" AS seller
WHERE listing."sellerId" = seller."id"
  AND seller."campusStatus" = 'VERIFIED'
  AND listing."status" = 'PENDING_REVIEW'
  AND listing."deletedAt" IS NULL;
