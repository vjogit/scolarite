#!/bin/sh
set -e

cd "$(dirname "$0")"

TARGET="${1:-prod}"
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

case "$TARGET" in
    nginx)
        IMAGE_NAME="scolarite-nginx"
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
    -t "$IMAGE_NAME" ../../
