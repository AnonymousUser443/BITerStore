#!/bin/sh
set -eu

# The marker is container-local and is written only after pg_dump, archive
# inspection, encryption, decrypt-and-inspect verification, and atomic move
# have all succeeded. A stale archive from an earlier container is therefore
# insufficient to make a newly started backup service healthy.
test -f /tmp/biterstore-backup-ready

for archive in /backups/biterstore-*.dump.gpg; do
  if [ -s "$archive" ]; then
    exit 0
  fi
done

exit 1
