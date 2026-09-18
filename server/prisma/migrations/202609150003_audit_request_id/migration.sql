-- Preserve every legacy audit row while making previously duplicated request
-- identifiers unique before the database constraint is installed.
WITH ranked AS (
  SELECT "id", "requestId", ROW_NUMBER() OVER (PARTITION BY "requestId" ORDER BY "id") AS occurrence
  FROM "AuditLog"
)
UPDATE "AuditLog" AS audit
SET "requestId" = audit."requestId" || '-legacy-' || audit."id"::text
FROM ranked
WHERE audit."id" = ranked."id" AND ranked.occurrence > 1;

CREATE UNIQUE INDEX "AuditLog_requestId_key" ON "AuditLog"("requestId");
