#!/bin/bash
set -euo pipefail

# Usage : start-scolarite.sh <local|prod>
#
# Rend le config.yaml du backend depuis sa source unique
# (back/cmd/serveur/config.yaml, également lue telle quelle par le debugger
# VSCode), puis (re)lance la composition applicative (backend + nginx).

cd "$(dirname "$0")"
PROJECT_ROOT="$(cd ../.. && pwd)"

ENV_NAME="${1:-}"
case "$ENV_NAME" in
    local|prod) ;;
    *) echo "Usage: $0 <local|prod>" >&2; exit 2 ;;
esac

# Configuration scindée en deux : la topologie (versionnée) et les secrets.
# Voir infra/env/README.md.
#
# Par défaut, les fichiers de l'espace de travail (config-<env>.env,
# secrets-<env>.env). makefile.local les passe explicitement — CONFIG_FILE et
# SECRETS_FILE, les noms que compose.yaml consomme déjà —, ce qui laisse la CI
# substituer config-ci.env sans changer d'espace de travail : l'exécuteur
# GitHub est un poste « local » à d'autres chemins (voir infra/env/config-ci.env),
# et ce script dérivait les noms de fichiers en parallèle du makefile.
CONFIG_FILE="${CONFIG_FILE:-$PROJECT_ROOT/infra/env/config-$ENV_NAME.env}"
SECRETS_FILE="${SECRETS_FILE:-$PROJECT_ROOT/infra/env/secrets-$ENV_NAME.env}"

# Source unique du config.yaml, partagée avec le lancement hors conteneur.
CONFIG_TEMPLATE="$PROJECT_ROOT/back/cmd/serveur/config.yaml"

# Un fichier absent ne doit pas passer inaperçu : envsubst remplacerait les
# valeurs manquantes par des chaînes VIDES et le déploiement réussirait avec
# une configuration creuse.
for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [ -f "$f" ] || { echo "❌ Fichier d'environnement absent : $f" >&2
                     echo "   Voir infra/env/README.md" >&2; exit 1; }
done
[ -f "$CONFIG_TEMPLATE" ] || { echo "ERREUR : source de configuration introuvable : $CONFIG_TEMPLATE" >&2; exit 1; }

echo "--- 🔧 Génération de la configuration ($ENV_NAME) ---"
set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
# shellcheck source=/dev/null
source "$SECRETS_FILE"
set +a

CONF_DIR="${SCOLARITE_CONF_DIR:?SCOLARITE_CONF_DIR absent de $CONFIG_FILE}"
mkdir -p "$CONF_DIR"

# keycloak.ca_cert : chemin DANS le conteneur, fixé par le montage déclaré dans
# compose.yaml — ce n'est pas de la topologie d'environnement, il n'a donc rien
# à faire dans infra/env. Il vit ici, à côté de la copie du fichier qu'il
# désigne.
#
# [DEV-LOCAL] Seul le conteneur local en a besoin : il ne connaît pas la CA
# mkcert qui signe l'issuer. En prod l'issuer porte un certificat d'une CA
# publique, et la variable reste vide — le backend s'en tient aux CA système.
# Hors conteneur (debugger VSCode), personne ne la définit : même résultat.
SCOLARITE_CA_CERT=""
if [ "$ENV_NAME" = "local" ] && command -v mkcert >/dev/null 2>&1; then
    cp "$(mkcert -CAROOT)/rootCA.pem" "$CONF_DIR/rootCA.pem"
    SCOLARITE_CA_CERT=/opt/scolarite/conf/rootCA.pem
fi
export SCOLARITE_CA_CERT

# registre.timestamp.caCertPath : même mécanisme que SCOLARITE_CA_CERT — le
# certificat racine FreeTSA vit sur l'hôte (REGISTRE_TSA_CA_CERT, obtenu par
# `make fetch-freetsa-cert`), le conteneur ne voit que sa copie dans le
# répertoire de conf monté. S'il n'a pas été téléchargé, le chemin hôte est
# rendu tel quel : le backend démarre et signale le fichier manquant en erreur
# (l'ancrage observe la chaîne, il ne la gouverne pas).
if [ -n "${REGISTRE_TSA_CA_CERT:-}" ] && [ -f "$REGISTRE_TSA_CA_CERT" ]; then
    cp "$REGISTRE_TSA_CA_CERT" "$CONF_DIR/freetsa-cacert.pem"
    export REGISTRE_TSA_CA_CERT=/opt/scolarite/conf/freetsa-cacert.pem
fi

# Le backend conteneurisé n'est joignable que derrière nginx : son issuer OIDC
# doit donc être l'URL de nginx, pas celle du serveur Vite que porte
# KC_HOSTNAME dans l'espace de travail local. En prod les deux coïncident déjà,
# et config-prod.env ne définit pas KC_HOSTNAME_CONTENEURS : le repli laisse
# alors KC_HOSTNAME intact.
export KC_HOSTNAME="${KC_HOSTNAME_CONTENEURS:-$KC_HOSTNAME}"

envsubst < "$CONFIG_TEMPLATE" > "$CONF_DIR/config.yaml"

# nginx.conf, même mécanisme, même répertoire de conf que le backend. Liste de
# substitution restreinte à la seule variable qu'on lui destine : nginx.conf
# est plein de ses propres $variables ($host, $remote_addr, $scheme...), un
# envsubst sans restriction les prendrait pour des variables d'environnement
# absentes et les viderait.
NGINX_CONF_TEMPLATE="$PROJECT_ROOT/infra/run/build/nginx.conf"
[ -f "$NGINX_CONF_TEMPLATE" ] || { echo "ERREUR : gabarit nginx introuvable : $NGINX_CONF_TEMPLATE" >&2; exit 1; }
: "${NGINX_TRUSTED_PROXIES:?NGINX_TRUSTED_PROXIES absent de $CONFIG_FILE}"
envsubst '${NGINX_TRUSTED_PROXIES}' < "$NGINX_CONF_TEMPLATE" > "$CONF_DIR/nginx.conf"

# Consommés par infra/run/compose.yaml.
export CONFIG_FILE SECRETS_FILE
export BACKEND_TARGET="$ENV_NAME"
# Mode Vite du build front. « local » est un nom de mode interdit par
# Vite (conflit avec le suffixe .local des fichiers d'env) : l'espace de
# travail local bâtit donc front/.env.conteneurs.
if [ "$ENV_NAME" = "local" ]; then
    export FRONT_MODE="conteneurs"
else
    export FRONT_MODE="production"
fi
export VERSION=$(git -C "$PROJECT_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "--- 🐳 Build et lancement des containers ---"
docker compose -f compose.yaml down 2>/dev/null || true
docker compose -f compose.yaml up --build -d

echo "--- ✅ Application disponible sur https://10.20.2.5:9021 ---"
if [ "$ENV_NAME" = "local" ]; then
    echo "--- 🐛 Delve disponible sur localhost:2345 ---"
fi
