#!/usr/bin/env bash
# Backs up the iofus SQLite database using SQLite's online backup API.
# Safe to run against a live, in-use database — no downtime required.
# Recommended: run every 15-60 minutes via cron or a similar scheduler.
#
# Usage:
#   IOFUS_DB_PATH=/data/iofus.db BACKUP_DIR=/backups ./scripts/backup.sh
#
# Defaults:
#   IOFUS_DB_PATH  ./app/iofus.db
#   BACKUP_DIR     ./backups
#   KEEP_DAYS      7   (delete backups older than this many days)

set -euo pipefail

DB_PATH="${IOFUS_DB_PATH:-./app/iofus.db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DEST="$BACKUP_DIR/iofus-$TIMESTAMP.db"

sqlite3 "$DB_PATH" ".backup $DEST"
echo "Backup written to $DEST"

# Prune old backups.
find "$BACKUP_DIR" -name "iofus-*.db" -mtime +"$KEEP_DAYS" -delete
echo "Pruned backups older than $KEEP_DAYS days"
