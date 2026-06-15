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

### Configuration du client `spa-app` dans Keycloak Admin

Aller sur `https://10.20.2.5:9021/auth` → realm `RealmCybScolarite` → Clients → `spa-app` → Settings :

**Valid redirect URIs** — ajouter :
```
https://10.20.2.5:9021/*
https://10.20.2.1:5173/*
https://localhost:5173/*
```

**Web origins** — ajouter :
```
https://10.20.2.5:9021
https://10.20.2.1:5173
https://localhost:5173
```

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
