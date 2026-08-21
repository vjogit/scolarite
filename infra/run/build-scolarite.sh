#!/bin/sh
set -e

cd "$(dirname "$0")"

TARGET="${1:-prod}"
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

case "$TARGET" in
    nginx)
        IMAGE_NAME="scolarite-nginx"
        # Mode Vite du build front. Sans cette valeur l'image retomberait sur
        # le défaut « production » de l'ARG du Dockerfile, et servirait les URL
        # de prod depuis la pile locale.
        FRONT_MODE="${FRONT_MODE:-conteneurs}"
        if [ ! -f ./build/ssl/nginx.crt ] || [ ! -f ./build/ssl/nginx.key ]; then
            echo "--- 🔐 Génération des certificats mkcert pour nginx ---"
            mkdir -p ./build/ssl
            mkcert -key-file ./build/ssl/nginx.key -cert-file ./build/ssl/nginx.crt 10.20.2.5
        fi
        ;;
    *)
        IMAGE_NAME="scolarite-backend"
        ;;
esac

echo "--- 🐳 Build de l'image $IMAGE_NAME (target: $TARGET) ---"
docker build -f ./build/Dockerfile \
    --target "$TARGET" \
    --build-arg VERSION="$VERSION" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    ${FRONT_MODE:+--build-arg FRONT_MODE="$FRONT_MODE"} \
    -t "$IMAGE_NAME" ../../
