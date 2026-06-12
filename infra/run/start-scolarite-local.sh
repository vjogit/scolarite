#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_ROOT="$(cd ../.. && pwd)"

SECRETS_FILE_LOCAL="$PROJECT_ROOT/.vscode/secrets-local.env"

echo "--- 🔧 Génération de la configuration ---"
set -a
# shellcheck source=/dev/null
source "$SECRETS_FILE_LOCAL"
set +a
mkdir -p "/home/vjo/.scolarite/conf"
envsubst < ./config-local.yaml > "/home/vjo/.scolarite/conf/config.yaml"

export VERSION=$(git -C "$PROJECT_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "--- 🐳 Build et lancement des containers ---"
docker compose -f compose.yaml down 2>/dev/null || true
docker compose -f compose.yaml up --build -d

echo "--- ✅ Application disponible sur http://10.20.2.5:9021 ---"
echo "--- 🐛 Delve disponible sur localhost:2345 ---"
