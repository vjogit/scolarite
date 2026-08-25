# Déploiement & configuration

## Espaces de travail

Deux environnements cloisonnés, `local` (tests sur poste de développement) et
`prod`. Chacun a son fichier de secrets, son fragment de makefile, son gabarit
de configuration backend et son espace de travail Terraform.

| | `local` | `prod` |
|---|---|---|
| Topologie (versionnée) | `infra/env/config-local.env` | `infra/env/config-prod.env` |
| Secrets (non versionnés) | `infra/env/secrets-local.env` | `infra/env/secrets-prod.env` |
| Makefile | `makefile.local` | `makefile.prod` |
| Espace de travail Terraform | `local` | `prod` |
| Cible Docker du backend | `local` (avec Delve) | `prod` |
| SMTP | Mailpit (`10.20.2.6:1025`) | relais réel, à renseigner |

`make` sans argument liste les cibles des deux environnements. Le makefile
racine n'inclut **qu'un seul** fragment à la fois, choisi sur le nom de la
cible demandée : toute cible prod porte `prod` dans son nom, aucune cible
locale ne le porte. Les deux fragments font `include` de leur fichier de
secrets puis `export` — les charger ensemble ferait gagner le dernier inclus
sur toute variable homonyme, et un `make start-local-reset` partirait avec les
identifiants de production.

### Deux fichiers par environnement

La configuration est scindée sur un critère unique : ce qui **se révoque** est
un secret, le reste est de la topologie. `infra/env/README.md` porte la règle
complète et la table des variables.

- `config-{local,prod}.env` — adresses, ports, noms de bases, comptes, noms de
  clients Keycloak. **Versionnés**, y compris celui de production.
- `secrets-{local,prod}.env` — mots de passe et secrets de client. **Jamais
  versionnés** ; leur liste l'est, dans `secrets.env.example`.

Sur une nouvelle machine :

```bash
cp infra/env/secrets.env.example infra/env/secrets-local.env
# puis renseigner les valeurs
```

`KC_BACKEND_CLIENT_SECRET` n'est pas à renseigner à la main — la cible
`keycloak` / `keycloak-prod` le réécrit après chaque `terraform apply`.

### Ces deux fichiers sont l'unique source de vérité

