#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DUMP="$SCRIPT_DIR/../../../infra/data/bd/dump_cyber_notes.sql"
ENV_FILE="$SCRIPT_DIR/../../../.vscode/secrets-local.env"
CONFIG="$SCRIPT_DIR/config.yaml"
IMPORT_DIR="$SCRIPT_DIR"
MARIADB_CONTAINER="mariadb-import"
DOCKER_NETWORK="keycloak-postgres_scolarite-net"
KC_IP="10.20.2.2"    # IP fixe du container keycloak dans keycloak-postgres_scolarite-net
PG_IP="10.20.2.3"    # IP fixe du container postgres dans keycloak-postgres_scolarite-net
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
[[ -f "$ENV_FILE" ]] || { echo "ERREUR : fichier env introuvable : $ENV_FILE"; exit 1; }
# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a
docker info &>/dev/null || { echo "ERREUR : Docker non disponible"; exit 1; }
docker inspect postgres-16.10-alpine &>/dev/null \
    || { echo "ERREUR : container postgres-16.10-alpine non démarré (lance docker compose up -d)"; exit 1; }

echo "==> Sauvegarde de config.yaml"
cp "$CONFIG" "${CONFIG}.bak"

echo "==> Mise à jour de config.yaml"
sed -i \
    -e "s|localhost:8080|${KC_IP}:8080|g" \
    -e "s|tcp(localhost:3306)|tcp(${MARIADB_IP}:3306)|g" \
    -e "s|@localhost:5432/|@${PG_IP}:5432/|g" \
    "$CONFIG"

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
