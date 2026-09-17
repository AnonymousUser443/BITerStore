-- Replace only the exact historical system default, preserving custom names.
-- The new random suffix has no relationship to studentNumber or identity hashes.
UPDATE "User"
SET "nickname" = 'BITer-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "studentNumber" IS NOT NULL
  AND "nickname" = 'BITer' || "studentNumber";
