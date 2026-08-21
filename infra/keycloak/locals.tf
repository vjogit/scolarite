# KC_FRONTEND_URLS arrive sous forme de chaîne « a,b,c » : un fichier .env ne
# sait pas porter de littéral HCL, et les deux fichiers d'environnement sont
# l'unique source de vérité. Le découpage se fait donc ici, une fois.
#
# compact + trimspace tolèrent les espaces après les virgules et une virgule
# finale ; sans eux, une origine « ` https://…` » ne correspondrait à aucune
# redirection et l'erreur ne se verrait qu'au login.
locals {
  frontend_urls = compact([
    for url in split(",", var.frontend_urls) : trimspace(url)
  ])
}
