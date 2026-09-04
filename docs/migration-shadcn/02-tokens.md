# Étape 2 — tokens de design et source unique du mode sombre

But de ce lot : dériver les tokens shadcn de la palette MUI v7 par défaut
(dans les deux modes), et faire piloter la classe `.dark` de Tailwind par la
résolution de mode déjà en place côté MUI. Périmètre :
`front/src/index.css`, `front/src/layouts/dashboard.tsx`,
`front/src/pages/_cohabitation/`. Aucun composant MUI remplacé, aucun écran
métier retouché — le but est que shadcn et MUI **se ressemblent**, pas que
MUI disparaisse.

## Constaté avant toute écriture

- `layouts/dashboard.tsx` fait `createTheme({ palette: { mode } })` **sans
  aucune personnalisation** — vérifié : c'est le seul appel à `createTheme`
  du projet (`grep -rn "createTheme("`  ne renvoie que les deux lignes de ce
  fichier). La cible est donc la palette par défaut de MUI, lue directement
  dans `node_modules/@mui/material` plutôt que citée de mémoire :
  `styles/createPalette.js` (structure, `getContrastText`), `colors/blue.js`,
  `colors/purple.js`, `colors/red.js`, `colors/grey.js`,
  `colors/common.js` (valeurs), `OutlinedInput/OutlinedInput.js` (couleur de
  bordure des champs), `system/colorManipulator/colorManipulator.js`
  (formule exacte de `getContrastRatio`, pour choisir le texte de contraste
  comme MUI le fait réellement).
- `shadcn init` avait posé une palette neutre (`--primary: oklch(0.205 0 0)`,
  `--chart-*` tous achromatiques) — rien de dérivé du thème de
  l'application.
- Le preset « Nova » avait posé `@fontsource-variable/geist` : 76,41 kB de
  `.woff2` dans `dist/`, jamais appliqués visuellement (MUI impose Roboto
  depuis la couche `mui`, qui gagne sur `@layer base`).
- `useColorScheme()` (MUI) et `useMediaQuery('(prefers-color-scheme: dark)')`
  résolvent déjà `light`/`dark`/`system` → thème MUI concret, dans
  `layouts/dashboard.tsx`. Tailwind attend une classe `.dark` sur `<html>`
  (`@custom-variant dark (&:is(.dark *))`, `index.css`) que personne ne
  posait.

## 1. Table de correspondance des tokens

Toutes les valeurs OKLCH ont été calculées par script (conversion sRGB →
OKLab → OKLCH, formules de Björn Ottosson), pas estimées à l'œil — le script
est conservé dans l'historique de travail. Format : `oklch(L C H)`, ou
`oklch(L C H / A%)` quand MUI utilise lui-même une couleur translucide
(texte, bordures) plutôt qu'une teinte plate.

### Couleurs neutres et de surface

