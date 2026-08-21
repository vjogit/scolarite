#!/usr/bin/env bash
set -euo pipefail

ENV_DIR="$(cd "$(dirname "$0")" && pwd)/../../../infra/env"
CONFIG_FILE="$ENV_DIR/config-local.env"
SECRETS_FILE="$ENV_DIR/secrets-local.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [[ -f "$f" ]] || { echo "ERREUR : fichier d'environnement introuvable : $f"; exit 1; }
done
# shellcheck source=/dev/null
set -a; source "$CONFIG_FILE"; source "$SECRETS_FILE"; set +a

cd "$SCRIPT_DIR"
go run . -config config.yaml "$@"
