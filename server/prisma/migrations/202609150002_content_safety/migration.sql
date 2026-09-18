-- Existing images were created before moderation was enforced. Do not infer
-- approval from their historical public visibility: move affected live
-- listings back to the review queue before the public queries begin requiring
-- APPROVED images.
UPDATE "Listing" AS listing
SET "status" = 'PENDING_REVIEW', "version" = listing."version" + 1
WHERE listing."status" = 'ACTIVE'
  AND listing."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ListingImage" AS image
    WHERE image."listingId" = listing."id"
      AND image."uploadedAt" IS NOT NULL
      AND image."role" <> 'ISBN'
      AND image."moderationStatus" <> 'APPROVED'
  );

ALTER TABLE "ListingImage" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "ListingImage" ADD COLUMN "moderatedAt" TIMESTAMP(3);

CREATE INDEX "ListingImage_listingId_moderationStatus_sortOrder_idx"
ON "ListingImage"("listingId", "moderationStatus", "sortOrder");

CREATE INDEX "ConversationMember_userId_conversationId_idx"
ON "ConversationMember"("userId", "conversationId");

CREATE INDEX "Block_blockedUserId_userId_idx"
ON "Block"("blockedUserId", "userId");
