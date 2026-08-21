# ==========================================================
# Renommages d'adresses — évite un détruire/recréer sur un état existant.
#
# Le compte de départ « foo », jusque-là codé en dur, est devenu le compte de
# démarrage paramétré (variables bootstrap_user_*, donc indexé par count).
# Sans ces blocs, Terraform lirait la nouvelle adresse comme une ressource
# neuve et supprimerait l'ancienne.
#
# Supprimables une fois les deux espaces de travail passés par un apply.
# ==========================================================
moved {
  from = keycloak_user.default_user_foo
  to   = keycloak_user.bootstrap[0]
}

moved {
  from = keycloak_user_roles.foo_roles
  to   = keycloak_user_roles.bootstrap_roles[0]
}
