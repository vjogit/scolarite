#!/bin/bash
set -euo pipefail

# Usage: reset-db.sh <config-file> <secrets-file>
#
# Détruit puis recrée les deux bases — celle de Keycloak et celle de
# l'application — ainsi que leurs rôles. DESTRUCTIF : appelé par les cibles
# start-local-reset / start-prod-reset, qui portent les garde-fous (la variante
# prod demande une confirmation tapée).
#
# La configuration est scindée en deux : la topologie (config-*.env) et les
# secrets (secrets-*.env). Voir infra/env/README.md.

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

# Cherche dans la topologie PUIS dans les secrets. `-f2-` et non `-f2` : une
# valeur contenant un « = » (padding base64) serait sinon tronquée en silence.
get() { grep -h "^$1=" "$CONFIG_FILE" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

PG_CONTAINER=$(get PG_CONTAINER)
POSTGRES_USER=$(get POSTGRES_USER)

KC_DB_NAME=$(get KC_DB_NAME)
KC_DB_USERNAME=$(get KC_DB_USERNAME)
KC_DB_PASSWORD=$(get KC_DB_PASSWORD)

SCOLARITE_DB=$(get SCOLARITE_DB)
SCOLARITE_USER=$(get SCOLARITE_USER)
SCOLARITE_PASSWORD=$(get SCOLARITE_PASSWORD)

# Une variable absente donne une chaîne vide, et une chaîne vide donnerait ici
# un « DROP DATABASE IF EXISTS ; » — erreur de syntaxe illisible. C'est le piège
# décrit dans infra/env/README.md : on le referme explicitement.
for var in PG_CONTAINER POSTGRES_USER KC_DB_NAME KC_DB_USERNAME KC_DB_PASSWORD \
           SCOLARITE_DB SCOLARITE_USER SCOLARITE_PASSWORD; do
    [[ -n "${!var}" ]] || { echo "ERREUR : $var absent ou vide dans $CONFIG_FILE / $SECRETS_FILE" >&2; exit 1; }
done

docker inspect "$PG_CONTAINER" &>/dev/null \
    || { echo "ERREUR : container $PG_CONTAINER non démarré" >&2; exit 1; }

psql_c() { docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -c "$1"; }

# Un mot de passe contenant une apostrophe couperait le littéral SQL en deux.
# PostgreSQL les attend doublées.
sql_literal() { printf "'%s'" "${1//\'/\'\'}"; }

echo "--- 🗑️  Suppression des bases de données ---"
# Les connexions ouvertes empêchent le DROP : Keycloak et le backend tiennent
# chacun un pool, même arrêtés depuis quelques secondes.
psql_c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$KC_DB_NAME', '$SCOLARITE_DB');"
psql_c "DROP DATABASE IF EXISTS $KC_DB_NAME;"
psql_c "DROP DATABASE IF EXISTS $SCOLARITE_DB;"
psql_c "DROP USER IF EXISTS $KC_DB_USERNAME;"
psql_c "DROP USER IF EXISTS $SCOLARITE_USER;"

echo "--- 🆕 Création des bases de données ---"
psql_c "CREATE USER $KC_DB_USERNAME WITH PASSWORD $(sql_literal "$KC_DB_PASSWORD");"
psql_c "CREATE DATABASE $KC_DB_NAME WITH OWNER = $KC_DB_USERNAME;"
psql_c "GRANT ALL PRIVILEGES ON DATABASE $KC_DB_NAME TO $KC_DB_USERNAME;"

psql_c "CREATE USER $SCOLARITE_USER WITH PASSWORD $(sql_literal "$SCOLARITE_PASSWORD");"
psql_c "CREATE DATABASE $SCOLARITE_DB WITH OWNER = $SCOLARITE_USER;"
psql_c "GRANT ALL PRIVILEGES ON DATABASE $SCOLARITE_DB TO $SCOLARITE_USER;"
