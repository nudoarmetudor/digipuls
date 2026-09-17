#!/bin/bash
# Nightly database dump and evidence archive. Runs as the `backup` service.
# Restore: infra/README.md.
set -uo pipefail

while true; do
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  echo "[backup] $ts starting"

  if mariadb-dump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" \
       --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" \
       | gzip > "/backups/digipuls-$ts.sql.gz.part"; then
    mv "/backups/digipuls-$ts.sql.gz.part" "/backups/digipuls-$ts.sql.gz"
    echo "[backup] database: /backups/digipuls-$ts.sql.gz"
  else
    rm -f "/backups/digipuls-$ts.sql.gz.part"
    echo "[backup] DATABASE DUMP FAILED" >&2
  fi

  if tar -czf "/backups/evidence-$ts.tar.gz.part" -C /evidence .; then
    mv "/backups/evidence-$ts.tar.gz.part" "/backups/evidence-$ts.tar.gz"
    echo "[backup] evidence: /backups/evidence-$ts.tar.gz"
  else
    rm -f "/backups/evidence-$ts.tar.gz.part"
    echo "[backup] EVIDENCE ARCHIVE FAILED" >&2
  fi

  find /backups -maxdepth 1 \( -name 'digipuls-*.sql.gz' -o -name 'evidence-*.tar.gz' \) \
    -mtime +"$BACKUP_KEEP_DAYS" -delete

  sleep "$BACKUP_INTERVAL_SECONDS"
done