Y compris pour Keycloak : le module `infra/keycloak` n'a **pas** de `.tfvars`
et ne porte aucune valeur en dur. Chaque variable arrive par `TF_VAR_*`,
dérivée dans `infra/keycloak/deploy.sh` depuis les noms canoniques des deux
fichiers (bloc « Pont fichiers d'environnement → Terraform »).

Changer une origine autorisée, le relais SMTP ou le compte de démarrage se
fait donc dans `config-<env>.env` — pas dans `keycloak.tf`, pas dans la console
Keycloak, que le prochain `apply` écraserait.

Même règle pour les `back/cmd/*/config.yaml` : le realm et l'URL PostgreSQL y
sont des `${VAR}`, résolus par `os.Expand` au chargement
(`back/pkg/services/config.go`).

### Une seule source pour le config.yaml du serveur

`back/cmd/serveur/config.yaml` sert les deux façons de lancer le backend :

| Lancement | Chemin |
|---|---|
| Hors conteneur (debugger VSCode) | lu tel quel, `${VAR}` résolus par `os.Expand` |
| En conteneur | rendu par `envsubst` dans `infra/run/start-scolarite.sh`, déposé dans `$SCOLARITE_CONF_DIR/config.yaml`, monté sur `/opt/scolarite/conf/config.yaml` |

Les gabarits `infra/run/config-{local,prod}.yaml` ont disparu : ils recopiaient
celui-ci à une ligne près — `keycloak.ca_cert` — et auraient divergé à la
première retouche.

Cette ligne vaut désormais `${SCOLARITE_CA_CERT}`. Seul le conteneur **local**
a besoin d'une valeur, n'ayant pas la CA mkcert qui signe l'issuer :
`start-scolarite.sh` l'y dépose et positionne la variable. Partout ailleurs —
prod, et backend lancé hors conteneur — elle reste vide, et le backend s'en
tient aux CA système (`AuthMiddleware.go` ne charge un bundle que si le chemin
est non vide). Le chemin est celui du montage déclaré dans `compose.yaml`, pas
de la topologie : il vit donc dans le script, à côté de la copie du fichier
qu'il désigne, et non dans `infra/env`.

### Terraform : espace de travail

L'espace de travail porte l'**état**, les `TF_VAR_*` portent la
**configuration** ; les deux doivent désigner le même environnement. Les
cibles du makefile s'en chargent :

```bash
infra/keycloak/deploy.sh infra/env/config-local.env infra/env/secrets-local.env
```

Le script sélectionne l'espace de travail d'après `SCOLARITE_ENV`, applique, et
réécrit `KC_BACKEND_CLIENT_SECRET` dans le fichier de secrets.

Une `precondition` sur `keycloak_realm.cyb_scolarite` confronte
`terraform.workspace` à `SCOLARITE_ENV` et refuse l'`apply` s'ils divergent :
appliquer la configuration d'un environnement sur l'état de l'autre détruirait
le realm.

### Le cas VSCode

`.vscode/launch.json` charge les deux fichiers directement — l'extension Go
accepte un tableau de chemins pour `envFile` :

```json
"envFile": [
  "${workspaceFolder}/infra/env/config-local.env",
  "${workspaceFolder}/infra/env/secrets-local.env"
]
```

Le backend lancé depuis le debugger lit donc les mêmes fichiers que les
makefiles, `KC_BACKEND_CLIENT_SECRET` compris.

### Limite connue

Les deux environnements partagent encore les noms de projets Docker
(`scolarite`, `infra-scolarite`), le réseau `10.20.2.0/24` et ses IP
statiques. Ils ne peuvent donc pas tourner en même temps sur une même machine :
lancer une cible prod arrête la pile locale, et réciproquement. `makefile.prod`
reste pour l'instant une copie de `makefile.local`, à dissocier quand la prod
quittera le poste de développement.

Par prudence, les cibles destructives de prod (`start-prod-reset`,
`restart-prod-reset`) demandent une confirmation tapée avant de supprimer les
bases et les volumes — makefile.local ne le fait pas.

---

## Certificats HTTPS

### Pourquoi

L'application utilise Keycloak pour l'authentification. Keycloak impose que les cookies de session soient transmis en HTTPS (`Secure`) et que le `redirect_uri` post-login soit une URL HTTPS. Sans certificat valide côté frontend, le navigateur refuse le cookie de session au moment du POST du formulaire de login ("Cookie introuvable").

De plus, le WebSocket HMR de Vite (`wss://`) nécessite également HTTPS.

### Outil : mkcert

`mkcert` crée une autorité de certification (CA) locale reconnue par les navigateurs sur la machine de développement. Les certificats générés avec ce CA sont automatiquement approuvés sans manipulation manuelle dans le navigateur.

### Installation (une fois par machine)

```bash
sudo apt install mkcert libnss3-tools
mkcert -install   # installe le CA local dans le trust store système et les navigateurs
```

### Génération des certificats

**Frontend Vite (dev)**

```bash
cd front/
mkdir -p cert
mkcert -key-file cert/localhost-key.pem \
       -cert-file cert/localhost.pem \
       localhost 10.20.2.1
```

Le certificat couvre :
- `localhost` — accès navigateur classique
- `10.20.2.1` — IP du host sur le bridge Docker (`infra-scolarite_scolarite-net`), nécessaire pour que le backend (container) puisse valider les tokens en contactant Vite

Les fichiers `cert/` sont dans `.gitignore` et doivent être régénérés sur chaque nouvelle machine.

**nginx (container)**

Le certificat nginx est généré automatiquement par `mkcert` lors du build Docker :

```bash
./build-scolarite.sh nginx
```

Le script détecte l'absence de `infra/run/build/ssl/` et appelle `mkcert` pour `10.20.2.5`.

---

## Keycloak — configuration pour les deux frontends

L'application peut être servie depuis deux origines selon le contexte :

| Contexte | URL | Usage |
|----------|-----|-------|
| Debug VSCode | `https://10.20.2.1:5173` | Vite dev server avec HMR et debugger Go |
| Container | `https://10.20.2.5:9021` | nginx servant le build React et le backend |

### Principe du hostname dynamique

Keycloak est configuré avec `KC_PROXY_HEADERS=xforwarded` (sans `KC_HOSTNAME` fixe). Il utilise le header `X-Forwarded-Host` reçu pour générer ses URLs (formulaire de login, redirects, issuer des tokens JWT).

- nginx envoie `X-Forwarded-Host: 10.20.2.5:9021` → tokens avec `iss: https://10.20.2.5:9021/auth/...`
- Vite proxy envoie `X-Forwarded-Host: 10.20.2.1:5173` → tokens avec `iss: https://10.20.2.1:5173/auth/...`

Cela évite de maintenir deux realms ou deux configurations Keycloak.

### Configuration du client `spa-app`

Le client est entièrement géré par Terraform (`infra/keycloak/keycloak.tf`) :

- **PKCE S256 obligatoire** (`pkce_code_challenge_method`), activé côté SPA
  dans `KeycloakContext.tsx` (`pkceMethod: 'S256'`).
- **Valid redirect URIs restreintes à la racine** de chaque frontend
  (`https://…/` — plus de joker `/*`) : la SPA fixe `redirectUri` sur son
  origine. Les origines autorisées viennent de `KC_FRONTEND_URLS` dans
  `infra/env/config-<env>.env` — une liste séparée par des virgules, que le
  module découpe (`infra/keycloak/locals.tf`).

Ne pas modifier ces réglages à la main dans la console : le prochain
`terraform apply` les écraserait.

### Configuration du backend selon le contexte

Le backend valide les tokens JWT en récupérant la configuration OIDC de Keycloak. L'issuer attendu doit correspondre à celui des tokens.

**Debug (`/home/vjo/.scolarite/conf/config.yaml`)**

```yaml
keycloak:
  host: http://10.20.2.2:8080/auth        # accès interne Keycloak (pas de TLS)
  issuer: https://10.20.2.1:5173/auth     # doit correspondre à l'iss des tokens dev
  realm: realms/RealmCybScolarite
  client: spa-app
```

Le backend (container `10.20.2.4`) contacte Vite (`10.20.2.1:5173`) via le bridge Docker pour récupérer la configuration OIDC. Vite la proxie vers Keycloak.

**Container / prod**

```yaml
keycloak:
  host: http://10.20.2.2:8080/auth
  issuer: https://10.20.2.5:9021/auth     # tokens issus de nginx
  realm: realms/RealmCybScolarite
  client: spa-app
```

---

## Spécifique au développement local — marquage `[DEV-LOCAL]`

Tout ce qui n'a de sens qu'en local est marqué d'un commentaire `[DEV-LOCAL]`
dans les fichiers concernés. Une recherche de `DEV-LOCAL` dans le dépôt suffit
à en retrouver l'inventaire. Depuis la séparation des espaces de travail, ce
qui était conditionnable l'a été : le realm Keycloak est le même module pour
les deux environnements, seules les valeurs changent. Ce qui reste marqué :

| Élément | Fichier |
|---|---|
| Service Docker Mailpit (SMTP factice) | `infra/container/compose.yaml` |
| Cible `_mailpit-up` (sans équivalent prod) | `makefile.local` |
| SMTP Mailpit et compte de démarrage `foo` | `infra/env/config-local.env` |
| CA mkcert (`keycloak.ca_cert`) | `infra/run/start-scolarite.sh` |
| Mailpit sans authentification, mot de passe de `foo` | `infra/env/secrets-local.env` |

Aucun identifiant de production, aucune adresse SMTP réelle ne doit figurer
dans ces blocs. `config-local.env` est versionné : il décrit la *forme* de
l'environnement, jamais un mot de passe — ceux-ci vivent tous dans
`secrets-<env>.env`.

### Mailpit

Le correctif « plus de mot de passe défini par l'application » rend l'envoi de
courriel indispensable : à la création d'un compte agent, Keycloak envoie un
lien `UPDATE_PASSWORD` avec lequel l'utilisateur choisit son mot de passe.
Sans serveur SMTP, aucun utilisateur n'est activable en local.

- **SMTP** : `10.20.2.6:1025`, interne au réseau Docker (utilisé par Keycloak).
- **Interface web** : `http://localhost:8025` (port publié) ou
  `http://10.20.2.6:8025` depuis l'hôte. C'est là qu'on retrouve les courriels
  de définition de mot de passe.
- Démarré par `start-local-keep` / `start-local-reset`, arrêté par
  `stop-local`, purgé par la cible `_purge`.

En cas d'échec d'envoi du courriel, le compte est conservé (sans mot de passe
utilisable) et l'échec est signalé dans la réponse HTTP (`email_envoye: false`
à la création unitaire, liste `email_echecs` à l'import). Relancer l'envoi se
fait en modifiant l'utilisateur ou via la console Keycloak (« Credential
Reset »). Aucun mot de passe ne transite jamais par l'application, ses logs ou
ses réponses.

