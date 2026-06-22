#!/bin/sh
# backup.sh
# PostgreSQL backup script used by the backup Docker service.
# Runs as a cron job (see crontab) inside the backup container.
#
# Uses pg_dump to create a plain-SQL backup of the PostgreSQL database.
# After writing the backup, prunes files older than RETAIN days.
#
# Environment variables (passed from docker-compose):
#   PGHOST               - PostgreSQL hostname           (default: postgres)
#   PGPORT               - PostgreSQL port               (default: 5432)
#   PGDATABASE           - Database name                 (default: open-tome)
#   PGUSER               - Database user                 (default: open-tome)
#   PGPASSWORD           - Database password             (required)
#   BACKUP_DIR           - Directory to write backups to (default: /backups)
#   BACKUP_RETAIN_DAYS   - Days of backups to retain     (default: 30)
#   BACKUP_PASSPHRASE    - GPG symmetric passphrase      (optional; if set, output is .sql.gpg)

set -e

DEST="${BACKUP_DIR:-/backups}"
RETAIN="${BACKUP_RETAIN_DAYS:-30}"
STAMP=$(date +%Y%m%d_%H%M%S)
DEST_FILE="$DEST/open-tome_$STAMP.sql"

# Warn when no passphrase is set — backup will be stored as plain unencrypted SQL.
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "[backup] WARNING: BACKUP_PASSPHRASE is not set. Backup will be stored as plain SQL (unencrypted). Set BACKUP_PASSPHRASE in production." >&2
fi

mkdir -p "$DEST"

# pg_dump writes a plain-SQL backup that can be restored with psql.
# PGPASSWORD is read from the environment automatically by pg_dump.
pg_dump \
  --host="${PGHOST:-postgres}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-open-tome}" \
  --dbname="${PGDATABASE:-open-tome}" \
  --no-password \
  --format=plain \
  --file="$DEST_FILE"

echo "[backup] wrote $DEST_FILE"

# Encrypt with GPG symmetric cipher if BACKUP_PASSPHRASE is set.
# Passphrase is fed via stdin (--passphrase-fd 0) so it never appears in ps output.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "$BACKUP_PASSPHRASE" | gpg \
    --symmetric \
    --cipher-algo AES256 \
    --batch \
    --passphrase-fd 0 \
    --output "${DEST_FILE}.gpg" \
    "$DEST_FILE" \
  && rm -f "$DEST_FILE"
  echo "[backup] encrypted to ${DEST_FILE}.gpg"
fi

# Delete backup files older than RETAIN days (plain and encrypted)
find "$DEST" -name 'open-tome_*.sql'     -mtime "+$RETAIN" -delete
find "$DEST" -name 'open-tome_*.sql.gpg' -mtime "+$RETAIN" -delete
