# ==========================================================
# Realm Scolarité — module racine partagé par les deux espaces de travail.
#
# Un espace de travail Terraform (« terraform workspace ») par environnement :
# « local » et « prod », chacun avec son propre état. Ce qui les distingue est
# passé par -var-file :
#
#   terraform -chdir=infra/keycloak workspace select -or-create local
#   terraform -chdir=infra/keycloak apply
#
# Il n'y a PAS de fichier .tfvars : toutes les variables arrivent par TF_VAR_*,
# dérivées dans makefile.local / makefile.prod depuis infra/env/config-<env>.env
# et infra/env/secrets-<env>.env — l'unique source de vérité du realm. Modifier
# le realm se fait là-bas, jamais ici ni dans la console. Voir
# infra/env/README.md.
#
# Les cibles keycloak / keycloak-prod des makefiles s'en chargent ; lancé à la
# main sans ces variables, terraform réclamerait chaque valeur.
# ==========================================================

# 1. Configuration du Fournisseur Keycloak
# Identifiants fournis par l'environnement : TF_VAR_keycloak_user /
# TF_VAR_keycloak_password, alimentés depuis KEYCLOAK_ADMIN (config-<env>.env)
# et KEYCLOAK_ADMIN_PASSWORD (secrets-<env>.env).
provider "keycloak" {
  url       = "${var.keycloak_url}/auth"
  realm     = "master"
  username  = var.keycloak_user
  password  = var.keycloak_password
  client_id = "admin-cli"
  initial_login = "false"
}


# 2. Création du Realm "${var.keycloak_realm}" (avec locale française)
resource "keycloak_realm" "cyb_scolarite" {
  realm   = "${var.keycloak_realm}"
  enabled = true
  display_name      = "Scolarite"
  display_name_html = "<b>Scolarite</b>"

  edit_username_allowed = true

  # Page de connexion aux couleurs du front : thème infra/keycloak/themes/
  # scolarite (CSS et script seuls, par-dessus keycloak.v2), monté dans le
  # conteneur par infra/container/compose.yaml.
  login_theme = "scolarite"

  internationalization {
    supported_locales = [
      "en",
      "fr",
    ]
    default_locale    = "fr"
  }

  # Relais SMTP du realm. En local il pointe vers Mailpit, qui accepte tout
  # sans authentification ni TLS ; en prod vers le relais réel. La forme est
  # décrite par les KC_SMTP_* de infra/env/config-<env>.env, le mot de passe
  # par KC_SMTP_PASSWORD dans infra/env/secrets-<env>.env.
  smtp_server {
    host              = var.smtp_host
    port              = var.smtp_port
    from              = var.smtp_from
    from_display_name = var.smtp_from_display_name
    starttls          = var.smtp_starttls
    ssl               = var.smtp_ssl

    # Bloc omis quand smtp_user est vide : Mailpit refuse une négociation AUTH.
    dynamic "auth" {
      for_each = var.smtp_user == "" ? [] : [1]
      content {
        username = var.smtp_user
        password = var.smtp_password
      }
    }
  }

  # Garde-fou : l'espace de travail sélectionné porte l'état, le fichier
  # d'environnement chargé porte la configuration. Les désaccorder appliquerait
  # la configuration d'un environnement sur l'état de l'autre — en prod, la
  # destruction du realm.
  lifecycle {
    precondition {
      condition     = terraform.workspace == var.environnement
      error_message = "Espace de travail Terraform « ${terraform.workspace} » et SCOLARITE_ENV « ${var.environnement} » discordants : sélectionner l'espace de travail correspondant avant d'appliquer."
    }
  }
}

resource "keycloak_openid_client" "spa_app" {
  realm_id = keycloak_realm.cyb_scolarite.id
  client_id = var.keycloak_client_id
  access_type = "PUBLIC"

  name = "Application SPA Scolarité"
  enabled = true
  standard_flow_enabled   = true

  # Client public : PKCE S256 obligatoire, sinon un code d'autorisation
  # intercepté est échangeable contre un jeton. Le front l'active côté
  # keycloak-js (pkceMethod: 'S256').
  pkce_code_challenge_method = "S256"

  # Redirections restreintes à la racine de chaque frontend : la SPA fixe
  # explicitement redirectUri sur son origine (KeycloakContext.tsx), le
  # joker "/*" n'est donc pas nécessaire.
  valid_redirect_uris = [for url in local.frontend_urls : "${url}/"]
  web_origins         = local.frontend_urls
  valid_post_logout_redirect_uris = [for url in local.frontend_urls : "${url}/"]

}

resource "keycloak_openid_client_scope" "spa_app_client_scope" {
  realm_id               = keycloak_realm.cyb_scolarite.id
  name                   = "${var.keycloak_client_id}-dedicated"
  description            = "When requested, this scope will map a user's group memberships to a claim"

  gui_order              = 1
}