### Compte de démarrage

Sans lui, personne ne peut se connecter sur un realm vierge pour créer les
autres comptes. Il est paramétré par les variables `bootstrap_user_*` :

| | `local` | `prod` |
|---|---|---|
| Créé | oui (`KC_BOOTSTRAP_USER_ENABLED=true`) | oui, le temps d'amorcer |
| Utilisateur | `foo` | `admin-demarrage` |
| Mot de passe initial | `Demarrage-Scolarite-2026!` | `KC_BOOTSTRAP_USER_PASSWORD` |
| Remplacement forcé au premier login | **non** | **oui** |
| Rôle | `ADMIN` (composite de tous les rôles fonctionnels) | idem |

Le mot de passe vit dans `secrets-<env>.env` et nulle part ailleurs. Une
`precondition` refuse l'`apply` si le compte est activé sans mot de passe.

### Comptes de test Playwright (front/e2e)

Même conditionnement que le compte de démarrage, deux comptes en plus —
`ADMIN` est déjà couvert par `foo` — désactivés par défaut
(`TEST_*_USER_ENABLED=false`), activés seulement dans `config-local.env` :

| | Utilisateur | Rôle |
|---|---|---|
| `TEST_CONSULTATION_USER_*` | `test-consultation` | `CONSULTATION` seul |
| `TEST_NOTES_ECRITURE_USER_*` | `test-notes-ecriture` | `NOTES_ECRITURE` seul |

