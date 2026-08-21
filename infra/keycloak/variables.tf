# Liste séparée par des virgules, et non list(string) : la valeur vient de
# KC_FRONTEND_URLS dans config-<env>.env, et un fichier .env ne sait pas porter
# de littéral HCL. Le module fait le split (local.frontend_urls).
variable "frontend_urls" {
  description = "Origines autorisées du client SPA, séparées par des virgules (TF_VAR_frontend_urls ← KC_FRONTEND_URLS)"
  type        = string

  validation {
    condition     = trimspace(var.frontend_urls) != ""
    error_message = "KC_FRONTEND_URLS est vide : le client SPA n'autoriserait aucune redirection."
  }
}

variable "keycloak_url" {
  description = "Base URL of Keycloak (no trailing slash), e.g. http://10.20.2.2:8080/auth (← KC_INTERNAL_HOSTNAME)"
  type        = string
}

variable "keycloak_realm" {
  description = "Nom du realm Keycloak, e.g. RealmCybScolarite (← KC_REALM)"
  type        = string
}

variable "keycloak_client_id" {
  description = "Client ID de l'application SPA, e.g. spa-app (← KC_CLIENT_ID)"
  type        = string
}

variable "keycloak_backend_client_id" {
  description = "Client ID du backend confidentiel, e.g. backend-api (← KC_BACKEND_CLIENT_ID)"
  type        = string
}

variable "keycloak_user" {
  description = "Compte d'administration Keycloak utilisé par le provider (← KEYCLOAK_ADMIN)"
  type        = string
}

variable "keycloak_password" {
  description = "Mot de passe du compte d'administration Keycloak (← KEYCLOAK_ADMIN_PASSWORD)"
  type        = string
  sensitive   = true
}

# ==========================================================
# Forme de l'environnement
#
# Ces variables décrivent ce qui distingue un espace de travail d'un autre.
# Elles viennent TOUTES de infra/env/config-<env>.env (topologie) et
# infra/env/secrets-<env>.env (mots de passe), via les TF_VAR_* dérivés dans
# makefile.local / makefile.prod. Il n'y a pas de .tfvars : ces deux fichiers
# sont l'unique source de vérité. Voir infra/env/README.md.
# ==========================================================
variable "environnement" {
  description = "Espace de travail ciblé : local (test) ou prod (← SCOLARITE_ENV)"
  type        = string

  validation {
    condition     = contains(["local", "prod"], var.environnement)
    error_message = "environnement doit valoir \"local\" ou \"prod\"."
  }
}

variable "smtp_host" {
  description = "Hôte du relais SMTP du realm (Mailpit en local, relais réel en prod) (← KC_SMTP_HOST)"
  type        = string
}

variable "smtp_port" {
  description = "Port du relais SMTP (← KC_SMTP_PORT)"
  type        = string
}

variable "smtp_from" {
  description = "Adresse d'expédition des courriels du realm (← KC_SMTP_FROM)"
  type        = string
}

variable "smtp_from_display_name" {
  description = "Nom affiché de l'expéditeur (← KC_SMTP_FROM_DISPLAY_NAME)"
  type        = string
}

variable "smtp_starttls" {
  description = "Négocier STARTTLS sur la connexion SMTP (faux avec Mailpit) (← KC_SMTP_STARTTLS)"
  type        = bool
  default     = false
}

variable "smtp_ssl" {
  description = "Connexion SMTP en TLS implicite (faux avec Mailpit) (← KC_SMTP_SSL)"
  type        = bool
  default     = false
}

variable "smtp_user" {
  description = "Compte du relais SMTP — vide = envoi sans authentification (← KC_SMTP_USER)"
  type        = string
  default     = ""
}

variable "smtp_password" {
  description = "Mot de passe du relais SMTP (← KC_SMTP_PASSWORD)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "bootstrap_user_enabled" {
  description = "Créer le compte de démarrage ADMIN. À repasser à false une fois les vrais administrateurs en place. (← KC_BOOTSTRAP_USER_ENABLED)"
  type        = bool
  default     = false
}

variable "bootstrap_user_username" {
  description = "Identifiant du compte de démarrage (← KC_BOOTSTRAP_USER_USERNAME)"
  type        = string
  default     = ""
}

variable "bootstrap_user_email" {
  description = "Courriel du compte de démarrage (← KC_BOOTSTRAP_USER_EMAIL)"
  type        = string
  default     = ""
}

variable "bootstrap_user_password_temporary" {
  description = "Forcer le remplacement du mot de passe du compte de démarrage au premier login (← KC_BOOTSTRAP_USER_PASSWORD_TEMPORARY)"
  type        = bool
  default     = true
}

variable "bootstrap_user_password" {
  description = "Mot de passe temporaire du compte de démarrage (← KC_BOOTSTRAP_USER_PASSWORD)"
  type        = string
  default     = ""
  sensitive   = true
}
