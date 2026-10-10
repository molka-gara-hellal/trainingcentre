#!/usr/bin/env bash
# Restaure une sauvegarde : REMPLACE le contenu de la base (confirmation demandée).
#   ./scripts/restore.sh backups/center-20261010-023000.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Usage : $0 <fichier.dump>}"; [ -f "$FILE" ] || { echo "Fichier introuvable : $FILE" >&2; exit 1; }
COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)
read -r -p "Ceci ÉCRASE la base actuelle avec $FILE. Taper OUI pour continuer : " ok; [ "$ok" = "OUI" ] || exit 1
"${COMPOSE[@]}" stop web api
"${COMPOSE[@]}" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$FILE"
"${COMPOSE[@]}" start api web
echo "Restauration terminée."
