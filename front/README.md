# Front scolarité — React + TypeScript + Vite

Base mixte entre le gabarit `react-ts` de Vite et
[l'exemple `core` de Toolpad](https://github.com/mui/toolpad/tree/master/examples/core).

## Prérequis

- Node 22 ou plus (l'image de build est `node:22-alpine`), puis `npm ci`.
- Les certificats HTTPS du serveur de développement, absents du dépôt car
  `front/cert/` est ignoré par git. À générer une fois :

  ```bash
  mkdir -p cert
  mkcert -key-file cert/localhost-key.pem -cert-file cert/localhost.pem localhost 10.20.2.1
  ```

  Ils ne servent qu'au mode `development` ; les builds n'en ont pas besoin.

## Les deux façons de lancer le front

| Commande | Qui sert le front | Backend joint |
|---|---|---|
| `make start-dev` puis `npm run dev` | serveur Vite, `https://10.20.2.1:5173` | `localhost:3333`, lancé à la main |
| `make start-local-keep` (ou `start-prod-keep`) | nginx, `https://10.20.2.5:9021`, bundle construit dans l'image | conteneur `scolarite-backend` |

Un seul bundle sert tous les environnements : le front s'adresse à **l'origine
qui le sert** (`window.location.origin`, dans `src/services/api.ts` et
`src/KeycloakContext.tsx`). Vite proxifie `/api` et `/auth/` ; nginx les sert
sous la même origine que `/`. Aucune URL n'est donc figée au build — c'est ce
qui permet de pousser l'image nginx sur un registre et de la déployer telle
quelle (`docs/deployements.md`, « Images et déploiement »).

### 1. Vite à la main, backend dans le debugger

Le serveur Vite sert le front et reverse-proxie `/api` vers le backend lancé
hors conteneur depuis le debugger VSCode, ainsi que `/auth` vers Keycloak.

Postgres, Keycloak et Mailpit doivent tourner au préalable. Une cible dédiée
les met en place — avec les migrations Liquibase et la génération sqlc — sans
construire les images backend et nginx, inutiles ici :

```bash
make start-dev            # depuis la racine du dépôt
cd front && npm run dev
```

Le backend se lance ensuite depuis le debugger VSCode, configuration
« Debug scolarite ». Pour repartir d'une base vierge, `make start-dev-reset`
remplace `make start-dev`. Pour tout arrêter : `make stop-local`.

Le port 5173 est verrouillé (`strictPort`) : les en-têtes `X-Forwarded-*`
envoyés à Keycloak annoncent ce port, donc un glissement silencieux vers 5174
ferait rediriger Keycloak vers un serveur qui n'existe pas. Si le port est
occupé, Vite refuse de démarrer plutôt que d'en changer.

Le mode Vite choisit seulement les **cibles du proxy** (table `CIBLES_PROXY`
de `vite.config.ts`) : `development` (défaut) joint le backend du debugger,
`npm run dev -- --mode conteneurs` joint le backend de la pile locale en
court-circuitant nginx, pour déboguer le front contre elle sans la
reconstruire. Ce second mode ne peut pas s'appeler `local` : Vite refuse ce
nom, qui entrerait en conflit avec le suffixe `.local` des fichiers d'environnement.

### 2. Pile complète, bundle dans l'image nginx

Le front est **construit** puis servi par nginx, qui reverse-proxie vers le
conteneur backend. Le serveur Vite n'intervient pas. Le build est fait dans
l'image (`infra/run/build/Dockerfile`), pas sur le poste :

```bash
make start-local-keep     # garde la base de données
make start-local-reset    # réinitialise la base de données
make stop-local
```

Pour construire le bundle seul, sans la pile : `npm run build`. La prod tire la
même image d'un registre au lieu de la construire (`make start-prod-keep
IMAGES_TAG=…`).

## Variables d'environnement

Un seul fichier, `front/.env`, versionné et commun à tous les modes :

| Variable | Rôle |
|---|---|
| `VITE_KEYCLOAK_REALM` | realm Keycloak (`KC_REALM` des topologies) |
| `VITE_KEYCLOAK_CLIENT_ID` | client public du front (`KC_CLIENT_ID`) |

`vite.config.ts` refuse de démarrer si l'une manque. Les anciennes
`VITE_API_URL` et `VITE_KEYCLOAK_URL` ont disparu avec les fichiers
`.env.<mode>` : le front ne connaît que son origine.

> **Ne pas créer de fichier `.env.local` ni `.env.<mode>.local`.** Ces
> suffixes surchargent silencieusement `front/.env`. Un ancien
> `.env.production.local` masquait ainsi les URL de `.env.production`
> derrière celles des conteneurs.

Adresses fixes du réseau `scolarite-net` :

| Adresse | Rôle |
|---|---|
| `10.20.2.1` | poste de développement (serveur Vite) |
| `10.20.2.2` | Keycloak (`keycloak-3`), port 8080 |
| `10.20.2.3` | Postgres |
| `10.20.2.4` | backend, port 3333 |
| `10.20.2.5` | nginx, 9020 en HTTP et 9021 en HTTPS |
| `10.20.2.6` | Mailpit |

## Autres scripts

| Commande | Effet |
|---|---|
| `npm run lint` | ESLint sur tout le projet |
| `npm run preview` | sert le contenu de `dist/` déjà construit |

Le build produit aussi `dist/report.html`, le rapport de taille des bundles
(`rollup-plugin-visualizer`).

## Notes du gabarit Vite

Deux plugins officiels existent pour le Fast Refresh :
[`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react)
(Babel, celui utilisé ici) et
[`@vitejs/plugin-react-swc`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc)
(SWC).

Pour durcir ESLint avec des règles typées, remplacer
`tseslint.configs.recommended` par `recommendedTypeChecked` ou
`strictTypeChecked`, en renseignant `parserOptions.project` avec
`./tsconfig.node.json` et `./tsconfig.app.json`. Les greffons
[`eslint-plugin-react-x`](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x)
et
[`eslint-plugin-react-dom`](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom)
ajoutent des règles propres à React.
