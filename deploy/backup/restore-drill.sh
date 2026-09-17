#!/bin/sh
set -eu

: "${BACKUP_ENCRYPTION_PASSPHRASE_FILE:?BACKUP_ENCRYPTION_PASSPHRASE_FILE must be configured}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must point to a disposable empty database}"

archive="${1:-}"
test -f "$archive" || { echo "usage: restore-drill.sh /backups/<archive>.dump.gpg" >&2; exit 2; }

gnupg_home="${GNUPGHOME:-/tmp/gnupg}"
mkdir -p "$gnupg_home"
chmod 0700 "$gnupg_home"

database_name="${RESTORE_DATABASE_URL%%\?*}"
database_name="${database_name##*/}"
case "$database_name" in
  ''|postgres|template0|template1|biterstore|biterstore_production)
    echo "refusing to restore into a protected or ambiguous database name" >&2
    exit 2
    ;;
esac

plain_file="$(mktemp /tmp/biterstore-restore.dump.XXXXXX)"
trap 'rm -f "$plain_file"' EXIT INT TERM
gpg --batch --quiet --no-symkey-cache --pinentry-mode loopback \
  --passphrase-file "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" --output "$plain_file" --decrypt "$archive"
pg_restore --list "$plain_file" >/dev/null
pg_restore --exit-on-error --no-owner --no-privileges --dbname "$RESTORE_DATABASE_URL" "$plain_file"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT COUNT(*) FROM "_prisma_migrations";' >/dev/null
echo "restore drill completed in disposable database: $database_name"
