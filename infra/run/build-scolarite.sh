#!/bin/sh
# Construit les deux images publiables — backend (cible prod, sans Delve) et
# nginx — sous ${IMAGES_REGISTRE}scolarite-{backend,nginx}:${IMAGES_TAG}, et les
# pousse si un registre est donné.
#
# Usage : build-scolarite.sh [--push]
#   IMAGES_TAG       étiquette (défaut : git describe --tags --always --dirty)
#   IMAGES_REGISTRE  préfixe du registre, barre oblique finale comprise
#                    (ex. ghcr.io/compte/) ; vide = images locales seulement,
#                    --push est alors refusé.
#
# Les images sont neutres vis-à-vis de l'environnement : ni certificat, ni URL
# du front, ni configuration (tout est monté ou rendu au déploiement par
# start-scolarite.sh). Une image construite ici est celle que la prod tire,
# et celle qu'une répétition sur le poste lance en IMAGES_MODE=pull.
# Invocation par le makefile racine : `make publier-images`.
set -eu

cd "$(dirname "$0")"

PUSH=0
case "${1:-}" in
    "") ;;
    --push) PUSH=1 ;;
    *) echo "Usage: $0 [--push]" >&2; exit 2 ;;
esac

VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
IMAGES_TAG="${IMAGES_TAG:-$VERSION}"
IMAGES_REGISTRE="${IMAGES_REGISTRE:-}"
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ "$PUSH" = 1 ] && [ -z "$IMAGES_REGISTRE" ]; then
    echo "❌ --push sans IMAGES_REGISTRE : indiquer le registre (ex. IMAGES_REGISTRE=ghcr.io/compte/)" >&2
    exit 1
fi

construire() {
    cible="$1"; image="$2"
    ref="${IMAGES_REGISTRE}${image}:${IMAGES_TAG}"
    echo "--- 🐳 Build de $ref (target: $cible) ---"
    docker build -f ./build/Dockerfile \
        --target "$cible" \
        --build-arg VERSION="$VERSION" \
        --build-arg BUILD_TIME="$BUILD_TIME" \
        -t "$ref" ../../
    if [ "$PUSH" = 1 ]; then
        echo "--- ⬆️  Push de $ref ---"
        docker push "$ref"
    fi
}

construire prod  scolarite-backend
construire nginx scolarite-nginx

echo "--- ✅ Images ${IMAGES_REGISTRE}scolarite-{backend,nginx}:${IMAGES_TAG} $([ "$PUSH" = 1 ] && echo poussées || echo construites) ---"