Mot de passe dans `secrets-local.env`. Voir `infra/keycloak/keycloak.tf`
section 6.

`KC_BOOTSTRAP_USER_PASSWORD_TEMPORARY` (topologie) décide du remplacement
forcé. En prod il vaut `true` : ce mot de passe a transité par un fichier, et
souvent par une conversation — il ne doit pas survivre à l'amorçage. En local
il vaut `false` : `foo` est public et documenté, le retaper après chaque remise
à zéro de la base n'apporte rien. La variable vaut `true` par défaut, un
environnement qui l'oublie force donc le changement.

> **Quand la valeur prend effet.** Le provider n'applique `initial_password`
> qu'à la **création** de l'utilisateur : la modifier ne produit aucun plan sur
> un compte existant. En local, elle prend effet au prochain
> `make start-local-reset` (qui recrée le realm). Pour l'appliquer tout de
> suite : `terraform -chdir=infra/keycloak apply -replace='keycloak_user.bootstrap[0]'`
> — le mot de passe repart alors de `KC_BOOTSTRAP_USER_PASSWORD`.

### À ne pas confondre : les comptes agents

Les comptes créés par l'application (`back/pkg/user/user.go`) ne reçoivent
**aucun** mot de passe : Keycloak leur envoie un courriel `UPDATE_PASSWORD`
avec lequel l'utilisateur choisit le sien (visible dans Mailpit en local). Il
n'y a rien à y rendre facultatif — sans ce parcours, le compte n'a pas de mot
de passe du tout. `KC_BOOTSTRAP_USER_PASSWORD_TEMPORARY` ne le concerne pas.

