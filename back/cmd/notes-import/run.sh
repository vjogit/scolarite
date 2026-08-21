#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DUMP="$SCRIPT_DIR/../../../infra/data/bd/dump_cyber_notes.sql"
ENV_DIR="$SCRIPT_DIR/../../../infra/env"
CONFIG_FILE="$ENV_DIR/config-local.env"
SECRETS_FILE="$ENV_DIR/secrets-local.env"
CONFIG="$SCRIPT_DIR/config.yaml"
IMPORT_DIR="$SCRIPT_DIR"
MARIADB_CONTAINER="mariadb-import"
DOCKER_NETWORK="infra-scolarite_scolarite-net"
# Keycloak et PostgreSQL ne sont plus réécrits ici : config.yaml les prend dans
# les fichiers d'environnement (KC_INTERNAL_HOSTNAME, POSTGRES_*), qui portent
# déjà les IP du réseau docker. Seule MariaDB reste, ce container n'existant que
# le temps de ce script.
MARIADB_IP="10.20.2.10"  # IP fixe du container mariadb éphémère sur le même réseau

cleanup() {
    echo ""
    echo "==> Nettoyage..."
    docker rm -f "$MARIADB_CONTAINER" 2>/dev/null || true
    if [[ -f "${CONFIG}.bak" ]]; then
        mv "${CONFIG}.bak" "$CONFIG"
        echo "    config.yaml restauré"
    fi
}
trap cleanup EXIT INT TERM

# Vérifications préalables
[[ -f "$DUMP" ]]     || { echo "ERREUR : dump introuvable : $DUMP"; exit 1; }
for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [[ -f "$f" ]] || { echo "ERREUR : fichier d'environnement introuvable : $f"; exit 1; }
done
# shellcheck source=/dev/null
set -a; source "$CONFIG_FILE"; source "$SECRETS_FILE"; set +a
docker info &>/dev/null || { echo "ERREUR : Docker non disponible"; exit 1; }
docker inspect "$PG_CONTAINER" &>/dev/null \
    || { echo "ERREUR : container $PG_CONTAINER non démarré (lance make start-local-keep)"; exit 1; }

echo "==> Sauvegarde de config.yaml"
cp "$CONFIG" "${CONFIG}.bak"

echo "==> Mise à jour de config.yaml"
sed -i -e "s|tcp(localhost:3306)|tcp(${MARIADB_IP}:3306)|g" "$CONFIG"

echo "==> Démarrage du container MariaDB éphémère sur ${DOCKER_NETWORK}"
docker run -d \
    --name "$MARIADB_CONTAINER" \
    --network "$DOCKER_NETWORK" \
    --ip "$MARIADB_IP" \
    -e MYSQL_ROOT_PASSWORD=root \
    -e MYSQL_DATABASE=cyber_notes_v2 \
    mariadb:10.5

echo -n "==> Attente de MariaDB"
until docker exec "$MARIADB_CONTAINER" mysql -uroot -proot -e "SELECT 1" &>/dev/null; do
    printf "."
    sleep 2
done
echo " OK"

echo "==> Chargement du dump MariaDB (~900k lignes, peut prendre quelques minutes)..."
docker exec -i "$MARIADB_CONTAINER" mysql -uroot -proot cyber_notes_v2 < "$DUMP"
echo "    Dump chargé"

echo "==> Lancement de l'import Go..."
cd "$IMPORT_DIR"
go run . -config config.yaml

echo ""
echo "==> Import terminé avec succès"
