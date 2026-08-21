#!/bin/bash
set -euo pipefail

# Usage: gen_sql.sh <config-file> <secrets-file>
#
# La configuration est scindée en deux : la topologie (config-*.env) et les
# secrets (secrets-*.env). Voir infra/env/README.md.

CONFIG_FILE="${1:-}"
SECRETS_FILE="${2:-}"

if [[ -z "$CONFIG_FILE" || -z "$SECRETS_FILE" ]]; then
    echo "Usage: $0 <config-file> <secrets-file>"
    exit 1
fi

for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [[ -f "$f" ]] || { echo "ERREUR : fichier d'environnement introuvable : $f" >&2
                       echo "         Voir infra/env/README.md" >&2; exit 1; }
done

CONFIG_FILE="$(realpath "$CONFIG_FILE")"
SECRETS_FILE="$(realpath "$SECRETS_FILE")"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Cherche dans la topologie PUIS dans les secrets. `-f2-` et non `-f2` : une
# valeur contenant un « = » (padding base64) serait sinon tronquée en silence.
get() { grep -h "^$1=" "$CONFIG_FILE" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

PG_CONTAINER=$(get PG_CONTAINER)
POSTGRES_HOST=$(get POSTGRES_HOST)
POSTGRES_PORT=$(get POSTGRES_PORT)
POSTGRES_USER=$(get POSTGRES_USER)
POSTGRES_PASSWORD=$(get POSTGRES_PASSWORD)
SCOLARITE_DB=$(get SCOLARITE_DB)

DB_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST:$POSTGRES_PORT/$SCOLARITE_DB"

BACK_DIR="$PROJECT_ROOT/back"
SCHEMA_FILE_POSTGRES="schema.sql"

echo "--- 🐘 1. Extraction du schéma PostgreSQL ---"
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$SCOLARITE_DB" -s -x -O -T "databasechangelog*" > "$BACK_DIR/$SCHEMA_FILE_POSTGRES"

echo "--- 🧹 2. Nettoyage du fichier SQL ---"
sed -i '/restrict/d' "$BACK_DIR/$SCHEMA_FILE_POSTGRES"
sed -i '/unrestrict/d' "$BACK_DIR/$SCHEMA_FILE_POSTGRES"
sed -i '/^--/d' "$BACK_DIR/$SCHEMA_FILE_POSTGRES"

echo "--- 🏗️ 3. Lancement de sqlc generate ---"
(cd "$BACK_DIR"   && sqlc generate)

