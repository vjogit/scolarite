#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/../../../.vscode/secrets-local.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[[ -f "$ENV_FILE" ]] || { echo "ERREUR : fichier env introuvable : $ENV_FILE"; exit 1; }
# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

cd "$SCRIPT_DIR"
go run . -config config.yaml "$@"
