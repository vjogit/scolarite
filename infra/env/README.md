# infra/env — configuration par environnement

Ces fichiers alimentent les `${VAR}` de `infra/run/config-{local,prod}.yaml` et
de `back/cmd/*/config.yaml`, les conteneurs (`--env-file`), Liquibase, les
scripts d'infrastructure, et **le module Terraform du realm Keycloak** :

| Script | Rôle |
|---|---|
| `infra/reset-db.sh` | détruit et recrée les deux bases et leurs rôles |
| `infra/liquibase/migrate.sh` | applique les changesets Liquibase |
| `infra/keycloak/deploy.sh` | applique le module Terraform du realm |
| `infra/gen_sql.sh` | extrait le schéma et régénère le code sqlc |
| `infra/run/start-scolarite.sh` | rend `back/cmd/serveur/config.yaml` et lance la pile applicative |

Les scripts prennent les deux fichiers en arguments, dans cet ordre :

```sh
infra/reset-db.sh infra/env/config-local.env infra/env/secrets-local.env
```

et lisent chaque valeur dans la topologie **puis** dans les secrets, la
première trouvée gagnant.

Ils vivaient dans `.vscode/`. Ce n'était pas leur place : un répertoire
d'éditeur se supprime sans y penser, se trouve souvent dans un `.gitignore`
global, et n'a aucun rapport avec le déploiement d'une production.

## La règle de partage

Deux fichiers par environnement, sur un critère unique.

| | Contenu | Versionné |
|---|---|---|
| `secrets-{local,prod}.env` | ce dont la fuite est un incident et qui **se révoque** : mots de passe, secrets de client | **non** |
| `config-local.env` | la topologie de développement : adresses, ports, noms de bases, comptes, noms de clients | **oui** |
| `config-prod.env` | la même chose pour la production | **oui** |
| `secrets.env.example` | la **liste** des secrets attendus, valeurs vides | **oui** |

Un identifiant n'est pas une preuve d'identité : `POSTGRES_USER` et
`KEYCLOAK_ADMIN` sont de la topologie, `POSTGRES_PASSWORD` et
`KEYCLOAK_ADMIN_PASSWORD` sont des secrets. De même, `KC_CLIENT_ID` est un
identifiant public de client OIDC — il circule dans chaque redirection du
navigateur ; `KC_BACKEND_CLIENT_SECRET`, lui, est un secret.

Les deux `config-*.env` sont versionnés à dessein. Le local décrit le réseau
docker du dépôt (voir `infra/container/compose.yaml`) et permet de démarrer
sans rien deviner ; celui de production met sous revue les changements
d'adresse, de realm ou de relais SMTP.

## Premier démarrage

```sh
cp infra/env/secrets.env.example infra/env/secrets-local.env
# puis renseigner les valeurs
```

Pour la production, il faut en plus `secrets-prod.env`.

`KC_BACKEND_CLIENT_SECRET` n'est pas à renseigner à la main : la cible
`keycloak` / `keycloak-prod` le réécrit après chaque `terraform apply`, à
partir de la valeur générée par Keycloak.

Si l'ancrage TSA du registre est actif (`REGISTRE_ANCRAGE_ENABLED=true`), le
certificat racine FreeTSA doit exister à l'emplacement `REGISTRE_TSA_CA_CERT` :

```sh
make fetch-freetsa-cert
```

C'est un acte volontaire — la cible affiche l'empreinte SHA-256, à confronter
à https://freetsa.org avant de s'y fier. Le fichier n'est ni versionné ni
téléchargé silencieusement au démarrage ; s'il manque, le serveur démarre et
le signale en erreur dans les logs (l'ancrage observe la chaîne, il ne la
gouverne pas).

## Source unique de vérité pour Keycloak

Il n'y a **pas** de fichier `.tfvars`. Le module `infra/keycloak` ne lit aucune
valeur en dur : chacune arrive par `TF_VAR_*`, dérivée dans
`infra/keycloak/deploy.sh` depuis les noms canoniques de ces deux fichiers.
Ce pont y vit **une seule fois** pour les deux environnements — c'est le script
qui reçoit le couple de fichiers en arguments.

| Variable Terraform | Vient de | Fichier |
|---|---|---|
| `environnement` | `SCOLARITE_ENV` | config |
| `keycloak_url` | `KC_INTERNAL_HOSTNAME` | config |
| `keycloak_realm` | `KC_REALM` | config |
| `keycloak_client_id` | `KC_CLIENT_ID` | config |
| `keycloak_backend_client_id` | `KC_BACKEND_CLIENT_ID` | config |
| `frontend_urls` | `KC_FRONTEND_URLS` | config |
| `smtp_*` | `KC_SMTP_*` | config (mot de passe : secrets) |
| `bootstrap_user_*` | `KC_BOOTSTRAP_USER_*` | config (mot de passe : secrets) |
| `bootstrap_user_password_temporary` | `KC_BOOTSTRAP_USER_PASSWORD_TEMPORARY` | config |
| `keycloak_user` | `KEYCLOAK_ADMIN` | config |
| `keycloak_password` | `KEYCLOAK_ADMIN_PASSWORD` | secrets |

Modifier le realm — ajouter une origine, changer de relais SMTP, désactiver le
compte de démarrage — se fait donc **ici**, jamais dans `keycloak.tf` ni dans
la console Keycloak (le prochain `apply` écraserait).

L'état, lui, est séparé par espace de travail Terraform (`local` / `prod`).
Une `precondition` du module confronte `terraform.workspace` à
`TF_VAR_environnement` et refuse l'`apply` s'ils divergent.

## Le piège que ces fichiers tendent

`envsubst` remplace une variable absente par une **chaîne vide**, sans le
moindre message. Un secret oublié ne se voit donc pas au démarrage : il se voit
le jour où l'authentification échoue.

Toutes les variables vides ne sont pas des oublis : `KC_SMTP_USER` et
`KC_SMTP_PASSWORD` le sont légitimement en local, Mailpit n'authentifiant pas.

Deux garde-fous en découlent :

- `secrets.env.example` est versionné, pour que la liste attendue soit
  vérifiable ;
- les makefiles et les scripts s'arrêtent si un fichier manque, plutôt que de
  continuer avec des valeurs vides.

Aucun des deux ne détecte une variable *présente mais vide* : cela reste à la
charge du lecteur. Deux exceptions, couvertes par des `precondition` Terraform :
le mot de passe du compte de démarrage, et la concordance espace de travail /
environnement.

## Valeurs contenant des espaces

`KC_SMTP_FROM_DISPLAY_NAME` porte des guillemets (`"Scolarité (local)"`) : sans
eux, `source` échouerait sur les parenthèses et l'espace. `docker compose` et
`envsubst` les retirent d'eux-mêmes ; les makefiles le font explicitement
(fonction `unquote`) avant de passer la valeur à Terraform.

## Le cas VSCode

`.vscode/launch.json` charge les deux fichiers directement — l'extension Go
accepte un tableau de chemins pour `envFile` :

```json
"envFile": [
  "${workspaceFolder}/infra/env/config-local.env",
  "${workspaceFolder}/infra/env/secrets-local.env"
]
```

Aucune copie, aucun fichier dérivé : le backend lancé depuis le debugger lit
les mêmes fichiers que les makefiles, et reprend donc sans rien régénérer le
`KC_BACKEND_CLIENT_SECRET` réécrit par le dernier `terraform apply`.
