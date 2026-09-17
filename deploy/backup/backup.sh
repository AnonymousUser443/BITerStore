#!/bin/sh
set -eu

: "${PGPASSWORD:?PGPASSWORD must be configured}"
: "${BACKUP_ENCRYPTION_PASSPHRASE_FILE:?BACKUP_ENCRYPTION_PASSPHRASE_FILE must be configured}"
test -s "$BACKUP_ENCRYPTION_PASSPHRASE_FILE"

backup_interval="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
gnupg_home="${GNUPGHOME:-/tmp/gnupg}"

case "$backup_interval:$retention_days" in
  *[!0-9:]*|:*|*:) echo "backup interval and retention must be positive integers" >&2; exit 1 ;;
esac
[ "$backup_interval" -gt 0 ] && [ "$retention_days" -gt 0 ] || { echo "backup interval and retention must be greater than zero" >&2; exit 1; }

mkdir -p /backups
mkdir -p "$gnupg_home"
chmod 0700 "$gnupg_home"
rm -f /tmp/biterstore-backup-ready

while :; do
  backup_time="$(date -u +%Y%m%dT%H%M%SZ)"
  plain_file="$(mktemp /tmp/biterstore-backup-XXXXXX)"
  verification_file=''
  final_file="/backups/biterstore-${backup_time}.dump.gpg"
  temporary_file="${final_file}.tmp"
  cleanup() {
    rm -f "$plain_file" "$temporary_file"
    if [ -n "$verification_file" ]; then rm -f "$verification_file"; fi
  }
  trap cleanup EXIT INT TERM

  pg_dump -h "${PGHOST:-postgres}" -U "${PGUSER:-biterstore}" -d "${PGDATABASE:-biterstore}" -Fc -f "$plain_file"
  pg_restore --list "$plain_file" >/dev/null
  gpg --batch --yes --no-symkey-cache --pinentry-mode loopback \
    --passphrase-file "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" --symmetric \
    --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --compress-algo none --output "$temporary_file" "$plain_file"
  verification_file="$(mktemp /tmp/biterstore-backup-verify.XXXXXX)"
  gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback \
    --passphrase-file "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" \
    --output "$verification_file" --decrypt "$temporary_file"
  cmp -s "$plain_file" "$verification_file"
  pg_restore --list "$verification_file" >/dev/null
  rm -f "$verification_file"
  verification_file=''
  chmod 0600 "$temporary_file"
  mv "$temporary_file" "$final_file"
  touch /tmp/biterstore-backup-ready
  rm -f "$plain_file"
  trap - EXIT INT TERM

  find /backups -type f -name 'biterstore-*.dump.gpg' -mtime "+${retention_days}" -delete
  sleep "$backup_interval"
done
