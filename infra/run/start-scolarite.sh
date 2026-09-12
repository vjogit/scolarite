#!/bin/bash
set -euo pipefail

# Usage : start-scolarite.sh <local|prod>
#
# Rend le config.yaml du backend depuis sa source unique
# (back/cmd/serveur/config.yaml, également lue telle quelle par le debugger
# VSCode), dépose ce que les conteneurs montent (nginx.conf, certificat TLS,
# CA), puis (re)lance la composition applicative (backend + nginx) — en
# construisant les images (IMAGES_MODE=build) ou en prenant celles d'un
# registre (IMAGES_MODE=pull). Voir docs/deployements.md, « Images ».

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

# Les trois variables IMAGES_* ont leur valeur dans config-<env>.env, mais un
# déploiement les surcharge sur la ligne de commande — `make start-prod-keep
# IMAGES_TAG=v1.4.0`, ou une répétition du mode pull sur le poste. `source`
# ci-dessous écraserait ces surcharges : on les retient avant, on les repose
# après.
IMAGES_MODE_CLI="${IMAGES_MODE:-}"
IMAGES_REGISTRE_CLI="${IMAGES_REGISTRE-__non_defini__}"
IMAGES_TAG_CLI="${IMAGES_TAG:-}"

echo "--- 🔧 Génération de la configuration ($ENV_NAME) ---"
set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
# shellcheck source=/dev/null
source "$SECRETS_FILE"
set +a

[ -n "$IMAGES_MODE_CLI" ] && IMAGES_MODE="$IMAGES_MODE_CLI"
[ "$IMAGES_REGISTRE_CLI" != "__non_defini__" ] && IMAGES_REGISTRE="$IMAGES_REGISTRE_CLI"
[ -n "$IMAGES_TAG_CLI" ] && IMAGES_TAG="$IMAGES_TAG_CLI"
IMAGES_MODE="${IMAGES_MODE:-build}"
IMAGES_REGISTRE="${IMAGES_REGISTRE:-}"
IMAGES_TAG="${IMAGES_TAG:-latest}"
case "$IMAGES_MODE" in
    build|pull) ;;
    *) echo "❌ IMAGES_MODE vaut « $IMAGES_MODE » : attendu build ou pull (infra/env/README.md)" >&2; exit 1 ;;
esac
export IMAGES_MODE IMAGES_REGISTRE IMAGES_TAG

CONF_DIR="${SCOLARITE_CONF_DIR:?SCOLARITE_CONF_DIR absent de $CONFIG_FILE}"
mkdir -p "$CONF_DIR"

# ── Certificat TLS de nginx : hors de l'image, monté depuis $CONF_DIR/ssl ────
# compose.yaml monte ce répertoire sur /etc/nginx/ssl en lecture seule. L'image
# nginx n'embarque donc ni clé ni certificat : elle peut être poussée sur un
# registre et servir tous les environnements.
SSL_DIR="$CONF_DIR/ssl"
NGINX_CRT="$SSL_DIR/nginx.crt"
NGINX_KEY="$SSL_DIR/nginx.key"

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
if [ "$ENV_NAME" = "local" ]; then
    # mkcert n'est pas optionnel en local : sans la CA dans sa configuration,
    # le backend démarre, la connexion Keycloak réussit, et chaque appel d'API
    # répond 503 « Service d'authentification indisponible » (la découverte
    # OIDC échoue en TLS). Mieux vaut échouer ici, avec le remède.
    command -v mkcert >/dev/null 2>&1 || {
        echo "❌ mkcert introuvable : l'espace de travail local en a besoin (CA de l'issuer Keycloak)." >&2
        echo "   sudo apt install mkcert libnss3-tools && mkcert -install   (docs/deployements.md)" >&2
        exit 1
    }

    # Certificat mkcert de nginx (10.20.2.5). Généré quand il manque (poste ou
    # exécuteur neuf : la CI n'a aucune étape pour lui, c'est ce script qui
    # prouve qu'un poste neuf démarre), et régénéré quand il n'est plus signé
    # par la CA courante (CA recréée après réinstallation du poste — le backend
    # le refuserait de la même façon). La génération précède la copie de la
    # racine : mkcert crée sa CA au premier certificat si elle n'existe pas.
    if [ ! -f "$NGINX_CRT" ] || [ ! -f "$NGINX_KEY" ]; then
        echo "--- 🔐 Génération du certificat mkcert de nginx (10.20.2.5) ---"
    elif [ -f "$(mkcert -CAROOT)/rootCA.pem" ] && command -v openssl >/dev/null 2>&1 \
         && ! openssl verify -CAfile "$(mkcert -CAROOT)/rootCA.pem" "$NGINX_CRT" >/dev/null 2>&1; then
        echo "--- 🔐 Certificat de nginx signé par une autre CA que celle du poste : régénération ---"
        rm -f "$NGINX_CRT" "$NGINX_KEY"
    fi
    if [ ! -f "$NGINX_CRT" ] || [ ! -f "$NGINX_KEY" ]; then
        mkdir -p "$SSL_DIR"
        mkcert -key-file "$NGINX_KEY" -cert-file "$NGINX_CRT" 10.20.2.5
    fi
    # [DEV-LOCAL] mkcert écrit la clé en 0600 pour le compte du poste ; montée
    # telle quelle, nginx (utilisateur scolarite de l'image, UID 10001) ne peut
    # pas la lire et boucle au démarrage. Clé d'une CA de développement, sans
    # valeur hors du poste : lisible suffit. En prod, c'est le dépôt du
    # certificat qui règle les droits (chown 10001), vérifié ci-dessous.
    chmod 0644 "$NGINX_KEY"

    cp "$(mkcert -CAROOT)/rootCA.pem" "$CONF_DIR/rootCA.pem"
    SCOLARITE_CA_CERT=/opt/scolarite/conf/rootCA.pem
