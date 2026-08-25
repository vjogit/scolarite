#!/bin/bash
set -euo pipefail

# Usage: seed.sh <config-file> <secrets-file>
#
# Pose le jeu de données de la suite Playwright (seed.sql) dans la base
# scolarite, par un `docker exec psql` — même idiome que reset-db.sh, à côté
# duquel ce script vit conceptuellement. Idempotent : voir l'en-tête de
# seed.sql. Appelé par la cible `test-ihm` du makefile, avant les tests.

CONFIG_FILE="${1:-}"
SECRETS_FILE="${2:-}"

if [[ -z "$CONFIG_FILE" || -z "$SECRETS_FILE" ]]; then
    echo "Usage: $0 <config-file> <secrets-file>" >&2
    exit 1
fi

for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [[ -f "$f" ]] || { echo "ERREUR : fichier d'environnement introuvable : $f" >&2
                       echo "         Voir infra/env/README.md" >&2; exit 1; }
done

SEED_DIR="$(cd "$(dirname "$0")" && pwd)"

get() { grep -h "^$1=" "$CONFIG_FILE" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

PG_CONTAINER=$(get PG_CONTAINER)
SCOLARITE_DB=$(get SCOLARITE_DB)
SCOLARITE_USER=$(get SCOLARITE_USER)
SCOLARITE_PASSWORD=$(get SCOLARITE_PASSWORD)

for var in PG_CONTAINER SCOLARITE_DB SCOLARITE_USER SCOLARITE_PASSWORD; do
    [[ -n "${!var}" ]] || { echo "ERREUR : $var absent ou vide dans $CONFIG_FILE / $SECRETS_FILE" >&2; exit 1; }
done

docker inspect "$PG_CONTAINER" &>/dev/null \
    || { echo "ERREUR : container $PG_CONTAINER non démarré — lancer d'abord : make start-local-keep" >&2; exit 1; }

echo "--- 🌱 Seed Playwright (front/e2e) ---"
docker exec -i -e PGPASSWORD="$SCOLARITE_PASSWORD" "$PG_CONTAINER" \
    psql -U "$SCOLARITE_USER" -d "$SCOLARITE_DB" -v ON_ERROR_STOP=1 < "$SEED_DIR/seed.sql"
echo "--- ✅ Seed posé ---"
