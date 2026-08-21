#!/bin/bash
set -euo pipefail

# Usage: migrate.sh <config-file> <secrets-file>
#
# Applique les changesets Liquibase (db.changelog-master.yaml) sur la base de
# l'application. Télécharge au passage le pilote JDBC s'il manque : liquibase
# le cherche dans liquibase_libs/, répertoire non versionné.
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

LIQUIBASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Cherche dans la topologie PUIS dans les secrets. `-f2-` et non `-f2` : une
# valeur contenant un « = » (padding base64) serait sinon tronquée en silence.
get() { grep -h "^$1=" "$CONFIG_FILE" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

POSTGRES_HOST=$(get POSTGRES_HOST)
POSTGRES_PORT=$(get POSTGRES_PORT)
SCOLARITE_DB=$(get SCOLARITE_DB)
SCOLARITE_USER=$(get SCOLARITE_USER)
SCOLARITE_PASSWORD=$(get SCOLARITE_PASSWORD)

for var in POSTGRES_HOST POSTGRES_PORT SCOLARITE_DB SCOLARITE_USER SCOLARITE_PASSWORD; do
    [[ -n "${!var}" ]] || { echo "ERREUR : $var absent ou vide dans $CONFIG_FILE / $SECRETS_FILE" >&2; exit 1; }
done

# Version unique : elle apparaissait deux fois dans la recette make, dans le
# test de présence et dans l'URL de téléchargement.
JDBC_VERSION=42.7.8
JDBC_JAR="$LIQUIBASE_DIR/liquibase_libs/postgresql-${JDBC_VERSION}.jar"

if [[ ! -f "$JDBC_JAR" ]]; then
    echo "--- ⬇️  Téléchargement du pilote JDBC PostgreSQL ${JDBC_VERSION} ---"
    mkdir -p "$(dirname "$JDBC_JAR")"
    wget -q --show-progress -O "$JDBC_JAR" \
        "https://repo1.maven.org/maven2/org/postgresql/postgresql/${JDBC_VERSION}/postgresql-${JDBC_VERSION}.jar" \
        || { rm -f "$JDBC_JAR"; echo "ERREUR : téléchargement du pilote JDBC échoué" >&2; exit 1; }
fi

echo "--- 🚀 Application des migrations Liquibase ---"
cd "$LIQUIBASE_DIR"
liquibase update \
    --url="jdbc:postgresql://${POSTGRES_HOST}:${POSTGRES_PORT}/${SCOLARITE_DB}" \
    --username="$SCOLARITE_USER" \
    --password="$SCOLARITE_PASSWORD"