else
    # En prod, rien n'est généré : le certificat réel (CA publique ou CA de
    # l'établissement) se dépose à la main, et son renouvellement le remplace
    # sur place. Un fichier absent ferait tomber nginx au démarrage, sans
    # message utile — autant le dire ici.
    if [ ! -f "$NGINX_CRT" ] || [ ! -f "$NGINX_KEY" ]; then
        echo "❌ Certificat TLS de nginx absent : $NGINX_CRT et $NGINX_KEY attendus." >&2
        echo "   Déposer le certificat et sa clé (docs/deployements.md, « Certificats HTTPS »)." >&2
        exit 1
    fi
    # La clé est lue par l'utilisateur scolarite de l'image (UID/GID 10001,
    # fixés dans le Dockerfile). Trois façons d'y satisfaire : propriétaire
    # 10001, groupe 10001 avec mode g+r, ou mode o+r. Sinon nginx boucle au
    # démarrage sur « Permission denied » — autant le dire avant.
    lire_stat() { stat -c "$1" "$NGINX_KEY"; }
    if ! { [ "$(lire_stat %u)" = 10001 ] \
           || { [ "$(lire_stat %g)" = 10001 ] && [ $(( 0$(lire_stat %a) & 040 )) -ne 0 ]; } \
           || [ $(( 0$(lire_stat %a) & 04 )) -ne 0 ]; }; then
        echo "❌ $NGINX_KEY n'est pas lisible par nginx (UID 10001 dans le conteneur)." >&2
        echo "   sudo chown 10001 $NGINX_KEY   (ou chgrp 10001 + chmod 0640)" >&2
        exit 1
    fi
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
export VERSION=$(git -C "$PROJECT_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

docker compose -f compose.yaml down 2>/dev/null || true
if [ "$IMAGES_MODE" = "pull" ]; then
    echo "--- 🐳 Lancement des containers depuis les images ${IMAGES_REGISTRE}scolarite-{backend,nginx}:${IMAGES_TAG} ---"
    # Sans registre, les images sont celles du poste (make publier-images) :
    # rien à tirer, compose les prend telles quelles ou échoue si elles manquent.
    if [ -n "$IMAGES_REGISTRE" ]; then
        docker compose -f compose.yaml pull
    fi
    docker compose -f compose.yaml up -d --no-build
else
    echo "--- 🐳 Build et lancement des containers ---"
    docker compose -f compose.yaml up --build -d
fi

echo "--- ✅ Application disponible sur https://10.20.2.5:9021 ---"
# L'image publiée (cible prod) n'embarque pas Delve : en mode pull, même en
# local, il n'y a pas de débogueur à annoncer.
if [ "$ENV_NAME" = "local" ] && [ "$IMAGES_MODE" = "build" ]; then
    echo "--- 🐛 Delve disponible sur localhost:2345 ---"
fi