resource "keycloak_openid_audience_protocol_mapper" "audience_mapper" {
  realm_id            = keycloak_realm.cyb_scolarite.id
  client_id     = keycloak_openid_client.spa_app.id
  name      = "audience-mapper"

  included_client_audience = keycloak_openid_client.spa_app.client_id
}

# ==========================================================
# 4. Rôles du realm — modèle « lecture globale, écritures ciblées »
#
# CONSULTATION donne la lecture de toute l'application. Chaque rôle
# *_ECRITURE ouvre les écritures d'un domaine et contient CONSULTATION
# (composite) : un porteur d'un rôle d'écriture peut toujours lire ce
# qu'il est censé modifier. ADMIN est un composite des huit rôles
# fonctionnels : le jeton d'un porteur d'ADMIN expose tous ces rôles
# dans realm_access.roles, et le code applicatif ne teste jamais ADMIN.
# ==========================================================
resource "keycloak_role" "consultation_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "CONSULTATION"
  description = "Lecture de toute l'application"
}

resource "keycloak_role" "structure_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "STRUCTURE_ECRITURE"
  description = "Écriture : formations, promotions, options, périodes, UE, matières, groupes"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "notes_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "NOTES_ECRITURE"
  description = "Écriture : notes et contrôles"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "jury_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "JURY_ECRITURE"
  description = "Écriture : délibérations de jury"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "programme_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "PROGRAMME_ECRITURE"
  description = "Écriture : réservations / programmation des séances"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "salles_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "SALLES_ECRITURE"
  description = "Écriture : salles"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "certification_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "CERTIFICATION_ECRITURE"
  description = "Écriture : TOEIC et mobilités internationales"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "utilisateurs_ecriture_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "UTILISATEURS_ECRITURE"
  description = "Écriture : gestion des utilisateurs"
  composite_roles = [keycloak_role.consultation_role.id]
}

resource "keycloak_role" "admin_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "ADMIN"
  description = "Composite de tous les rôles fonctionnels — jamais testé par le code"
  composite_roles = [
    keycloak_role.consultation_role.id,
    keycloak_role.structure_ecriture_role.id,
    keycloak_role.notes_ecriture_role.id,
    keycloak_role.jury_ecriture_role.id,
    keycloak_role.programme_ecriture_role.id,
    keycloak_role.salles_ecriture_role.id,
    keycloak_role.certification_ecriture_role.id,
    keycloak_role.utilisateurs_ecriture_role.id,
  ]
}



# ==========================================================
# 5. Compte de démarrage
#
# Nécessaire pour la première connexion sur un realm vierge : sans lui,
# personne ne peut se connecter pour créer les autres comptes.
#
# À ne pas confondre avec le parcours de création d'un compte agent
# (back/pkg/user/user.go) : celui-là n'attribue AUCUN mot de passe, il envoie
# un courriel UPDATE_PASSWORD avec lequel l'utilisateur choisit le sien. Il n'y
# a rien à y rendre facultatif.
#
# En local c'est « foo », documenté dans docs/deployements.md. En prod, le
# compte n'a de raison d'être que le temps d'amorcer le realm : une fois les
# vrais administrateurs créés, repasser KC_BOOTSTRAP_USER_ENABLED à false dans
# infra/env/config-prod.env et vider KC_BOOTSTRAP_USER_PASSWORD.
# ==========================================================
resource "keycloak_user" "bootstrap" {
  count = var.bootstrap_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  username = var.bootstrap_user_username
  enabled  = true
  first_name     = "Compte"
  last_name      = "Démarrage"
  email          = var.bootstrap_user_email
  email_verified = true

  # temporary : Keycloak impose le remplacement au premier login. Vrai en prod,
  # où le mot de passe d'amorçage a transité par un fichier et parfois par une
  # conversation ; faux en local, où le retaper à chaque remise à zéro de la
  # base n'apporte rien — le compte « foo » y est public et documenté.
  # Défaut à true : un environnement qui oublie la variable force le changement.
  initial_password {
    value     = var.bootstrap_user_password
    temporary = var.bootstrap_user_password_temporary
  }

  # Créer un compte ADMIN sans mot de passe est toujours une erreur : mieux
  # vaut refuser l'apply que découvrir le realm inaccessible — ou accessible.
  lifecycle {
    precondition {
      condition     = var.bootstrap_user_password != ""
      error_message = "KC_BOOTSTRAP_USER_ENABLED est vrai mais KC_BOOTSTRAP_USER_PASSWORD est vide : renseigner le mot de passe temporaire dans infra/env/secrets-${var.environnement}.env, ou passer KC_BOOTSTRAP_USER_ENABLED à false dans infra/env/config-${var.environnement}.env."
    }
  }
}

# Rôle du compte de démarrage : ADMIN (composite) uniquement.
resource "keycloak_user_roles" "bootstrap_roles" {
  count = var.bootstrap_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_user.bootstrap[0].id

  role_ids = [
    keycloak_role.admin_role.id,
  ]
}