| Token shadcn | Chemin MUI | Valeur source | OKLCH clair | OKLCH sombre |
|---|---|---|---|---|
| `--background` | `palette.background.default` | `#fff` / `#121212` | `oklch(1 0 0)` | `oklch(0.1822 0 0)` |
| `--foreground` | `palette.text.primary` | `rgba(0,0,0,.87)` / `#fff` | `oklch(0 0 0 / 87%)` | `oklch(1 0 0)` |
| `--card`, `--popover` | `palette.background.paper` (élévation 0, sans overlay) | `#fff` / `#121212` | `oklch(1 0 0)` | `oklch(0.1822 0 0)` |
| `--card-foreground`, `--popover-foreground` | `palette.text.primary` | idem `--foreground` | `oklch(0 0 0 / 87%)` | `oklch(1 0 0)` |
| `--border` | `palette.divider` | `rgba(0,0,0,.12)` / `rgba(255,255,255,.12)` | `oklch(0 0 0 / 12%)` | `oklch(1 0 0 / 12%)` |
| `--input` | Bordure par défaut de `OutlinedInput` (`OutlinedInput.js:50`) — **pas** `divider** : MUI distingue déjà la bordure générique de la bordure de champ | `rgba(0,0,0,.23)` / `rgba(255,255,255,.23)` | `oklch(0 0 0 / 23%)` | `oklch(1 0 0 / 23%)` |

`background.paper` est identique à `background.default` dans le thème par
défaut, dans les deux modes — MUI ne les distingue qu'au travers de
l'overlay d'élévation (`Paper` avec `elevation > 0`), qui n'a pas
d'équivalent statique dans un jeu de tokens fixes. `--card`/`--popover`
reprennent donc la même valeur que `--background`, cohérent avec ce que
`shadcn init` avait déjà posé par défaut en clair (`--card` = `--background`).

### Couleurs d'accent

| Token shadcn | Chemin MUI | Valeur source | OKLCH clair | OKLCH sombre |
|---|---|---|---|---|
| `--primary` | `palette.primary.main` | `blue[700]` `#1976d2` / `blue[200]` `#90caf9` | `oklch(0.5645 0.1633 253.271)` | `oklch(0.8163 0.0896 243.619)` |
| `--primary-foreground` | `getContrastText(primary.main)` | blanc / `rgba(0,0,0,.87)` | `oklch(1 0 0)` | `oklch(0 0 0 / 87%)` |
| `--secondary` | `palette.secondary.main` | `purple[500]` `#9c27b0` / `purple[200]` `#ce93d8` | `oklch(0.5168 0.2151 321.239)` | `oklch(0.7437 0.1161 321.550)` |
| `--secondary-foreground` | `getContrastText(secondary.main)` | blanc / `rgba(0,0,0,.87)` | `oklch(1 0 0)` | `oklch(0 0 0 / 87%)` |
| `--destructive` | `palette.error.main` | `red[700]` `#d32f2f` / `red[500]` `#f44336` | `oklch(0.5680 0.2002 26.406)` | `oklch(0.6427 0.2153 28.806)` |
| `--ring` | `palette.primary.main` (identique à `--primary`) | idem `--primary` | `oklch(0.5645 0.1633 253.271)` | `oklch(0.8163 0.0896 243.619)` |

`getContrastText` a été vérifiée avec la formule exacte de MUI
(`getContrastRatio`, seuil `contrastThreshold: 3`, comparaison avec
`dark.text.primary` = blanc) plutôt que devinée : `#1976d2` et `#9c27b0`
contre blanc dépassent 3:1 (4.60 et 6.30) → texte blanc ; `#90caf9` et
`#ce93d8` n'atteignent pas 3:1 (1.75 et 2.39) → texte sombre
(`rgba(0,0,0,.87)`, la valeur `light.text.primary` que MUI utilise lui-même
comme repli).

`--ring` n'a pas de pendant MUI nommé « anneau de focus » : MUI colore la
bordure des champs en `primary.main` au focus (`OutlinedInput.js`) et les
boutons/composants shadcn utilisent déjà `--ring` de la même façon
(`focus-visible:ring-ring/50`, vu dans `button-variants.ts`). Reprendre
`--primary` est donc une équivalence directe de comportement, pas une valeur
inventée.

**Pas de `--destructive-foreground` ajouté.** Le bouton shadcn installé
(`button-variants.ts`) n'en a pas besoin : sa variante `destructive` utilise
un fond teinté à 10 % (`bg-destructive/10 text-destructive`), jamais un
aplat avec texte blanc — cohérent avec ce que `shadcn init` avait posé.
Si un futur composant shadcn en a besoin, la valeur à poser serait blanc
(clair) / `rgba(0,0,0,.87)` (sombre), par le même calcul de contraste que
primary/secondary (`red[700]` contre blanc = 4.98:1 ≥ 3 → blanc).

### `--muted` et `--accent` — jugement, pas équivalence directe

**Aucun pendant MUI évident.** MUI n'a pas de couleur de palette nommée pour
une surface « en retrait » ; le plus proche est `palette.action.hover`
(overlay `rgba(0,0,0,.04)` clair / `rgba(255,255,255,.08)` sombre) —
appliqué par MUI comme une superposition translucide, jamais comme un aplat.

