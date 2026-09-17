ALTER TABLE "Listing" ADD COLUMN "moderationDecision" TEXT;
ALTER TABLE "Listing" ADD COLUMN "moderatedAt" TIMESTAMP(3);

WITH latest AS (
  SELECT DISTINCT ON ("targetId") "targetId", "action", "createdAt"
  FROM "ModerationAction"
  WHERE "targetType" = 'LISTING' AND "action" IN ('IGNORE', 'BLOCKED', 'ACTIVE')
  ORDER BY "targetId", "createdAt" DESC, "id" DESC
)
UPDATE "Listing" AS listing
SET "moderationDecision" = latest."action", "moderatedAt" = latest."createdAt"
FROM latest
WHERE listing."id" = latest."targetId";

CREATE INDEX "Listing_moderationDecision_createdAt_idx"
ON "Listing"("moderationDecision", "createdAt" DESC);
