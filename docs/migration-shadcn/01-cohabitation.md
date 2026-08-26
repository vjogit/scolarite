# Étape 1 — cohabitation Tailwind v4 / MUI (migration MUI → shadcn/ui)

But de ce lot : faire cohabiter Tailwind v4 et MUI dans `front/`, sans qu'un
seul écran existant ne bouge visuellement. Périmètre : `front/` uniquement.
Aucun composant MUI remplacé, aucun écran métier retouché.

## 1. Ce qui a été installé

| Paquet | Rôle |
|---|---|
| `tailwindcss` ^4.3.3, `@tailwindcss/vite` ^4.3.3 | Moteur Tailwind v4, plugin Vite |
| `shadcn` ^4.19.0 | CLI shadcn (registre v4) — expose aussi `shadcn/tailwind.css`, importé à l'exécution (voir §2) |
| `@base-ui/react` ^1.7.0 | Bibliothèque de primitives choisie à l'init (« Base UI (Recommended)», pas Radix — voir §3) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Utilitaires de composition de classes requis par tout composant shadcn |
| `tw-animate-css` | Animations Tailwind (garde-fou du thème shadcn, même sans composant animé pour l'instant) |
| `@fontsource-variable/geist` | Police du preset shadcn « Nova » (voir §3) — non branchée visuellement, cf. §5 |
| `lucide-react` | Bibliothèque d'icônes déclarée dans `components.json` (`iconLibrary: "lucide"`) — **inutilisée à ce stade**, confirmé absente du bundle (§7) |

`tailwindcss`/`@tailwindcss/vite` installés sans `-D`, exactement comme la
commande officielle (`npm install tailwindcss @tailwindcss/vite`, sans
`--save-dev`) ; le reste est arrivé de la même façon via `shadcn init`. Toutes
ces dépendances se retrouvent donc dans `dependencies`, pas
`devDependencies` — y compris `shadcn` elle-même, parce que
`src/index.css` fait `@import "shadcn/tailwind.css"` : c'est un import
résolu par Vite au build, donc une dépendance réelle du bundle, pas
seulement de la CLI. **Constaté, non corrigé** : une hygiène plus stricte
séparerait ces outils de build de `dependencies`, mais `infra/run/build/Dockerfile`
fait un `npm ci` simple (pas `--omit=dev`), donc ça ne change rien au
comportement du build conteneurisé aujourd'hui.

Aucun flag `--legacy-peer-deps` ni `--force` n'a été nécessaire : `npm
install`, `npx shadcn@latest init` et `npx shadcn@latest add button` se sont
tous déroulés sans erreur `ERESOLVE` malgré React 19.

## 2. L'ordre des couches CSS — configuration et pourquoi

### Déclaration dans la feuille globale

`front/src/index.css` (nouveau — premier fichier CSS du projet, importé
depuis `main.tsx`) :

```css
@layer theme, base, mui, components, utilities;

@import "tailwindcss";
```

Cette ligne doit rester la **toute première** du fichier. Emotion (moteur de
MUI) injecte du CSS non layeré par défaut ; en CSS, une règle hors couche
l'emporte toujours sur une règle en couche, quelle que soit sa spécificité.
En déclarant l'ordre nous-mêmes avant que Tailwind ne développe ses propres
couches (`theme`, `base`, `components`, `utilities`), MUI (couche `mui`) se
retrouve intercalé *entre* `base` (préflight Tailwind) et `components`/
`utilities` : Tailwind et, plus tard, shadcn peuvent donc surcharger MUI,
mais MUI garde priorité sur le préflight.

### `StyledEngineProvider enableCssLayer`

`front/src/main.tsx`, à la racine de l'arbre (au-dessus de `RouterProvider`,
donc au-dessus de `App`/`Layout` et de leurs fournisseurs de thème déjà
empilés) :

```tsx
<StyledEngineProvider enableCssLayer>
  <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
  <RouterProvider router={router} />
</StyledEngineProvider>
```

`enableCssLayer` fait envelopper par MUI (`@mui/styled-engine` 7.3.8,
confirmé en lisant `StyledEngineProvider.js`) tout le CSS qu'il injecte dans
`@layer mui { ... }`. Ce comportement existe déjà dans le MUI v7 du projet —
la doc officielle mentionne v9.3.1 en bandeau de version, mais rien dans le
code de `enableCssLayer` n'en dépend ; vérifié directement dans
`node_modules/@mui/styled-engine`.

### La découverte non documentée : une course au premier enregistrement de couche

**Constat en cours de vérification, pas dans la doc officielle.** Déclarer
l'ordre des couches *seulement* dans `index.css` ne suffit pas : au premier
essai, tous les écrans existants avaient perdu leur apparence MUI (boutons
et champs sans fond, sans marge — capture faite sur l'écran Structure,
`catalog_context/formation`, avant correction). Le second bouton MUI de la
page témoin (§6), sans classe Tailwind, montrait le même défaut : fond
transparent, `padding: 0`.

Cause identifiée en inspectant `document.styleSheets` dans le navigateur :
l'ordre effectif des couches CSS est fixé par la **première** mention de
chaque nom de couche rencontrée par le navigateur, tous documents confondus,
dans l'ordre où les feuilles sont enregistrées dans le CSSOM — pas par leur
position dans le DOM final. Or `StyledEngineProvider` positionne les styles
« globaux » d'Emotion (`CssBaseline`, `GlobalStyles`) *avant* un point
d'insertion (`<meta name="emotion-insertion-point">`) lui-même préposé en
tête de `<head>` (`head.prepend(insertionPoint)`, dans
`StyledEngineProvider.js`). Ces styles globaux, insérés en JS de façon
synchrone dès le premier rendu, gagnaient donc systématiquement la course
contre `index.css` — une feuille externe, chargée par le réseau — pour être
le premier à mentionner `@layer mui`. Résultat observé dans
`document.styleSheets` : `mui` enregistré en position 0 (perdant face à
`base`), au lieu de la position 3 voulue.

C'est précisément le rôle du second réglage documenté par MUI et initialement
pris pour redondant avec `index.css` : `<GlobalStyles styles="@layer
theme, base, mui, components, utilities;" />`, posé comme tout premier enfant
de `StyledEngineProvider`. Rendu par React de façon synchrone, avant tout
autre composant MUI (y compris `CssBaseline`), il gagne toujours la course —
confirmé après coup : `document.styleSheets[0]` porte exactement cette
déclaration, et tous les écrans ont retrouvé leur apparence normale (capture
avant/après dans l'historique de travail, non committée).

**À retenir pour la suite de la migration** : la déclaration dans le CSS
global seule est une garantie *statique* (pour les outils qui lisent le
fichier) mais pas une garantie *runtime* — le `<GlobalStyles>` est la seule
version qui ne dépend pas d'une course réseau contre le premier rendu React.
Les deux doivent rester en place ensemble.

## 3. Frictions rencontrées

- **rolldown-vite** : aucune. `@tailwindcss/vite` et `npx shadcn@latest
  init --template vite` se sont accommodés de `npm:rolldown-vite@7.3.1`
  sans avertissement ni erreur.
- **peer deps React 19** : aucune, cf. §1.
- **tsconfig durci** : `noUnusedLocals`/`erasableSyntaxOnly` ont fait
  échouer le lint une fois (`react-refresh/only-export-components` sur
  `button.tsx`, qui exportait à la fois le composant `Button` et la
  constante `buttonVariants`). Corrigé en sortant `buttonVariants` dans
  `button-variants.ts` — la solution usuelle dans les projets shadcn, pas un
  relâchement de règle.
- **Bug réel du CLI shadcn (alias non résolu)** : `npx shadcn@latest init`
  a d'abord écrit les fichiers dans un dossier **littéral** `./@/` au lieu
  de résoudre l'alias vers `./src/`, alors que la validation d'alias du même
  run annonçait « ✔ ». La cause : le CLI a besoin de `compilerOptions.paths`
  dans le `tsconfig.json` **racine** pour résoudre l'alias au moment
  d'écrire les fichiers, alors que la validation d'alias, elle, se contente
  de `tsconfig.app.json`. Le point 2 de la commande prévoyait cette
  éventualité (« éventuellement dans le tsconfig racine si le CLI l'exige »)
  — c'est arrivé. Corrigé en ajoutant `compilerOptions.baseUrl`/`paths` au
  `tsconfig.json` racine, à côté de `files: []` et `references`, sans
  toucher à la structure en références :

  ```json
  {
    "files": [],
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "@/*": ["./src/*"] }
    },
    "references": [ ... ]
  }
  ```

  Après quoi `npx shadcn@latest add button` a écrit au bon endroit
  (`src/components/ui/button.tsx`). Le dossier `./@/` mal placé du premier
  essai a été supprimé (jamais committé).
- **`lib/utils.ts` manquant après la reprise** : conséquence directe du
  point précédent — le premier essai avait posé `@/lib/utils.ts` (dans le
  mauvais dossier), supprimé avec le reste. `npx shadcn add button` ne l'a
  pas régénéré (il ne s'occupe que du composant demandé). Recréé
  manuellement — contenu standard shadcn (`cn()` via `clsx` + `tailwind-merge`),
  aucune improvisation.
- **`StyledEngineProvider`, placement** : testé au-dessus de
  `RouterProvider`, donc au-dessus de `App.tsx` (`ReactRouterAppProvider` de
  Toolpad, `QueryClientProvider`, `LocalizationProvider`) et de
  `layouts/dashboard.tsx` (`ThemeProvider` MUI). `StyledEngineProvider` ne
  fournit qu'un cache Emotion par contexte React, sans rendu propre : il ne
  crée pas de fournisseur de thème concurrent, donc aucun conflit avec les
  contextes de thème déjà empilés de Toolpad. Vérifié à l'écran (§6, §7) :
  aucun changement visuel.

## 4. `shadcn init` — flags utilisés et pourquoi

```
npx shadcn@latest init --template vite -b base -p nova -y
npx shadcn@latest add button -y
```

- `--template vite` : le générateur par défaut (`-d`/`--defaults`) cible
  Next.js (`--template=next --preset=base-nova`) ; le projet est un Vite
  SPA, donc template explicite.
- `-b base` (« Base UI (Recommended) ») : proposé en premier par le CLI,
  face à React Aria et Radix UI. Aucune contrainte du projet ne favorisait
  Radix, et Base UI est la recommandation actuelle de l'équipe shadcn — pas
  d'arbitrage supplémentaire fait ici, à valider si besoin plus tard.
- `-p nova` : seul preset proposé « recommandé » (`Nova - Lucide / Geist`)
  parmi huit ; les sept autres (Vega, Maia, Lyra, Mira, Luma, Sera, Rhea)
  n'ont pas été évalués. Le preset ne fixe qu'une police et une bibliothèque
  d'icônes par défaut — aucune des deux n'est branchée visuellement (§5) —
  et un jeu de couleurs neutres (`baseColor: "neutral"`) qui ne s'applique
  qu'aux composants shadcn, jamais à MUI.
- `-y` : équivalent au comportement par défaut de la CLI (skip confirmation),
  rendu explicite plutôt que subi.

`components.json` (nouveau) fixe l'alias `@/components`, `@/lib`,
`@/hooks` etc., et `tailwind.css: "src/index.css"` — la CLI écrit
directement dans notre feuille globale plutôt que d'en créer une séparée.

## 5. Dette temporaire

### Route témoin `/_cohabitation`

Non liée au menu, non protégée par un rôle (seule l'authentification
Keycloak imposée par `Layout` s'applique). Fichier :
`front/src/pages/_cohabitation/Cohabitation.tsx` — son commentaire de tête
répète cette note. **À retirer en fin de migration** : supprimer le fichier,
son entrée dans `main.tsx` (bloc de route `_cohabitation` + import
`Cohabitation`), rien d'autre n'en dépend.

### Police Geist et bibliothèque d'icônes Lucide

Posées par le preset shadcn mais **non branchées visuellement** : le corps
de page (`body`) garde la police MUI (`Roboto, Helvetica, Arial,
sans-serif`), fixée par `CssBaseline`/le thème MUI dans la couche `mui` —
qui l'emporte sur la règle `html { @apply font-sans; }` du `@layer base`
généré par shadcn (`src/index.css`), *et* parce que `font-family` se
transmet par héritage CSS depuis `body`, pas depuis `html`, dès qu'un
descendant a sa propre valeur explicite. Vérifié à l'écran (§6) : aucune
police ne bouge. `lucide-react` n'est importé nulle part — confirmé absent
du bundle (§7).

### `mui-libs` : chunk Radix non ajouté

Le point f de la commande envisageait un chunk `manualChunks` dédié à Radix.
Non fait : l'initialisation a retenu Base UI plutôt que Radix (§4), et
l'empreinte de `@base-ui/react` dans le bundle actuel se limite aux modules
du composant `Button` (`node_modules/@base-ui/react/button/*`,
`internals/composite/*`, `merge-props/*` — une quinzaine de petits fichiers,
cf. §7), pas toute la bibliothèque. Un chunk dédié n'apporterait rien tant
que la surface utilisée reste aussi réduite ; à reconsidérer quand plusieurs
composants shadcn seront ajoutés.

## 6. Vérification manuelle — page témoin

Quatre points démontrés sur `/_cohabitation` (Playwright MCP, compte
`test-e2e`, build conteneurs `https://10.20.2.5:9021`) :

1. **Utilitaire Tailwind sur un élément nu** — bandeau bleu à coins
   arrondis, texte blanc, sur un `<div>` brut. Conforme.
2. **Utilitaire Tailwind sur un composant MUI** (le test qui valide l'ordre
   des couches) — `<Button variant="contained" className="bg-pink-600">`
   rendu rose, pas bleu MUI par défaut. C'est le test qui aurait échoué si
   la course décrite au §2 n'avait pas été corrigée.
3. **Bouton shadcn et bouton MUI côte à côte** — les deux correctement
   stylés (shadcn : fond noir, coins arrondis ; MUI : fond bleu `#1976d2`,
   élévation), visuellement distincts, aucun n'écrase l'autre.
4. **Préflight Tailwind vs typographie MUI environnante** — `<Typography
   variant="h1">` et `variant="body1">` conservent leur rendu MUI habituel.
   Seul effet observé du préflight : une liste `<ul>/<li>` **brute** (aucun
   composant MUI ne l'habille) perd puces et retrait — normal et attendu,
   Tailwind neutralise les styles par défaut du navigateur sur les éléments
   qu'il ne connaît pas comme siens ; aucun écran de l'application n'utilise
   de liste HTML nue hors MUI.

### Découverte hors périmètre de la page témoin, corrigée dans ce lot

La page témoin n'aurait *pas*, à elle seule, révélé le défaut du §2 avec
certitude : son bouton MUI « nu » (point 3) montrait déjà le symptôme
(fond transparent, `padding: 0`), mais rien ne garantissait qu'un lecteur
l'attribue au bon composant plutôt qu'à un simple oubli de style. La
vérification décisive a été de retourner sur un **écran réel** de
l'application (Structure, `/catalog_context/formation`) : tous les boutons
d'icône (➕, corbeille, œil, menu à trois points) y avaient perdu leur
apparence Material (plus de fond circulaire, plus de retrait au survol) —
un défaut visible sur toute la surface de l'application, pas seulement sur
la page témoin. Corrigé par le `<GlobalStyles>` du §2 ; revérifié à l'écran
après correctif, apparence identique à l'avant-migration.

### Retrait de la route en fin de migration

```
git rm front/src/pages/_cohabitation/Cohabitation.tsx
# puis dans front/src/main.tsx : retirer l'import Cohabitation et le bloc
# de route { path: '_cohabitation', Component: Cohabitation }
```

## 7. Lint / build / e2e — avant / après

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement — identique à l'étape 0 |
| `npm run build` | ✅ succès |

### e2e — ce qui a été observé, et pourquoi la comparaison est plus longue que prévu

Le critère d'acceptation demandait un résultat **identique** à la baseline
(27 passed / 4 failed : `corbeille.spec.ts:18`, `corbeille.spec.ts:45`,
`grille-saisie.spec.ts:5`, `grille-saisie.spec.ts:51`). Les deux premières
exécutions avec nos changements ne l'ont pas donné :

| Exécution | Résultat | Échecs |
|---|---|---|
| Baseline (00-baseline.md, ×2, identiques) | 27 passed / 4 failed | corbeille:18, corbeille:45, grille-saisie:5, grille-saisie:51 |
| Avec nos changements, run 1 | 29 passed / 2 failed | corbeille:18, droits:55 |
| Avec nos changements, run 2 | 30 passed / 1 failed | grille-saisie:5 |

Ni le compte ni l'ensemble des échecs ne correspondaient à la baseline, ni
d'un run à l'autre — signal explicitement à investiguer plutôt qu'ignorer
selon la consigne. **Contrôle effectué** : `git stash` de tous nos
changements, rebuild du conteneur sur le code non modifié, deux exécutions
de la suite dans les mêmes conditions (même machine, même session) :

| Exécution (code non modifié, contrôle) | Résultat | Échecs |
|---|---|---|
| Contrôle 1 | 27 passed / 4 failed | droits:55, grille-saisie:51, grille-saisie:67, notes-unifie:81 |
| Contrôle 2 | 31 passed / 0 failed | (aucun) |

Le code **non modifié** produit lui aussi un ensemble d'échecs différent de
la baseline documentée, et différent entre ses deux propres exécutions —
jusqu'à être entièrement vert une fois. **Conclusion : la suite e2e est
actuellement instable dans cet environnement, indépendamment de ce lot.**
Le nombre total de tests (31) est resté constant dans les six exécutions
(baseline comprise), donc aucun test n'a disparu ou changé de forme.

`git stash pop` puis `npm install` restaurés, conteneur reconstruit avec nos
changements réels. Deux exécutions supplémentaires, complètement vertes :

| Exécution (nos changements, finale) | Résultat |
|---|---|
| Run 3 | 31 passed / 0 failed |
| Run 4 (après correctif `<GlobalStyles>` du §2) | 31 passed / 0 failed |

**Ce lot n'a donc pas reproduit la baseline au sens strict**, mais l'écart
est démontré indépendant de ce lot par le contrôle sur code non modifié, et
l'état final (deux exécutions vertes consécutives) satisfait le critère
permanent de la suite (§ CLAUDE.md « deux exécutions consécutives
vertes »). **À signaler à l'utilisateur, pas tranché ici** : la baseline de
l'étape 0 n'est plus reproductible telle quelle sur cette machine/session —
sujet distinct de la migration CSS, potentiellement lié à la charge système
au moment de la mesure. Les 4 échecs originaux (corbeille, grille-saisie)
n'ont pas été corrigés — hors périmètre, comme demandé.

Note annexe sur `navigation.spec.ts:20` (« lien profond copié dans un
nouvel onglet ») : ce test affiche systématiquement un ✘ transitoire dans
le journal `list` de Playwright (visible dans toutes nos exécutions, y
compris les contrôles) sans figurer dans le décompte final des échecs. Ce
test ouvre un nouvel onglet à froid, ce qui déclenche le rebond Keycloak
documenté au §8 — comportement pré-existant, sans rapport avec ce lot.

## 8. Découverte hors périmètre, signalée sans correction

En vérifiant la page témoin, la navigation directe (rechargement complet)
vers une route non racine — y compris déjà authentifié — rebondit toujours
par `/` puis atterrit sur le dernier contexte mémorisé
(`RetourScolarite`), jamais sur la route demandée. Cause : `redirectUri`
est figé à `window.location.origin + '/'` dans
`KeycloakContext.tsx:67`, commenté comme volontaire (« les
`valid_redirect_uris` du client n'autorisent plus le joker "/*" »). Ce
comportement pré-existe à ce lot ; le mémo de session le documentait déjà
(« rebond Keycloak sur lien profond froid »). Il explique à la fois le ✘
transitoire de `navigation.spec.ts:20` (§7) et pourquoi la vérification
manuelle de la page témoin a dû utiliser une navigation côté client
(`history.pushState` + `popstate`) plutôt qu'un rechargement complet.
**Non corrigé, signalé tel quel** — hors périmètre de ce lot.

## 9. Tailles de bundle — avant / après

| Chunk | Avant (kB / gzip) | Après (kB / gzip) | Δ |
|---|---|---|---|
| `rolldown-runtime` | 0.68 / 0.41 | 0.68 / 0.41 | — |
| `tanstack-libs` | 108.18 / 30.83 | 108.18 / 30.84 | négligeable |
| `index` (applicatif) | 249.36 / 66.48 | 254.07 / 68.02 | +4.71 / +1.54 kB — code de la page témoin + `button.tsx`/`button-variants.ts` |
| `fullcalendar-libs` | 270.30 / 78.50 | 270.30 / 78.50 | — |
| `recharts-libs` | 360.02 / 104.07 | 360.02 / 104.07 | — |
| `mui-material-libs` | 396.92 / 110.26 | 396.89 / 110.11 | négligeable |
| `mui-libs` | 445.99 / 143.57 | 446.96 / 143.90 | négligeable |
| `vendor` | 520.41 / 160.22 | 555.59 / 171.67 | **+35.18 / +11.45 kB** — `@base-ui/react` (bouton seulement), `class-variance-authority`, `clsx`, `tailwind-merge` |
| **Nouveau** : `assets/index-*.css` | (aucun fichier CSS avant ce lot) | 26.94 / 5.80 kB | Tailwind + shadcn : premher CSS statique du projet |
| **Nouveau** : polices Geist (5 fichiers `.woff2`) | — | 7.42 + 8.00 + 15.08 + 16.51 + 29.40 = **76.41 kB** (non gzippés, `.woff2` déjà compressés) | posées par le preset shadcn (§5), non appliquées visuellement — le navigateur ne les télécharge que si un texte affiché les réclame réellement, ce qui n'est actuellement le cas nulle part |

Vérification demandée pour l'étape 3 : `@mui/x-data-grid` (tiré par
`@toolpad/core`, cf. `00-baseline.md` §1) — recherché dans
`dist/report.html` après build (`grep -c 'x-data-grid\|DataGrid'`) :
**zéro occurrence**. Confirmé tree-shaken, non bundlé. Même vérification
pour `lucide-react` : **zéro occurrence**, tree-shaken. La sortie de
Toolpad (étape ultérieure) ne portera donc pas ce poids caché — bonne
nouvelle actée ici, à revérifier si `@toolpad/core` monte de version d'ici
là.

## 10. Diff de versions du lockfile

Comparé `package-lock.json` avant/après (`git show HEAD:...` vs l'état
actuel) : **276 paquets ajoutés, 0 supprimé**, cohérent avec les paquets du
§1 et leurs dépendances transitives.

**13 paquets existants ont changé de version** — tous des `@babel/*`
(`code-frame`, `generator`, `helper-globals`, `helper-module-imports`,
`helper-module-transforms`, `helper-plugin-utils`, `helper-string-parser`,
`helper-validator-identifier`, `helper-validator-option`, `parser`,
`template`, `traverse`, `types`), tous des montées de patch/mineure dans
leur plage `^7.x` déjà déclarée (ex. `7.29.0` → `7.29.7`). **Isolé et
confirmé non imputable à ce lot** : un `npm install` sur le
`package.json`/`package-lock.json` **non modifiés** (contrôle du §7, avant
`git stash pop`) a produit exactement le même message (« changed 13
packages ») avec le même compte — c'est donc une dérive du registre npm
(nouveaux patches publiés dans la plage déjà autorisée) déclenchée par
*tout* `npm install`, pas une conséquence de nos ajouts.

## 11. Ce qui n'a pas été traité

- Les 4 échecs e2e de la baseline (§7) : non corrigés, hors périmètre.
- L'écart de reproductibilité de la suite e2e par rapport à la baseline de
  l'étape 0 (§7) : signalé, pas résolu — ne concerne pas la plomberie CSS.
- Le rebond Keycloak sur lien profond froid (§8) : signalé, pas corrigé,
  pré-existant.
- `npm audit` : toujours 12 vulnérabilités (1 low, 4 moderate, 7 high),
  identique à l'étape 0 — aucune nouvelle vulnérabilité introduite par les
  paquets ajoutés ici.
- Choix du preset shadcn (« Nova ») et de la bibliothèque de primitives
  (Base UI) : pris par défaut/recommandation CLI, pas challengés — à
  revoir explicitement si une décision de design system doit trancher plus
  tard.
- Mode sombre : non touché, comme demandé — le CSS shadcn (`.dark { ... }`)
  est posé mais dormant, rien ne pose la classe `.dark`.