En prod, une fois les vrais administrateurs créés : repasser
`KC_BOOTSTRAP_USER_ENABLED` à `false` dans `infra/env/config-prod.env` et vider
`KC_BOOTSTRAP_USER_PASSWORD`. Le prochain `apply` supprime le compte.

Les identifiants du provider Terraform ne sont plus en dur dans
`keycloak.tf` : ils viennent de `KEYCLOAK_ADMIN` (topologie) et
`KEYCLOAK_ADMIN_PASSWORD` (secrets), mappés vers `TF_VAR_keycloak_user` /
`TF_VAR_keycloak_password` par les makefiles.

### Certificats mkcert

`front/cert/*.pem` ne sont plus suivis par git (ils l'étaient par erreur,
antérieurement à la règle `.gitignore`). Sur une nouvelle machine, les
régénérer avant le premier lancement :

```bash
cd front/
mkdir -p cert
mkcert -key-file cert/localhost-key.pem \
       -cert-file cert/localhost.pem \
       localhost 10.20.2.1
```

### Import d'utilisateurs (Excel)

Colonnes attendues (première feuille, ligne 1 = en-têtes) :

```
Nom | Prénom | Email | Nature | Rôles
```

- **Nature** : `ELEVE` ou `AGENT` (vide = `AGENT`). Persistée en base
  (`user.type_personne`) — c'est elle qui distingue un élève d'un agent.
- **Rôles** : liste séparée par des virgules parmi `CONSULTATION`,
  `STRUCTURE_ECRITURE`, `NOTES_ECRITURE`, `JURY_ECRITURE`,
  `PROGRAMME_ECRITURE`, `SALLES_ECRITURE`, `CERTIFICATION_ECRITURE`,
  `UTILISATEURS_ECRITURE`, `ADMIN`. Poussés vers Keycloak uniquement, jamais
  en base. Un élève ne porte aucun rôle et n'a pas de compte Keycloak.
- Plus de colonne mot de passe : chaque agent créé reçoit un courriel
  Keycloak pour définir le sien (visible dans Mailpit en local).

---

## Suite Playwright (front/e2e)

Filet de régression de l'interface — sept suites P0 (navigation, droits,
grille de saisie, corbeille, écran Notes unifié, import de fiche, i18n).

Installation (une fois par machine) :

```bash
cd front && npx playwright install chromium
```

Lancement — présuppose une stack déjà debout (`make start-local-keep`), ne
la démarre pas :

```bash
make test-ihm
```

Pose le jeu de données dédié (`front/e2e/setup/seed.sql`, idempotent, sous le
préfixe `E2E `) puis lance la suite. `PLAYWRIGHT_BASE_URL` override l'adresse
par défaut (`https://10.20.2.5:9021`, celle de `start-local-keep`).

Un test est volontairement marqué `test.fail` dans `navigation.spec.ts` : il
prouve un défaut réel (lien profond ou rechargement froid → rebond Keycloak
vers un écran par défaut, `redirectUri` figé sur la racine dans
`KeycloakContext.tsx`), pas un défaut de la suite. Voir le compte-rendu de
vérification pour la reproduction complète.
