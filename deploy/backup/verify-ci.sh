#!/bin/sh
# Synthetic fixtures only. Run in an ephemeral postgres+GPG container.
set -eu
export GNUPGHOME=/tmp/ci-gnupg
export BACKUP_ENCRYPTION_PASSPHRASE_FILE=/tmp/ci-passphrase
export RESTORE_DATABASE_URL=postgresql://qa:qa@127.0.0.1:5432/restore_drill_ci
source_database=postgresql://qa:qa@127.0.0.1:5432/repair_ci
mkdir -m 700 -p "$GNUPGHOME"
printf '%s\n' 'synthetic-ci-key-not-a-production-secret' > "$BACKUP_ENCRYPTION_PASSPHRASE_FILE"

# Re-run the idempotent data migration against historical and custom names.
psql "$source_database" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "User" ("id", "nickname", "studentNumber", "updatedAt") VALUES
  ('ci-default', 'BITer1120000000', '1120000000', CURRENT_TIMESTAMP),
  ('ci-custom', 'My custom name', '1120000001', CURRENT_TIMESTAMP);
SQL
psql "$source_database" -v ON_ERROR_STOP=1 -f /work/server/prisma/migrations/202609180001_private_default_nicknames/migration.sql
psql "$source_database" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 'ci-default' AND "nickname" ~ '^BITer-[a-f0-9]{10}$')
     OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 'ci-custom' AND "nickname" = 'My custom name') THEN
    RAISE EXCEPTION 'nickname migration regression';
  END IF;
END $$;
SQL
pg_dump "$source_database" -Fc -f /tmp/ci.dump
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" \
  --symmetric --output /tmp/ci.dump.gpg /tmp/ci.dump
createdb -h 127.0.0.1 -U qa restore_drill_ci
sh /usr/local/bin/restore-drill.sh /tmp/ci.dump.gpg
test "$(psql "$RESTORE_DATABASE_URL" -Atqc "SELECT COUNT(*) FROM \"User\" WHERE \"id\" IN ('ci-default', 'ci-custom')")" = 2
echo 'Synthetic nickname migration and encrypted database restore passed.'
