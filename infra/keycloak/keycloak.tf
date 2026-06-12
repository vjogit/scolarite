# 1. Configuration du Fournisseur Keycloak
provider "keycloak" {
  url       = "${var.keycloak_url}/auth"
  realm     = "master"
  username  = "admin"
  password  = "admin"
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
}

resource "keycloak_openid_client" "spa_app" {
  realm_id = keycloak_realm.cyb_scolarite.id
  client_id = var.keycloak_client_id
  access_type = "PUBLIC"

  name = "Application SPA Scolarité"
  enabled = true
  standard_flow_enabled   = true
  
  valid_redirect_uris = [for url in var.frontend_urls : "${url}/*"]
  web_origins         = var.frontend_urls
  valid_post_logout_redirect_uris = [for url in var.frontend_urls : "${url}/*"]

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

# 4. Création des rôles de Realm "admin" et "eleve"
resource "keycloak_role" "admin_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "ADMIN"
  description = "Rôle administrateur du Realm Scolarité"
}
resource "keycloak_role" "prof_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "PROF"
  description = "Rôle Professeur du Realm Scolarité"
}
resource "keycloak_role" "eleve_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "ELEVE"
  description = "Rôle élève (utilisateur standard) du Realm Scolarité"
}

resource "keycloak_role" "gestionnaire_role" {
  realm_id    = keycloak_realm.cyb_scolarite.id
  name        = "GESTIONNAIRE"
  description = "Rôle gestionnaire du Realm Scolarité"
}



# ==========================================================
# 5. NOUVEAU : Création de l'utilisateur par défaut "foo"
# ==========================================================
resource "keycloak_user" "default_user_foo" {
  realm_id = keycloak_realm.cyb_scolarite.id
  username = "foo"
  enabled  = true 
  first_name     = "Default"
  last_name      = "User"
  email_verified = true

  # Définition du mot de passe
  initial_password {
    value     = "foo"
    temporary = false # Le mot de passe ne sera pas forcé à changer au premier login
  }
}

# ==========================================================
# 6. NOUVEAU : Assignation des rôles "admin" et "eleve" à l'utilisateur "foo"
# ==========================================================
resource "keycloak_user_roles" "foo_roles" {
  realm_id = keycloak_realm.cyb_scolarite.id
  user_id  = keycloak_user.default_user_foo.id

  # Référence les IDs des rôles créés précédemment
  role_ids = [
    keycloak_role.admin_role.id, 
    keycloak_role.eleve_role.id,
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