# ==========================================================
# 6. Comptes de test Playwright (front/e2e) — un par profil de droits restreint
#
# La suite a besoin de trois profils : ADMIN (couvert par le compte de
# démarrage ci-dessus), CONSULTATION seul, NOTES_ECRITURE seul. Même
# conditionnement que le compte de démarrage — activés seulement en local
# (var *_enabled à false par défaut), mot de passe non temporaire (comptes de
# test, retapés à chaque remise à zéro n'apporterait rien), déclaratifs pour
# survivre à un start-local-reset sans intervention manuelle.
# ==========================================================
resource "keycloak_user" "test_consultation" {
  count = var.test_consultation_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  username = var.test_consultation_user_username
  enabled  = true
  first_name     = "Test"
  last_name      = "Consultation"
  email          = var.test_consultation_user_email
  email_verified = true

  initial_password {
    value     = var.test_consultation_user_password
    temporary = false
  }

  lifecycle {
    precondition {
      condition     = var.test_consultation_user_password != ""
      error_message = "TEST_CONSULTATION_USER_ENABLED est vrai mais TEST_CONSULTATION_USER_PASSWORD est vide : renseigner le mot de passe dans infra/env/secrets-${var.environnement}.env, ou passer TEST_CONSULTATION_USER_ENABLED à false dans infra/env/config-${var.environnement}.env."
    }
  }
}

# Rôle du compte : CONSULTATION seul.
resource "keycloak_user_roles" "test_consultation_roles" {
  count = var.test_consultation_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_user.test_consultation[0].id

  role_ids = [
    keycloak_role.consultation_role.id,
  ]
}

resource "keycloak_user" "test_notes_ecriture" {
  count = var.test_notes_ecriture_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  username = var.test_notes_ecriture_user_username
  enabled  = true
  first_name     = "Test"
  last_name      = "NotesEcriture"
  email          = var.test_notes_ecriture_user_email
  email_verified = true

  initial_password {
    value     = var.test_notes_ecriture_user_password
    temporary = false
  }

  lifecycle {
    precondition {
      condition     = var.test_notes_ecriture_user_password != ""
      error_message = "TEST_NOTES_ECRITURE_USER_ENABLED est vrai mais TEST_NOTES_ECRITURE_USER_PASSWORD est vide : renseigner le mot de passe dans infra/env/secrets-${var.environnement}.env, ou passer TEST_NOTES_ECRITURE_USER_ENABLED à false dans infra/env/config-${var.environnement}.env."
    }
  }
}

# Rôle du compte : NOTES_ECRITURE seul (composite, contient déjà CONSULTATION).
resource "keycloak_user_roles" "test_notes_ecriture_roles" {
  count = var.test_notes_ecriture_user_enabled ? 1 : 0

  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_user.test_notes_ecriture[0].id

  role_ids = [
    keycloak_role.notes_ecriture_role.id,
  ]
}

# ==========================================================
# 7. NOUVEAU : Client Backend (Service Account) pour gestion utilisateurs
# ==========================================================
resource "keycloak_openid_client" "backend_client" {
  realm_id                 = keycloak_realm.cyb_scolarite.id
  client_id                = var.keycloak_backend_client_id
  name                     = "Backend API"
  description              = "Client confidentiel pour le backend (création d'utilisateurs, etc.)"
  enabled                  = true

  access_type              = "CONFIDENTIAL"
  service_accounts_enabled = true
  standard_flow_enabled    = false
  direct_access_grants_enabled = false
}

# Récupération du client interne "realm-management" pour accéder aux rôles d'admin
data "keycloak_openid_client" "realm_management" {
  realm_id  = keycloak_realm.cyb_scolarite.id
  client_id = "realm-management"
}

# Récupération du rôle "manage-users" (permet de créer/modifier des users)
data "keycloak_role" "realm_management_manage_users" {
  realm_id  = keycloak_realm.cyb_scolarite.id
  client_id = data.keycloak_openid_client.realm_management.id
  name      = "manage-users"
}

# Récupération du rôle "view-realm" (nécessaire pour lire les rôles via l'API)
data "keycloak_role" "realm_management_view_realm" {
  realm_id  = keycloak_realm.cyb_scolarite.id
  client_id = data.keycloak_openid_client.realm_management.id
  name      = "view-realm"
}

# Assignation du rôle "manage-users" au Service Account du backend
resource "keycloak_user_roles" "backend_service_account_roles" {
  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_openid_client.backend_client.service_account_user_id

  role_ids = [
    data.keycloak_role.realm_management_manage_users.id,
    data.keycloak_role.realm_management_view_realm.id,
  ]
}

# Output pour récupérer le secret généré par Keycloak
output "backend_client_secret" {
  value     = keycloak_openid_client.backend_client.client_secret
  sensitive = true
}

output "backend_client_id" {
  value = keycloak_openid_client.backend_client.client_id
}
