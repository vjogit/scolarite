variable "frontend_urls" {
  description = "Liste des URLs autorisées pour le frontend (dev + container)"
  type        = list(string)
}

variable "keycloak_url" {
  description = "Base URL of Keycloak (no trailing slash), e.g. http://10.20.2.2:8080/auth"
  type        = string
}

variable "keycloak_realm" {
  description = "Nom du realm Keycloak, e.g. RealmCybScolarite"
  type        = string
}

variable "keycloak_client_id" {
  description = "Client ID de l'application SPA, e.g. spa-app"
  type        = string
}

variable "keycloak_backend_client_id" {
  description = "Client ID du backend confidentiel, e.g. backend-api"
  type        = string
}
