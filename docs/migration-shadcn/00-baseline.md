# Étape 0 — assainissement et baseline (migration MUI → shadcn/ui + Tailwind)

But de ce lot : aucun changement de comportement visible. Périmètre : `front/`
uniquement.

## 1. Dépendances retirées

Vérifié pour chaque candidat : aucune référence dans `front/src`, `front/e2e`,
les fichiers de config à la racine de `front/`, `index.html`, ni les
makefiles à la racine du dépôt.

| Dépendance | Preuve de non-usage |
|---|---|
| `ag-grid-community` | `grep -rn` sur `front/src`, `front/e2e`, configs, `index.html`, makefiles : aucune occurrence hors `package.json`/`package-lock.json`. |
| `ag-grid-react` | Idem. |
| `@mui/x-data-grid` | Idem — zéro `import` nulle part dans le code applicatif. |

Après suppression du champ `dependencies` et `npm install`,
`@mui/x-data-grid` réapparaît dans `package-lock.json`, mais uniquement comme
dépendance imbriquée de `@toolpad/core` (que l'on conserve, cf. « en sortie »
dans `.claude/CLAUDE.md`) — pas comme dépendance de premier niveau, pas
importée par notre code. Confirmé en lisant l'entrée du lockfile
(`node_modules/@toolpad/core` → `"@mui/x-data-grid": "^8.5.0"`).

`npm install` a supprimé 3 paquets, sans toucher au reste de l'arbre.

## 2. Cas signalés, non tranchés

Ces deux dépendances n'ont aucun script npm, makefile ni fichier de config
qui les invoque — mais je ne les ai pas supprimées, comme demandé.

- **`openapi-zod-client`** : CLI de génération de schémas Zod depuis une
  spec OpenAPI. Aucun `openapi.yaml`/`.json` trouvé dans le dépôt, aucun
  script `package.json` ni cible de makefile ne l'appelle. Introduite dans
  le commit initial `0dc95b8` (« adaptation »), sans commit dédié depuis.
  **Question posée : a-t-elle servi ponctuellement en local (génération one-shot
  jamais reproduite depuis), ou peut-elle être retirée ?**
- **`sass-embedded`** : zéro fichier `.scss` dans le dépôt (`find front/src
  front/e2e -iname "*.scss"` ne retourne rien), alors que
  `front/src/typings.d.ts` déclare toujours `declare module "*.scss";`.
  Même origine (`0dc95b8`), même absence de trace d'usage.
  **Question posée : le `declare module` a-t-il un usage résiduel qui
  justifierait de garder la dépendance, ou les deux (déclaration + paquet)
  peuvent-ils partir ensemble ?**

Non tranchées ici, à trancher par l'utilisateur avant un lot ultérieur.

## 3. Lockfile

`front/` versionnait `package-lock.json` **et** `pnpm-lock.yaml`.
`infra/run/build/Dockerfile` (étape `frontend-builder`) fait foi : il copie
`front/package*.json` puis exécute `npm ci` — jamais pnpm. Les makefiles à la
racine ne mentionnent que `npm run dev`/`npm run build`. Aucune trace de pnpm
ailleurs dans `infra/`.

**Décision : npm est le gestionnaire de paquets du projet.**
`pnpm-lock.yaml` supprimé.

## 4. État lint / build / e2e

Stack locale déjà lancée (`make -f makefile.local start-local-keep`),
utilisée telle quelle pour les deux mesures.

### Avant intervention (dépendances et double lockfile en place)

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b && vite build`) | ✅ succès, voir tailles de bundle ci-dessous |
| `npx playwright test` (×2, pour distinguer flake et défaut stable) | **27 passed, 4 failed** — identique aux deux exécutions, byte pour byte (mêmes 4 tests, mêmes messages d'erreur) |

Les 4 échecs sont **déterministes**, donc un défaut préexistant et non un
défaut d'exécution flaky — pas de rapport avec ce lot puisqu'aucune
modification n'était encore appliquée au moment de cette mesure :

- `corbeille.spec.ts:18` et `corbeille.spec.ts:45` — timeout sur le clic du
  `treeitem` « Option E2E Option Sacrificielle » dans
  `aide/hierarchieE2E.ts:237` (la page/le contexte se ferme avant que le clic
  n'aboutisse).
- `grille-saisie.spec.ts:5` — après saisie clavier + Entrée, le badge
  « Note enregistrée pour Eleve1 E2E » n'apparaît pas dans les 5 s.
- `grille-saisie.spec.ts:51` — le champ de note de Eleve4 E2E reste
  `disabled` alors que le test attend qu'il soit `enabled` en entrant dans le
  test (état résiduel probable d'un test précédent, cf. commentaire ligne 57
  du spec lui-même : « qu'un test précédent a pu changer »).

**Signalé sans corriger, conformément au « Hors périmètre » de ce lot.**

### Après intervention (dépendances mortes retirées, `pnpm-lock.yaml` supprimé, `npm install`)

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement — identique |
| `npm run build` | ✅ succès, tailles de bundle strictement identiques (attendu : ces paquets n'étaient jamais importés, donc jamais bundlés) |
| `npx playwright test` | **27 passed, 4 failed** — mêmes 4 tests, mêmes messages. Aucune régression introduite. |

**Aucune suppression n'a fait échouer lint, build ou e2e.**

## 5. Tailles de bundle de référence

Identiques avant/après (cf. § 4). Rapport détaillé généré par
`rollup-plugin-visualizer` à `front/dist/report.html` (non committé).

| Chunk | Taille | Gzip |
|---|---|---|
| `index.html` | 0.97 kB | 0.41 kB |
| `rolldown-runtime` | 0.68 kB | 0.41 kB |
| `tanstack-libs` | 108.18 kB | 30.83 kB |
| `index` (code applicatif) | 249.36 kB | 66.48 kB |
| `fullcalendar-libs` | 270.30 kB | 78.50 kB |
| `recharts-libs` | 360.02 kB | 104.07 kB |
| `mui-material-libs` | 396.92 kB | 110.26 kB |
| `mui-libs` | 445.99 kB | 143.57 kB |
| `vendor` | 520.41 kB | 160.22 kB |

Avertissement Vite déjà présent : plusieurs chunks dépassent 500 kB
minifiés (`mui-libs`, `vendor`) — point de comparaison pour la fin de
migration, où le remplacement de MUI devrait faire baisser `mui-libs` et
`mui-material-libs`.

## 6. Ce qui n'a pas été touché

- `back/`, `infra/` : hors périmètre, non modifiés.
- Les 4 échecs e2e préexistants : non corrigés (hors périmètre de ce lot).
- `openapi-zod-client`, `sass-embedded` et le `declare module "*.scss"` de
  `typings.d.ts` : en attente de décision (§ 2).
- `npm audit` signale 14 vulnérabilités (1 low, 4 moderate, 9 high) sur les
  602 paquets restants — préexistant, non traité ici (hors périmètre, aucune
  demande de l'utilisateur).
