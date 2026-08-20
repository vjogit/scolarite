# Déploiement & configuration locale

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
  origine. Les origines autorisées viennent de `TF_VAR_frontend_urls` dans le
  fichier de secrets local.

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
dans les fichiers concernés. Le jour du chantier de séparation des
environnements, une recherche de `DEV-LOCAL` dans le dépôt suffit à retrouver
ce qui doit être conditionné. Inventaire actuel :

| Élément | Fichier |
|---|---|
| Service Docker Mailpit (SMTP factice) | `infra/container/compose.yaml` |
| Cible `_mailpit-up` | `makefile.local` |
| Bloc `smtp_server` du realm (pointe vers Mailpit) | `infra/keycloak/keycloak.tf` |
| Compte de départ `foo` et son rôle ADMIN | `infra/keycloak/keycloak.tf` |

Aucun identifiant de production, aucune adresse SMTP réelle ne doit figurer
dans ces blocs.

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

### Compte de départ

| Utilisateur | Mot de passe initial | Rôle |
|---|---|---|
| `foo` | `Demarrage-Scolarite-2026!` | `ADMIN` (composite de tous les rôles fonctionnels) |

Le mot de passe est **temporaire** : Keycloak force son remplacement à la
première connexion.

Les identifiants du provider Terraform ne sont plus en dur dans
`keycloak.tf` : ils viennent de `KEYCLOAK_USER` / `KEYCLOAK_PASSWORD`
(mappés vers `TF_VAR_keycloak_user` / `TF_VAR_keycloak_password`) dans le
fichier de secrets local.

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
