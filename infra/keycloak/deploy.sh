#!/bin/bash
set -euo pipefail

# Usage: deploy.sh <config-file> <secrets-file>
#
# Applique le module Terraform du realm, puis réécrit le secret du client
# backend généré par Keycloak dans le fichier de secrets.
#
# Ce script porte le PONT entre les fichiers d'environnement et Terraform :
# le module n'a pas de .tfvars, chaque variable arrive par TF_VAR_*. La
# correspondance est ici, une seule fois pour les deux environnements —
# ajouter une variable au module, c'est ajouter une ligne ici et une ligne
# dans infra/env/config-<env>.env, jamais une valeur en dur dans keycloak.tf.
#
# Voir infra/env/README.md.

CONFIG_FILE="${1:-}"
SECRETS_FILE="${2:-}"

if [[ -z "$CONFIG_FILE" || -z "$SECRETS_FILE" ]]; then
    echo "Usage: $0 <config-file> <secrets-file>" >&2
    exit 1
fi

for f in "$CONFIG_FILE" "$SECRETS_FILE"; do
    [[ -f "$f" ]] || { echo "ERREUR : fichier d'environnement introuvable : $f" >&2
                       echo "         Voir infra/env/README.md" >&2; exit 1; }
done

KEYCLOAK_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS_FILE="$(realpath "$SECRETS_FILE")"

# `source` et non `get()` : une vingtaine de valeurs sont nécessaires, et les
# guillemets de KC_SMTP_FROM_DISPLAY_NAME (« Scolarité (local) ») sont retirés
# au passage — sans quoi Terraform recevrait la valeur guillemets compris.
set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
# shellcheck source=/dev/null
source "$SECRETS_FILE"
set +a

: "${SCOLARITE_ENV:?SCOLARITE_ENV absent de $CONFIG_FILE}"

# ── Pont fichiers d'environnement → Terraform ─────────────────────────────────
export TF_VAR_environnement="$SCOLARITE_ENV"
export TF_VAR_keycloak_url="http://${KC_INTERNAL_HOSTNAME}:8080"
export TF_VAR_keycloak_realm="$KC_REALM"
export TF_VAR_keycloak_client_id="$KC_CLIENT_ID"
export TF_VAR_keycloak_backend_client_id="$KC_BACKEND_CLIENT_ID"
export TF_VAR_keycloak_user="$KEYCLOAK_ADMIN"
export TF_VAR_keycloak_password="$KEYCLOAK_ADMIN_PASSWORD"
export TF_VAR_frontend_urls="$KC_FRONTEND_URLS"
export TF_VAR_smtp_host="$KC_SMTP_HOST"
export TF_VAR_smtp_port="$KC_SMTP_PORT"
export TF_VAR_smtp_from="$KC_SMTP_FROM"
export TF_VAR_smtp_from_display_name="$KC_SMTP_FROM_DISPLAY_NAME"
export TF_VAR_smtp_starttls="$KC_SMTP_STARTTLS"
export TF_VAR_smtp_ssl="$KC_SMTP_SSL"
export TF_VAR_smtp_user="$KC_SMTP_USER"
export TF_VAR_smtp_password="$KC_SMTP_PASSWORD"
export TF_VAR_bootstrap_user_enabled="$KC_BOOTSTRAP_USER_ENABLED"
export TF_VAR_bootstrap_user_username="$KC_BOOTSTRAP_USER_USERNAME"
export TF_VAR_bootstrap_user_email="$KC_BOOTSTRAP_USER_EMAIL"
export TF_VAR_bootstrap_user_password="$KC_BOOTSTRAP_USER_PASSWORD"
export TF_VAR_bootstrap_user_password_temporary="$KC_BOOTSTRAP_USER_PASSWORD_TEMPORARY"

echo "--- 🔑 Déploiement Keycloak avec Terraform (espace de travail $SCOLARITE_ENV) ---"

if [[ ! -d "$KEYCLOAK_DIR/.terraform" ]]; then
    terraform -chdir="$KEYCLOAK_DIR" init
fi

# L'espace de travail porte l'état, les TF_VAR_* portent la configuration : les
# deux doivent désigner le même environnement. Une precondition de keycloak.tf
# confronte terraform.workspace à SCOLARITE_ENV et refuse l'apply s'ils
# divergent — appliquer la configuration d'un environnement sur l'état de
# l'autre détruirait le realm.
terraform -chdir="$KEYCLOAK_DIR" workspace select -or-create "$SCOLARITE_ENV"
terraform -chdir="$KEYCLOAK_DIR" apply -auto-approve

echo "--- 📝 Mise à jour du secret Keycloak dans $SECRETS_FILE ---"
SECRET=$(terraform -chdir="$KEYCLOAK_DIR" output -raw backend_client_secret)
# Sans ce contrôle, un output vide effacerait la ligne en silence et le backend
# échouerait à s'authentifier au démarrage suivant, sans rapport apparent.
[[ -n "$SECRET" ]] || { echo "ERREUR : backend_client_secret vide" >&2; exit 1; }
sed -i "s|^KC_BACKEND_CLIENT_SECRET=.*|KC_BACKEND_CLIENT_SECRET=$SECRET|" "$SECRETS_FILE"
