DROP INDEX IF EXISTS "Listing_status_createdAt_idx";

CREATE INDEX "Listing_status_createdAt_id_idx"
ON "Listing"("status", "createdAt" DESC, "id" DESC);

CREATE INDEX "Listing_status_priceCents_id_idx"
ON "Listing"("status", "priceCents", "id");

CREATE INDEX "Listing_status_campus_createdAt_idx"
ON "Listing"("status", "campus", "createdAt" DESC);

CREATE INDEX "Listing_status_category_createdAt_idx"
ON "Listing"("status", "category", "createdAt" DESC);

-- Trigram indexes keep first-hit, attacker-varied contains searches from
-- degrading into repeated full table scans as the catalog grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Listing_title_idx" ON "Listing" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Listing_author_idx" ON "Listing" USING GIN ("author" gin_trgm_ops);
CREATE INDEX "Listing_isbn_idx" ON "Listing" USING GIN ("isbn" gin_trgm_ops);
CREATE INDEX "Listing_course_idx" ON "Listing" USING GIN ("course" gin_trgm_ops);