Choix fait : composer cet overlay sur `background.default` et figer le
résultat en aplat (les tokens shadcn `--muted`/`--accent` sont consommés
comme des couleurs de fond directes, pas des superpositions — un aplat est
donc plus sûr qu'une valeur translucide qui se recomposerait différemment
selon ce qu'il y a derrière).

| Calcul | Résultat hex | OKLCH |
|---|---|---|
| Clair : blanc composé avec noir 4 % (`action.hover` clair) | `#f5f5f5` | `oklch(0.9696 0 0)` |
| Sombre : `#121212` composé avec blanc 8 % (`action.hover` sombre) | `#252525` | `oklch(0.2643 0 0)` |

`--muted` et `--accent` reçoivent la **même** valeur — cohérent avec ce que
`shadcn init` avait déjà posé par défaut (les deux étaient égaux dès
l'origine, `oklch(0.97 0 0)` en clair). `--muted-foreground`/
`--accent-foreground` reprennent `palette.text.secondary`
(`rgba(0,0,0,.6)` / `rgba(255,255,255,.7)`) : un texte moins appuyé pour une
surface moins appuyée, même logique que `--foreground`/`--background`.

**À trancher explicitement si besoin, pas fait ici** : cette composition
suppose que `--muted`/`--accent` s'affichent sur `--background` — vrai
partout où ces tokens sont consommés aujourd'hui (nulle part encore hors de
la page témoin), à revérifier le jour où un composant les pose sur une
surface déjà `--card`/`--popover`.

### `--secondary` : une divergence de convention à connaître

Le nom `--secondary` de shadcn et `secondary` de MUI coïncident, mais pas
forcément leur rôle visuel : dans un thème shadcn par défaut, le bouton
`variant="secondary"` est en général une couleur neutre/grise (bouton à
faible emphase), alors que `theme.palette.secondary` de MUI est un véritable
accent (violet, ici). Ce lot a choisi la correspondance **directe par nom**
(`--secondary` = `secondary.main` de MUI) plutôt que de réinterpréter
« secondary » comme une nuance neutre : c'est ce qui fait qu'un bouton
`variant="secondary"` shadcn et un `<Button color="secondary">` MUI se
ressemblent réellement (le but explicite de ce lot), au prix d'un bouton
shadcn « secondary » plus coloré que la convention shadcn habituelle. Vérifié
à l'écran (§4) : `shadcn — secondary` et `MUI — secondary` sont bien du même
violet, dans les deux modes.

## 2. Tokens de graphique (`--chart-1` à `--chart-5`)

`pages/note/NoteChartModal.tsx` code ses couleurs en dur :
`#1976d2` (lignes/barres), `#d32f2f` (lignes de référence), `#9c27b0`
(nuage de points) — exactement `primary.main`, `error.main` et
`secondary.main` de MUI en clair. Alignement des cinq tokens sur ces trois
teintes et leurs déclinaisons `.dark` (MUI) — cinq teintes distinctes,
toutes traçables :

| Token | Rôle | Chemin MUI |
|---|---|---|
| `--chart-1` | `primary.main` | ligne/barre principale |
| `--chart-2` | `error.main` (= `--destructive`) | ligne de référence |
| `--chart-3` | `secondary.main` | nuage de points |
| `--chart-4` | `primary.dark` | déclinaison bleue plus soutenue |
| `--chart-5` | `secondary.dark` | déclinaison violette plus soutenue |

`--chart-4`/`--chart-5` reprennent la déclinaison `.dark` de chaque couleur
(dans les DEUX modes de couleur de l'app, pas seulement en dark mode) :
`primary.dark`/`secondary.dark` de MUI restent des teintes plus soutenues
que `.main`, utilisables comme cinquième et sixième teinte d'un dégradé
catégoriel sans sortir de la palette MUI existante. `rgba(25, 118, 210, 0.1)`
(curseur du graphique) n'a pas de token dédié : ce n'est pas une des cinq
teintes catégorielles, c'est `primary` à 10 % — `--primary/10` suffirait si
`NoteChartModal.tsx` migrait.

**`NoteChartModal.tsx` non modifié**, comme demandé : ses couleurs restent
en dur, donc **ne suivront pas le mode sombre** tant que ce fichier n'aura
pas été migré pour consommer `--chart-*` (`hsl(var(--chart-1))`, ou
directement le token via Tailwind) à la place des littéraux hexadécimaux —
signalé ici, pas corrigé.

## 3. Typographie — Roboto plutôt que Geist

**Option retenue : aligner `--font-sans` sur la pile MUI**
(`'Roboto', 'Helvetica', 'Arial', sans-serif` — valeur exacte lue dans
`node_modules/@mui/material/styles/createTypography.js`,
`defaultFontFamily`) et désinstaller `@fontsource-variable/geist`.

Alternative écartée : garder Geist comme cible de design, en assumant un
changement de police visible en fin de migration. Écartée par défaut de la
commande (« ce lot ne doit rien changer visuellement ») et parce que rien
n'utilise Geist aujourd'hui — le corps de page hérite de `font-family` posé
par MUI/`CssBaseline` sur `body` (couche `mui`, priorité supérieure à
`@layer base` où vit `html { @apply font-sans; }`), donc Geist n'était déjà
visible nulle part avant ce lot ; le garder n'aurait fait que retarder
l'aveu que c'est du poids mort.

**Vérifié, pas supposé** : après `npm uninstall @fontsource-variable/geist`
et retrait de `@import "@fontsource-variable/geist";` +
`--font-sans: 'Geist Variable', ...` de `index.css`, `dist/assets/` ne
contient plus aucun `.woff2` (`ls dist/assets | grep -i woff` → rien).
`npm uninstall` : 1 paquet supprimé, aucun changement de version sur le
reste du lockfile (diff avant/après vérifié).

`shadcn` reste en `dependencies` (`package.json`) : `index.css` importe
toujours `shadcn/tailwind.css`, la condition posée par l'étape 1 pour
laisser ce paquet en dépendance de build reste vraie.

## 4. Source unique du mode sombre

**MUI reste la source de vérité**, comme demandé — l'inversion se fera à la
sortie de Toolpad. `layouts/dashboard.tsx` calculait déjà `estSombre`
(implicitement, dans le ternaire qui choisissait `darkTheme`/`lightTheme`) ;
extrait en variable nommée, puis un seul effet la synchronise vers la classe
`.dark` de `<html>` :

```tsx
const estSombre = (mode == undefined || mode == 'system') ? systemeSombre : mode === 'dark';
const theme: Theme = estSombre ? darkTheme : lightTheme;

useEffect(() => {
  document.documentElement.classList.toggle('dark', estSombre);
}, [estSombre]);

if (loading) { ... }   // returns anticipés
if (!session) { ... }
```

**Piège vérifié à l'écran, pas seulement lu dans le code** : l'effet est posé
avant les deux `return` anticipés (`loading`, `!session`) — obligatoire,
les Hooks React doivent s'exécuter dans le même ordre à chaque rendu, quel
que soit le chemin de sortie. Sans ce placement, l'écran de chargement et
l'écran de connexion resteraient toujours clairs. Aucune re-résolution
`system` → clair/sombre dupliquée ailleurs : Tailwind/shadcn n'ont que la
classe `.dark`, jamais leur propre lecture de `prefers-color-scheme`.

## 5. Fichiers volontairement non touchés (§e)

Trois fichiers stylent `material-react-table` via `theme.palette` +
`darken()`/`alpha()`, tous pilotés par MUI, non par les tokens shadcn — ils
restent tels quels dans ce lot :

- `services/crud/List.tsx` — `mrtTheme` (fond de table) et
  `muiTableBodyRowProps` (surbrillance de ligne, `alpha(primary.main, …)`).
- `pages/structure/GroupeUserPage.tsx` — `mrtTheme`, même motif
  `darken(background.default, 0.05)`.
- `pages/jury/JuryPeriode.tsx` — `TABLE_THEME`, même motif.

Les trois recensés comme point de convergence pour l'étape « tables » de la
migration (quand material-react-table sera remplacé ou reskiné) : ils
répètent le même calcul (`darken(background.default, 0.05)` en sombre), un
candidat naturel pour un futur token `--table-header-background` ou
équivalent — pas introduit ici, hors périmètre.

## 6. Vérification manuelle — page témoin étendue

Trois points ajoutés à `/_cohabitation` (Playwright MCP, compte `test-e2e`,
build conteneurs `https://10.20.2.5:9021`), vérifiés à l'écran dans les deux
modes — pas seulement en test, comme demandé (l'étape 1 avait montré qu'une
casse globale peut être invisible à la suite e2e) :

5. **Basculement clair/sombre** — un bouton MUI appelle
   `setMode(mode === 'dark' ? 'light' : 'dark')` (`useColorScheme`, la même
   source que `dashboard.tsx`). Vérifié : `document.documentElement.className`
   passe à `"dark"` au clic, et l'ENSEMBLE de la page — chrome Toolpad,
   composants MUI, blocs Tailwind — bascule dans le même geste, sans
   décalage entre les deux systèmes.
6. **Bouton shadcn et bouton MUI côte à côte, avec les nouveaux tokens** —
   `shadcn — défaut` / `MUI — primary` : même bleu, dans les deux modes.
   `shadcn — secondary` / `MUI — secondary` : même violet. `shadcn —
   destructive` / `MUI — error` diffèrent de *style* (shadcn : fond teinté
   10 % + texte rouge ; MUI contained : aplat rouge + texte blanc) mais pas
   de *teinte* — différence de convention shadcn (§1), pas un défaut de
   token.
7. **Contraste texte/fond** — les six pastilles du point 6
   (primary/secondary/muted/accent/destructive/card) restent lisibles dans
   les deux modes ; vérifié à l'écran après bascule, aucune paire
   fond/texte proche de l'illisible.

**Vérification sur un écran réel, pas seulement la page témoin** — leçon de
l'étape 1 : navigation vers `/catalog_context/formation` (Structure) avec
`.dark` actif. Rendu identique au thème sombre MUI habituel (aucune classe
Tailwind sur cet écran, donc `.dark` n'y a aucune prise) ; en clair, rendu
identique à l'avant-lot (capture comparée à celle de `01-cohabitation.md`).
Aucune régression visuelle détectée sur un écran métier.

## 7. Lint / build / e2e

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` | ✅ succès |
| `make test-ihm`, run 1 | ✅ 31 passed / 0 failed |
| `make test-ihm`, run 2 | ✅ 31 passed / 0 failed |

## 8. Tailles de bundle — avant / après

| Chunk | Étape 1 (kB / gzip) | Étape 2 (kB / gzip) | Δ |
|---|---|---|---|
| `rolldown-runtime` | 0.68 / 0.41 | 0.68 / 0.41 | — |
| `tanstack-libs` | 108.18 / 30.84 | 108.18 / 30.84 | — |
| `index` (applicatif) | 254.07 / 68.02 | 256.56 / 68.69 | +2.49 / +0.67 kB — sections 5-7 de la page témoin |
| `fullcalendar-libs` | 270.30 / 78.50 | 270.30 / 78.50 | — |
| `recharts-libs` | 360.02 / 104.07 | 360.02 / 104.07 | — |
| `mui-material-libs` | 396.89 / 110.11 | 396.89 / 110.11 | — |
| `mui-libs` | 446.96 / 143.90 | 446.96 / 143.90 | — |
| `vendor` | 555.59 / 171.67 | 555.59 / 171.67 | — |
| `assets/index-*.css` | 26.94 / 5.80 | 25.84 / 5.58 | **−1.10 / −0.22 kB** — retrait des `@font-face` Geist |
| Polices `.woff2` (Geist) | 76.41 kB (5 fichiers) | **0** | **−76.41 kB**, vérifié (`ls dist/assets \| grep woff` → rien) |

Gain net : environ −75 kB transférables en moins pour un premier
chargement où la police n'était de toute façon jamais rendue (§3).

## 9. Ce qui n'a pas été traité

- `NoteChartModal.tsx` : couleurs toujours en dur, ne suit pas le mode
  sombre — signalé (§2), migration remise à l'étape où ce fichier sera
  touché.
- Les trois consommateurs de `material-react-table` (§5) : toujours pilotés
  par `theme.palette` MUI, pas par les tokens shadcn — recensés, non migrés.
- Tokens `--sidebar*` : laissés à leur valeur shadcn par défaut
  (achromatique), non dérivés de MUI — rien ne les consomme aujourd'hui
  (Toolpad possède son propre sidebar), même statut que Geist avant ce lot :
  posés par le preset, inertes.
- `--destructive-foreground` : non ajouté, absent du preset shadcn actuel
  et non requis par le bouton installé (§1).
- Composition `--muted`/`--accent` sur une surface autre que `--background`
  (ex. `--card`) : non vérifiée, aucun consommateur aujourd'hui (§1).
- Aucun composant MUI remplacé, aucun écran métier retouché — conforme au
  périmètre du lot.
