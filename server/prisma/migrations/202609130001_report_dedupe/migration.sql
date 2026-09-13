-- Keep the oldest report for each reporter/target pair before adding the
-- uniqueness guarantee. This makes the migration safe on installations that
-- accepted duplicates before the API-level idempotency check was introduced.
WITH duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "reporterId", "targetType", "targetId"
    ORDER BY "createdAt" ASC, "id" ASC
  ) AS row_number
  FROM "Report"
)
DELETE FROM "Report" AS report
USING duplicates
WHERE report."id" = duplicates."id" AND duplicates.row_number > 1;

CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key"
ON "Report"("reporterId", "targetType", "targetId");

CREATE INDEX "Report_reporterId_createdAt_idx"
ON "Report"("reporterId", "createdAt");

CREATE INDEX "Report_targetType_targetId_createdAt_idx"
ON "Report"("targetType", "targetId", "createdAt");
