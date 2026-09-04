#!/bin/bash
set -euo pipefail

# Usage : playwright.sh [arguments de `npx playwright test`…]
#
# Lance la suite Playwright (front/e2e) dans le conteneur de référence
# (Dockerfile voisin) — le seul environnement où les captures de référence se
# comparent et se régénèrent, identique sur le poste et sur l'exécuteur
# GitHub. Appelé par les cibles `test-ihm` et `captures-reference` de
# makefile.local ; la CI (.github/workflows/e2e.yml) passe par ces mêmes
# cibles. Voir docs/ci.md §10.
#
# Ce que le conteneur reçoit, et pourquoi :
#   * le dépôt, monté AU MÊME CHEMIN qu'à l'extérieur — env.ts résout les
#     fichiers d'environnement depuis sa propre position, seed.sh et les
#     rapports (test-results/, playwright-report/, e2e/.auth/) s'écrivent
#     dans l'arborescence du poste ;
#   * l'identité de l'appelant (--user) : les fichiers écrits lui
#     appartiennent, pas à root ; le groupe du socket Docker s'y ajoute pour
#     que `docker exec` (le seed) passe ;
#   * le réseau de l'hôte (--network host) : la stack répond sur
#     https://10.20.2.5:9021, adresse du bridge Docker joignable depuis
#     l'hôte, donc depuis ce conteneur ;
#   * les variables que la suite lit : CONFIG_FILE_LOCAL / SECRETS_FILE_LOCAL
#     (exportées par makefile.local ; absentes, env.ts retombe sur les
#     fichiers du poste), PLAYWRIGHT_BASE_URL, et CI (Playwright y adapte ses
#     reporters) — transmises telles quelles quand elles sont définies ;
#   * node_modules du poste (dans le dépôt monté) : même lockfile, même
#     architecture ; seul le navigateur vient de l'image, à la version que
#     @playwright/test attend.
#
# L'image se (re)construit à chaque appel : c'est un cache Docker — quelques
# secondes quand rien n'a changé, le temps du téléchargement de l'image de
# base la première fois.

ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/../../.." && pwd)"
IMAGE=scolarite-playwright-reference
SOCKET=/var/run/docker.sock

[[ -S "$SOCKET" ]] || { echo "ERREUR : socket Docker absent ($SOCKET) — le seed passe par docker exec" >&2; exit 1; }
[[ -d "$RACINE/front/node_modules" ]] || { echo "ERREUR : front/node_modules absent — lancer d'abord : (cd front && npm ci)" >&2; exit 1; }

echo "--- 🐳 Conteneur de référence Playwright ($IMAGE) ---"
docker build --quiet -t "$IMAGE" "$ICI" > /dev/null

# -t seulement quand la sortie est un terminal : sous make en CI, il n'y en a pas.
tty=()
[[ -t 1 ]] && tty=(-t)

exec docker run --rm --init "${tty[@]}" \
    --network host \
    --user "$(id -u):$(id -g)" --group-add "$(stat -c %g "$SOCKET")" \
    -v "$RACINE:$RACINE" \
    -v "$SOCKET:$SOCKET" \
    -w "$RACINE/front" \
    -e HOME=/tmp \
    -e CONFIG_FILE_LOCAL -e SECRETS_FILE_LOCAL -e PLAYWRIGHT_BASE_URL -e CI \
    "$IMAGE" npx playwright test "$@"
