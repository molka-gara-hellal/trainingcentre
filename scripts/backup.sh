#!/usr/bin/env bash
# Sauvegarde PostgreSQL (format custom, compressé) de la pile Docker de production.
#   ./scripts/backup.sh [dossier]      # défaut : ./backups
# Cron (tous les jours à 02:30) :  30 2 * * * cd /opt/training-center && ./scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${1:-backups}"; KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
mkdir -p "$DIR"; umask 077
FILE="$DIR/center-$(date +%Y%m%d-%H%M%S).dump"
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE"
[ -s "$FILE" ] || { echo "Sauvegarde vide : échec" >&2; rm -f "$FILE"; exit 1; }
find "$DIR" -name 'center-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "OK $FILE ($(du -h "$FILE" | cut -f1))"
