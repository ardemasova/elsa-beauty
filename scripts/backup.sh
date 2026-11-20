#!/usr/bin/env bash
# Daily backup of the database and uploaded photos.
#
#   ./scripts/backup.sh                 # run by hand
#   crontab -e  ->  15 3 * * * /home/elsa/ELSA_BEAUTY/ELSA_BEAUTY_git/scripts/backup.sh >> /home/elsa/backups/backup.log 2>&1
#
# Keeps the last KEEP_DAYS days locally (default 14). If BACKUP_REMOTE is set
# in .env (an rsync/scp target such as
# "u123456@u123456.your-storagebox.de:elsa-backups/"), every backup is also
# copied off the server - a backup that lives only on the server is lost
# together with the server.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
cd "$PROJECT_DIR"

# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-ELSA_BEAUTY}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F_%H%M)"
DB_FILE="$BACKUP_DIR/elsa_db_$STAMP.dump"
UP_FILE="$BACKUP_DIR/elsa_uploads_$STAMP.tar.gz"

docker compose exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DB_FILE.part"
# A dump that cannot be listed is broken: fail loudly instead of keeping it.
docker compose exec -T db pg_restore --list < "$DB_FILE.part" > /dev/null
mv "$DB_FILE.part" "$DB_FILE"

tar -czf "$UP_FILE" -C backend uploads 2>/dev/null || tar -czf "$UP_FILE" --files-from /dev/null

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a -e "ssh -p ${BACKUP_REMOTE_PORT:-23}" "$DB_FILE" "$UP_FILE" "$BACKUP_REMOTE"
fi

find "$BACKUP_DIR" -name 'elsa_db_*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'elsa_uploads_*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%F %T') backup OK: $(du -h "$DB_FILE" | cut -f1) db, $(du -h "$UP_FILE" | cut -f1) uploads${BACKUP_REMOTE:+, copied off-site}"
