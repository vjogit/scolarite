# 1. Configuration du Fournisseur Keycloak
# Identifiants fournis par l'environnement : TF_VAR_keycloak_user /
# TF_VAR_keycloak_password (alimentés depuis KEYCLOAK_ADMIN /
# KEYCLOAK_ADMIN_PASSWORD dans le fichier de secrets local).
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

  internationalization {
    supported_locales = [
      "en",
      "fr",
    ]
    default_locale    = "fr"
  }

  # [DEV-LOCAL] SMTP vers le conteneur Mailpit : il accepte tout, sans
  # authentification ni TLS. À remplacer par le relais réel lors du chantier
  # de séparation des environnements — aucun identifiant de production ici.
  smtp_server {
    host = "10.20.2.6"
    port = "1025"
    from = "no-reply@scolarite.local"
    from_display_name = "Scolarité (local)"
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
  valid_redirect_uris = [for url in var.frontend_urls : "${url}/"]
  web_origins         = var.frontend_urls
  valid_post_logout_redirect_uris = [for url in var.frontend_urls : "${url}/"]

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
# 5. [DEV-LOCAL] Compte de départ "foo"
# Nécessaire pour la première connexion sur un environnement vierge.
# Mot de passe temporaire : Keycloak force son remplacement au premier
# login. Identifiants documentés dans docs/deployements.md. À exclure
# lors du chantier de séparation des environnements.
# ==========================================================
resource "keycloak_user" "default_user_foo" {
  realm_id = keycloak_realm.cyb_scolarite.id
  username = "foo"
  enabled  = true
  first_name     = "Default"
  last_name      = "User"
  email          = "foo@scolarite.local"
  email_verified = true

  initial_password {
    value     = "Demarrage-Scolarite-2026!"
    temporary = true # remplacement forcé au premier login
  }
}

# [DEV-LOCAL] Rôle du compte de départ : ADMIN (composite) uniquement.
resource "keycloak_user_roles" "foo_roles" {
  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_user.default_user_foo.id

  role_ids = [
    keycloak_role.admin_role.id,
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
