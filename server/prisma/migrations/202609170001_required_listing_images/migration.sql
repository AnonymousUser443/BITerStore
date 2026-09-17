-- Public listings must have both pieces of publishing evidence and at least
-- one reviewed public cover. Keep legacy/incomplete rows out of the public
-- catalog and return them to the moderation queue for an explicit decision.
UPDATE "Listing" AS listing
SET
  "status" = 'PENDING_REVIEW',
  "moderationDecision" = NULL,
  "moderatedAt" = NULL,
  "version" = listing."version" + 1
WHERE listing."status" = 'ACTIVE'
  AND listing."deletedAt" IS NULL
  AND (
    NOT EXISTS (
      SELECT 1
      FROM "ListingImage" AS image
      WHERE image."listingId" = listing."id"
        AND image."uploadedAt" IS NOT NULL
        AND image."role" = 'COVER'
        AND image."moderationStatus" = 'APPROVED'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "ListingImage" AS image
      WHERE image."listingId" = listing."id"
        AND image."uploadedAt" IS NOT NULL
        AND image."role" = 'ISBN'
    )
    OR EXISTS (
      SELECT 1
      FROM "ListingImage" AS image
      WHERE image."listingId" = listing."id"
        AND image."uploadedAt" IS NOT NULL
        AND image."role" <> 'ISBN'
        AND image."moderationStatus" <> 'APPROVED'
    )
  );

-- Older code could leave a previous moderation decision on a resubmitted
-- listing, which excluded it from the default pending queue.
UPDATE "Listing"
SET "moderationDecision" = NULL, "moderatedAt" = NULL
WHERE "status" = 'PENDING_REVIEW'
  AND ("moderationDecision" IS NOT NULL OR "moderatedAt" IS NOT NULL);
