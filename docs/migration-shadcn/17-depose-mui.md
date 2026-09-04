# Étape 17 — la dépose de MUI

Cinq fichiers importaient encore `@mui/material` ; aucun n'était un écran.
Deux étaient de l'application ordinaire (`services/ChampDate.tsx`, la page
témoin), trois portaient l'infrastructure de cohabitation — les providers,
la couche CSS `mui`, la source du mode sombre. Le lot les retire dans
l'ordre imposé (le champ, puis la source de mode, puis la couche, puis les
providers, puis la page témoin, puis les paquets), un commit par étape, la
suite verte entre chaque. Il ferme la migration ; le §12 en fait le bilan.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire est exact** : quatorze imports `@mui/*` dans cinq
  fichiers (`main.tsx` 2, `App.tsx` 3, `layouts/dashboard.tsx` 6,
  `services/ChampDate.tsx` 5 dont deux types, `pages/_cohabitation/` 5),
  la couche `mui` d'`index.css`, `composantsTraduits` sans consommateur.
  `vite.config.ts` portait aussi deux règles `manualChunks` (`mui-libs`,
  `mui-material-libs`) hors de l'inventaire — retirées au §7.
- **Aucun écran n'offre de bascule de mode.** `setMode` de `useColorScheme`
  n'avait qu'un appelant : la page témoin. La clé `mui-mode` (`localStorage`)
  n'a donc jamais été écrite que par elle, ou à la main. C'est ce qui rend
  la décision du §3 sans risque.
- **Ce que `CssBaseline` posait, relevé au navigateur avant la dépose**
  (`getComputedStyle(document.body)`, build du lot 16) : `Roboto`, 16 px,
  400, interligne 24 px, **interlettrage 0,15008 px** (`0.00938em`, le
  `body1` de MUI), texte `rgba(0,0,0,.87)`, fond blanc, `margin 0`,
  `box-sizing border-box`, `-webkit-font-smoothing: antialiased`,
  `-webkit-text-size-adjust: 100%`, `color-scheme: light`, `strong` 700. Le
  préflight Tailwind couvre tout sauf trois règles : le lissage, l'interlettrage,
  et `color-scheme` — et ce dernier, `CssBaseline` le posait par media query,
  pas par le choix (c'est le défaut des lots 7, 8, 10).
- **`document.styleSheets` avant la dépose** : `[0]` le `GlobalStyles`
  (`@layer theme, base, mui, components, utilities`), `[1]`–`[2]` les deux
  feuilles Emotion en couche `mui` (CssBaseline, variables `--mui-*`), `[3]`
  FullCalendar hors couche, `[4]` `index.css`, `[5]` sonner. L'invariant 11
  tenait ; c'est de ce relevé que part la vérification du §4.
- **`useMediaQuery` de MUI est un `useSyncExternalStore` sur `matchMedia`**
  (lu dans `@mui/system/useMediaQuery/useMediaQuery.js`) ; `useColorScheme`
  lit `localStorage` à l'initialisation et s'abonne à `storage` pour suivre
  les autres onglets (`useCurrentColorScheme.js`). Le remplaçant (§3)
  reproduit ces deux propriétés.
- **`autocomplete.fermer`** (fr/en) n'avait plus de consommateur : le
  `Combobox` shadcn nomme son déclencheur « Ouvrir la liste » dans les deux
  états ; `ouvrir`, `effacer`, `retirer`, `aucuneOption` restent consommés
  par `ui/combobox.tsx`. Clé retirée avec `composantsTraduits`.
- Référence bundle figée avant-lot : build du commit bdd3016 (HEAD du lot
  16), mêmes `node_modules`, `vite build` mode production, rapport
  visualizer conservé ; tailles par paquet agrégées depuis le JSON du
  rapport (`renderedLength` par module, regroupé par paquet npm).

## 2. `ChampDate` — la dernière brique applicative

Le lot 13 avait signalé l'écart : un `TextField` MUI au milieu de champs
shadcn. Le champ rejoint le **contrat des champs partagés** : `name`,
`control`, `label`, `disabled`, `className`, `aide` — `useController` dans
le composant, plus d'`error`/`helperText`/`fullWidth`/`sx` recopiés par
l'écran, plus de `Controller` autour. Les cinq écrans (Promotion, Période,
TOEIC, Mobilité, ReservationDialog) passent chacun de 15 lignes à une.

| Avant | Après |
|---|---|
| `TextField` MUI + `InputAdornment` + `IconButton` (libellé flottant, 56 px) | `Field` + `FieldLabel htmlFor` + `InputGroup` (`InputGroupInput` + `InputGroupAddon inline-end` + `InputGroupButton icon-xs` en `PopoverTrigger`), 32 px — le gabarit de `ChampTexte` et du `Combobox` |
| `conteneurPopup` (piège à focus de la modale MUI, lot 12) | retiré : la modale Base UI reconnaît ses popups, plus aucun appelant depuis le lot 14 |
| `ChampDateHeure` : `value`/`onChange` + `TextField type="time"` | même contrat `name`/`control` ; date par `SaisieDate` (le contrôle interne, partagé), heure par `Input type="time"` sous son propre `FieldLabel` « Heure » |
| l'`<input>` sans `name` (introuvable par `focus.ts`, joignable par `aria-invalid` seulement) | l'`<input>` porte `name` et la `ref` de react-hook-form : `premierChampEnErreur` le trouve par le nom |

**Les deux gardes du lot 12 survivent**, dans `normaliser` et le
`value == null` de `SaisieDate` : `undefined` (création) → champ vide,
chaîne ISO (édition) → `new Date(chaîne)`. Vérifiées au navigateur sur les
cinq écrans (§8) : création vide, édition formatée, consultation désactivée.
`normaliser` accepte `unknown` (la valeur de `useController` n'est pas
typée) et rend un `Date` invalide pour tout ce qui n'est ni `Date`, ni
chaîne, ni nombre — le schéma zod le refuse comme avant.

**Zéro sélecteur e2e touché** : aucune spec ne remplit un champ de date
(`certification.spec.ts` teste l'état vide), et le nom accessible reste un
`<label for>`.

## 3. L'inversion de la source du mode sombre

`services/modeCouleur.ts`, `useModeCouleur()` — 90 lignes, deux magasins
externes lus par `useSyncExternalStore` :

- la préférence enregistrée (`localStorage`), abonnée à `storage` (autre
  onglet) et aux écritures de `setMode` du même onglet ;
- la préférence système, **abonnée** à `matchMedia('(prefers-color-scheme:
  dark)')` — la propriété que le commentaire de `dashboard.tsx` défendait
  (lire `matchMedia` au rendu ne marchait que grâce à l'abonnement d'un
  voisin) est reproduite, pas perdue.

`estSombre = mode === 'system' ? systemeSombre : mode === 'dark'` ;
`dashboard.tsx` pose `.dark` comme avant, avant les `return` anticipés.
Commit dédié (01317c3), MUI encore en place et suivant `estSombre` : la
suite verte entre les deux, comme demandé.

**La clé de persistance reste `mui-mode`.** Choix explicite, pas un oubli :
la renommer aurait déconnecté toute préférence enregistrée sans autre
bénéfice qu'un nom plus juste, et — constaté au §1 — rien dans
l'application n'écrit cette clé aujourd'hui. Le renommage attend le premier
consommateur de `setMode` (une bascule dans le menu de compte), avec une
ligne de reprise de l'ancienne valeur. Aucune préférence n'est donc
déconnectée ; l'arrêt prévu par la commande n'a pas eu lieu d'être.

Vérifié au navigateur (§8) : système clair/sombre suivi **à chaud** sans
rechargement (`emulateMedia`), choix persistant après rechargement,
bascule par la page témoin, **un second onglet qui change la clé fait
basculer le premier**. Et le cas « sombre choisi + OS clair », mesuré avant
et après la dépose : voir §5.

## 4. Le `GlobalStyles` et la couche `mui` — la course disparaît par construction

`StyledEngineProvider enableCssLayer`, le `<GlobalStyles>` de `main.tsx` et
la ligne `@layer theme, base, mui, components, utilities;` d'`index.css`
partent dans le même commit (2 fichiers, −35 lignes). Sans Emotion, il n'y
a plus de feuille injectée en synchrone au premier rendu, donc plus de
course avec le chargement réseau d'`index.css`, donc plus rien à gagner.

**Vérifié dans `document.styleSheets`, pas à l'œil** (build de l'étape,
`index-DBQdJh9k.js`) : plus de déclaration de couches en première feuille ;
`index.css` porte, dans cet ordre, `properties, theme, base, components,
utilities` — l'ordre que Tailwind déclare lui-même ; les deux feuilles
Emotion restantes (CssBaseline, variables) sont **hors couche, en fin de
liste** — elles battent tout, ce qui pour les règles du corps de page est
exactement ce que la couche `mui` faisait déjà (elle battait `base`). Corps
de page identique au relevé du §1, valeur par valeur. Sur la page témoin,
le point 2 (« utilitaire Tailwind sur un bouton MUI ») **perd désormais par
construction** : le rose Tailwind cède au bleu MUI hors couche. C'est le
constat attendu — la cohabitation est finie, et le seul composant MUI
encore rendu dans l'application entre cette étape et la suivante
(`LinearProgress`) ne porte aucune classe Tailwind.

**L'invariant 11 change de nature.** Il ne gèle plus un ordre de couches
fragile ; il interdit de réintroduire un moteur qui injecte du CSS hors
couche à l'exécution, et documente la seule exception (FullCalendar,
pilotée par variables sur l'élément). Réécrit dans CLAUDE.md.

## 5. `App`, `dashboard` — providers, `CssBaseline`, `composantsTraduits`, `Progress`

| Avant | Après |
|---|---|
| `App.tsx` : `ThemeProvider` racine (`cssVariables`, `colorSchemes`) + `CssBaseline enableColorScheme` | rien — un commentaire dit où sont partis le mode (§3) et la remise à zéro (ci-dessous) |
| `dashboard.tsx` : `createTheme` ×2 dans un `useMemo` sur `t`, `ThemeProvider` autour du shell, `composantsTraduits` | plus de thème, plus de `useMemo`, le shell rendu dans un fragment ; `composantsTraduits` supprimé — ses trois clés : deux encore consommées par `ui/combobox.tsx`, une (`fermer`) orpheline, retirée des deux JSON |
| `LinearProgress` ×2 (`loading`, `!session`) | `Progress value={null}` Base UI, `aria-label` « Chargement… » (nouvelle clé `shell.chargement`, fr/en), une seule branche `loading || !session` |

**`Progress` indéterminé** : Base UI pose `data-indeterminate` et ne
dimensionne pas l'indicateur ; `ui/progress.tsx` lui donne un tiers de
piste et une animation (`--animate-indetermine`, keyframes dans le `@theme`
d'`index.css`). Vérifié dans le CSS servi (`@keyframes indetermine`, les
classes `data-indeterminate:*`), pas à l'écran : `App.tsx` ne monte
`Layout` qu'une fois Keycloak initialisé, si bien que la branche `loading`
de `Layout` n'est jamais rendue et la branche `!session` ne dure que le
temps de la redirection vers Keycloak — trop court pour un pilote (deux
essais, en retardant `/token` puis `/auth`). Le `LinearProgress` avait le
même sort ; ce n'est pas nouveau.

**`CssBaseline` contre le préflight** — la comparaison du §1 tranchée en
trois règles ajoutées à la couche `base` d'`index.css`, avec le
raisonnement en commentaire :

| Règle `CssBaseline` | Préflight | Décision |
|---|---|---|
| `box-sizing`, `margin: 0`, `line-height: 1.5`, `text-size-adjust`, `strong` gras | couvert | rien |
| `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale` | absent | `html { @apply antialiased }` — sans effet sous Linux/Windows (donc sur les captures), visible sur macOS |
| `letter-spacing: 0.00938em` (`body1`) | absent | **gardé** sur `body` : la typographie du corps reste celle de MUI, comme la pile Roboto du lot 2 ; l'abandonner est une décision de design (Geist, sans interlettrage) qui régénérerait toutes les captures — pas une dépose |
| `color-scheme` par media query | absent | `:root { color-scheme: light }`, `.dark { color-scheme: dark }` — par la **classe**, donc par le choix |
| `@media print { body { background: white } }`, `body::backdrop` | absent | non repris, sans consommateur (pas d'impression, pas de plein écran) |

Le corps de page après dépose est **identique au relevé du §1** (même
police, 24 px, 0,15008 px, mêmes couleurs, `antialiased`) : aucune
régression diffuse, donc pas d'arrêt à demander.

**Le ticket ouvert depuis dix lots se ferme ici.** Mesuré au navigateur,
`mui-mode=dark` + `emulateMedia light`, sur la liste des formations :

| | Étape 2 (MUI encore là) | Étape 4 (MUI parti) |
|---|---|---|
| classe `.dark` | posée | posée |
| fond du `body` | **blanc** (`--mui-palette-*` suivaient la media query) | `#121212` |
| texte du `body` | **noir 87 %** | blanc |
| `color-scheme` | `light` | `dark` |
| h6, cellules | ternes / noires | blanches |

Et le symétrique (`light` choisi + OS sombre) : tout clair, `color-scheme:
light`. Le défaut signalé aux lots 7, 8 et 10 comme « désynchronisation
entre les variables CSS MUI et le thème JS » n'avait qu'une cause — deux
sources ; il n'en reste qu'une.

## 6. La page témoin — sa dernière lecture

Utilisée trois fois dans ce lot avant de partir : à l'étape 2 (la bascule
par `setMode` du nouveau hook, `.dark` suit), à l'étape 3 (le point 2 perd,
§4), et sur le build de l'étape 4, MUI sans plus aucun provider :

| Point | Relevé |
|---|---|
| Feuilles Emotion | **une** (les styles des composants de la page eux-mêmes), zéro sur tout autre écran |
| Boutons MUI | rendus, thème par défaut **clair** quel que soit le mode : bleu `#1976d2` et violet `#9c27b0` sur fond blanc en sombre aussi — plus de `ThemeProvider` à suivre |
| Boutons et pastilles shadcn | suivent `.dark` (fond `#121212`, tokens sombres) |
| Bascule | `.dark` posée et retirée, clé écrite |

La page ne pouvait plus rien démontrer : son sujet était la cohabitation.
Supprimée avec sa route (commit dédié) ; `/_cohabitation` tombe sur la page
d'erreur par défaut de react-router, comme toute URL inconnue (voir §13).

## 7. Les dépendances et le lockfile

`npm uninstall @mui/material @emotion/react @emotion/styled` — les deux
`@emotion` étaient les dépendances de pair de MUI protégées au lot 0 ;
`npm ls` avant le retrait ne leur connaissait que `@mui/*` comme
dépendants. Lockfile : **+0 / −43 / 0 montée** — 43 entrées retirées
(`@mui/material`, `system`, `utils`, `styled-engine`, `private-theming`,
`types`, `core-downloads-tracker` ; les treize `@emotion/*` ; et leur
traîne : `@popperjs/core`, `react-transition-group`, `stylis`,
`prop-types`, `hoist-non-react-statics`, `babel-plugin-macros`,
`cosmiconfig`, `find-root`, `resolve`, `source-map`, `dom-helpers`,
`loose-envify`, `@types/prop-types`, `@types/react-transition-group`…),
**aucun paquet ajouté, aucune version changée** sur les 716 entrées qui
restent (759 avant). `package.json` : trois lignes de moins.

`vite.config.ts` perd ses deux règles `manualChunks` MUI/Toolpad (plus
aucun module ne les atteignait depuis le retrait : deux chunks vides ne se
seraient pas émis, mais la règle serait restée à lire).

`grep -rn "@mui\|@emotion" front/src front/e2e front/package.json` : **zéro
occurrence** — deux commentaires d'`index.css` qui citaient des chemins
`node_modules/@mui/...` comme source des tokens ont été reformulés (le
fichier reste nommé, le chemin non).

## 8. Vérification à l'écran — compte `test-e2e`, build reconstruit à chaque étape

Méthode des lots 12–16 : `make start-scolarite` après chaque étape, `src` du
script servi comparé à `curl` (`index-CGj7oCqQ.js` étape 1,
`index-B5bvpDF8.js` étape 2, `index-DBQdJh9k.js` étape 3, `index-Df43L1yb.js`
étape 4, `index-CsTXprxH.js` étape 5, `index-BPLv90VU.js` étape 6). Pilotage
MCP ; navigation par `pushState` avec **un détour par la liste des
formations entre deux écrans** — sans lui, l'écran reste celui de l'URL
précédente (le rendu figé documenté), et le premier relevé lisait chaque
formulaire avec un écran de retard.

| Écran / vérification | Résultat |
|---|---|
| **`ChampDate`, création** — Promotion, Période, TOEIC, Mobilité (`/new`) | champs **vides** (`value=""`), gabarit `JJ/MM/AAAA`, bouton « Choisir une date » ; heading « Ajouter » relevé pour chaque |
| **`ChampDate`, édition** — Promotion 305, Période 648, TOEIC 1, Mobilité (créée puis rouverte) | `01/09/2025`/`31/08/2026`, `01/09/2025`/`31/01/2026`, `04/09/2026`, `01/03/2026`/`30/06/2026` — la chaîne ISO de l'API formatée ; heading « Modifier » |
| **consultation** (Promotion 305) | valeurs affichées, `input` et bouton **désactivés** |
| saisie invalide `31/02/2025` + Ajouter | `aria-invalid`, message relié par `aria-describedby` (`role="alert"`), **focus sur le champ**, libellé en rouge ; `1/9/2025` + Tab → `01/09/2025`, erreur levée |
| calendrier | popup sous le champ, aligné à droite (bord droit 1092 = bord droit du champ), 35 jours, jours nommés « mardi 15 septembre 2026 » ; clic → `15/09/2026`, focus rendu au bouton |
| anglais | `09/01/2025`, `09/15/2026`, gabarit `MM/DD/YYYY`, « Choose date », « Start date » ; retour fr → `01/09/2025` |
| Annuler | garde « Modifications non enregistrées » → « Quitter sans enregistrer » → liste, rien créé |
| **`ChampDateHeure`** (planning, sélection 10 h–11 h 30 le 06/01) | « Nouvelle réservation », `debut=06/01/2026` + « Heure » `10:00`, `fin=06/01/2026` + `11:30` ; heure de fin `12:00` ; calendrier ouvert **dans la modale** (portalé, visible), jour 7 → `fin=07/01/2026` et l'heure `12:00` conservée ; Annuler, 0 réservation |
| **Mode** (étape 2) | système clair → `.dark` absent ; `emulateMedia dark` à chaud → `.dark` posée, corps `#121212` ; retour clair ; `mui-mode=dark` + rechargement → `.dark` ; page témoin → bascule, clé `light` ; **second onglet** écrit `dark` → premier onglet `.dark` ; nettoyage |
| **`document.styleSheets`** (étape 3) | §4 |
| **Corps de page** (étape 4) | §5 — identique au relevé d'avant-lot ; `strong` 700 ; zéro `style[data-emotion]` |
| **Sombre choisi + OS clair** (étape 4) | §5 — fermé |
| **Un écran par workflow, deux modes, deux langues** (étape 4) | 24 captures d'écran regardées (Structure liste et formulaire, Notes axe UE, Jury, Certifications TOEIC, Programme planning, Salle, Utilisateur, Corbeille, Registre — fr clair, fr sombre ; Structure, formulaire, Notes, Jury en anglais) : typographie, espacements, bordures, hauteurs de ligne identiques ; rien qui bouge d'un pixel visible, aucune police changée |
| **Page témoin** (étapes 2, 3, 4) | §6 ; puis `/_cohabitation` → erreur react-router, retour à la liste des formations |
| Console | 0 erreur applicative sur toute la session ; les seules erreurs réseau sont les 400/404 des identifiants périmés par les re-seeds de la suite (un `sessionStorage.clear()` les fait disparaître) et le 404 volontaire d'une mobilité inexistante |

Données : une mobilité internationale créée sur E2E Promotion pour vérifier
l'édition, supprimée en base aussitôt (avant tout run de la suite) ; aucune
réservation, aucune promotion créée (Annuler à chaque fois).

## 9. Journal des captures — une régénérée, justifiée

Premier run (`make test-ihm`, contre `index-CGj7oCqQ.js`, étape 1) : **1
échec**, `captures-ouvertes.spec.ts` « dialogue de suppression avec saisie de
confirmation » en **sombre** (815 pixels). Diff regardé avant toute
régénération : le dialogue est identique ; ce qui change est **derrière**,
le formulaire de consultation de « E2E Promo Vide » sur lequel il s'ouvre,
dont les deux champs de date sont passés du `TextField` MUI (56 px,
libellé flottant, bordure, adornement) au champ shadcn (32 px, libellé
au-dessus) — le périmètre même de l'étape 1. La variante **claire** est
passée sans régénération : sous le voile de la modale, l'écart de teinte
reste sous le seuil par pixel de Playwright. Régénération ciblée
(`-g "saisie de confirmation" --update-snapshots`) : un seul fichier
réécrit, le sombre ; regardé avant commit.

Les dix-neuf autres captures — dont les vingt de l'étape 4, celle qui
touche le style global — sont restées **byte-identiques à travers les six
runs du lot** : le retrait de `CssBaseline` n'a déplacé aucun pixel, ce que
le relevé du §5 expliquait déjà.

## 10. Bundle — par chunk et par paquet, contre l'avant-lot et contre le lot 0

Par chunk (kB minifiés / gzip, les tailles que `vite build` imprime, même
mode et mêmes `node_modules` de chaque côté) :

| Chunk | Lot 0 | Avant-lot (lot 16) | Après | Δ avant-lot | Δ lot 0 |
|---|---|---|---|---|---|
| `mui-libs` | 445.99 / 143.57 | 72.75 / 26.92 | **0** | −72.8 / −26.9 | **−446.0 / −143.6** |
| `mui-material-libs` | 396.92 / 110.26 | 139.06 / 40.03 | **0** | −139.1 / −40.0 | **−396.9 / −110.3** |
| `vendor` | 520.41 / 160.22 | 893.54 / 283.27 | 893.55 / 283.27 | 0 | **+373.1 / +123.1** |
| code applicatif (`index`) | 249.36 / 66.48 | 328.10 / 86.11 | 323.73 / 84.62 | −4.4 / −1.5 | +74.4 / +18.1 |
| `tanstack-libs` | 108.18 / 30.83 | 88.19 / 23.78 | 88.52 / 23.95 | +0.3 / +0.2 | −19.7 / −6.9 |
| `recharts-libs` | 360.02 / 104.07 | 364.31 / 105.56 | 365.41 / 105.92 | +1.1 / +0.4 | +5.4 / +1.9 |
| `fullcalendar-libs`, `rolldown-runtime` | 270.30 / 78.50, 0.68 / 0.41 | idem | idem | 0 | 0 |
| **JS total** | **2351.9 / 694.3** | 2156.9 / 644.6 | **1942.2 / 576.7** | **−214.7 / −67.9** | **−409.7 / −117.7** |
| CSS (`index-*.css`) | — (aucun) | 116.07 / 18.39 | 116.05 / 18.40 | 0 | +116.1 / +18.4 |
| **JS + CSS** | **2351.9 / 694.3** | 2273.0 / 663.0 | **2058.2 / 595.1** | −214.7 / −67.9 | **−293.6 / −99.3** (−12,5 % / −14,3 %) |

Les 139 kB de `mui-material-libs` et les 73 kB de `mui-libs` que le lot 16
annonçait tombent ici d'un bloc ; `vendor` ne bouge pas d'un octet (rien
n'y entre : le hook de mode est du code applicatif, `Progress` y était
déjà) ; `recharts`/`tanstack` bougent d'un kilo-octet par le graphe de
modules (`react-is`, que `prop-types` ne tire plus, se retrouve rangé
ailleurs). Les hachages de `fullcalendar-libs` et `rolldown-runtime` sont
identiques à l'avant-lot.

Par paquet (visualizer, tailles rendues, contre l'avant-lot — le lot 0 n'a
pas de rapport par paquet, seulement les chunks ci-dessus) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/material` | 265.4 | 0 | **−265.4** |
| `@mui/system` | 89.7 | 0 | **−89.7** |
| `@mui/utils`, `styled-engine`, `private-theming` | 23.2 + 3.6 + 1.6 | 0 | −28.4 |
| `@emotion/*` (dix modules : `cache` 8.3, `styled` 6.0, `react` 5.0, `serialize` 4.7, `is-prop-valid` 4.3, `sheet`, `utils`, `unitless`, `hash`, `use-insertion-effect…`, `memoize`) | 34.1 | 0 | **−34.1** |
| `react-transition-group`, `stylis`, `hoist-non-react-statics`, `@babel/runtime`, `react-is` (part) | 17.7 + 12.5 + 2.6 + 1.4 + 4.1 | 0 (react-is 2.2) | −38.3 |
| code applicatif | 656.1 | 651.0 | −5.1 (page témoin, `composantsTraduits`, thèmes ; +`modeCouleur`, +`SaisieDate`) |
| `recharts`, `d3-*`, `decimal.js-light` | — | — | +2.5 (rangement du graphe) |
| `@base-ui/react`, `react-dom`, `@fullcalendar/*`, `react-router`, `react-day-picker`, `zod`, `date-fns`, `@tanstack/*`… | — | — | **0** (identiques au dixième de kB) |
| **Total rendu** | 4778.3 | 4319.7 | **−458.6** ; 82 paquets → 62 |

**Vingt paquets quittent le bundle**, dont dix `@emotion/*`. Rien n'y
entre. Et le chiffre que dix-sept lots ont préparé : **−843 kB rendus de
MUI, Toolpad, MRT et Emotion depuis le lot 0** (`mui-libs` +
`mui-material-libs`), contre **+373 kB de `vendor`** — Base UI (554 kB
rendus, plus lourd que `@mui/material` ne l'était au lot 16), react-day-picker
et date-fns (249), tailwind-merge (57), sonner (53), lucide (41). Le solde
net sur le fil est de −410 kB de JS, −118 kB gzippés, plus 116 kB de CSS
statique là où il n'y en avait aucun (Emotion générait le sien à
l'exécution). En gzip, ce que l'utilisateur télécharge : **−99 kB (−14 %)**.

## 11. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep -rn "@mui\|@emotion"` sur `front/src`, `front/e2e`, `front/package.json` | ✅ **zéro occurrence** |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 à chaque étape, six fois |
| Suite e2e, un run par étape, contre le build de l'étape (hash du script servi vérifié par `curl`, conteneurs reconstruits avant chaque run) | étape 1 `make` ❌ 1 capture (§9, régénérée) puis étape 2 `npx` ✅ 63 → étape 3 `make` ✅ 63 → étape 4 `npx` ✅ 63 → étape 5 `make` ✅ 63 → **étape 6 `make` ✅ 63 (2,9 min) → `npx` ✅ 63 (2,9 min)** — deux exécutions consécutives vertes, points d'entrée alternés, contre le build final (`index-BPLv90VU.js`, sans chunk `mui-*` servi) ; `registre.spec.ts` vert sept fois |
| Sélecteurs/assertions e2e | **zéro modification — dix-septième lot consécutif** |
| Captures | une régénérée (§9, sombre, périmètre de l'étape 1) ; dix-neuf byte-identiques à travers les sept runs, dont les vingt de l'étape qui retire `CssBaseline` |
| Lockfile | **+0 / −43 / 0 montée** (§7) |
| `document.styleSheets` | trois feuilles : FullCalendar, `index.css`, sonner — plus aucun `style[data-emotion]` sur aucun écran |
| CLAUDE.md | Stack sans MUI, invariants 11 et 12 réécrits, dette `_cohabitation` et `composantsTraduits` fermées, pièges épurés de leurs mentions MUI au présent, défaut « mode ≠ OS » passé en fermé |

Commits : ChampDate → mode sombre (`useModeCouleur`) → couche `mui` +
`GlobalStyles` + `StyledEngineProvider` → App/dashboard (providers,
`CssBaseline`, `composantsTraduits`, `Progress`) → page témoin →
dépendances + `vite.config.ts` → doc + CLAUDE.md.

## 12. Bilan de la migration — dix-sept lots

**Ce que ça a coûté.** 137 commits sur la branche `shadcn`, du 25 août au 4
septembre 2026 ; 140 fichiers de `front/src` touchés (+9 531 / −4 024
lignes), dont 32 composants générés dans `components/ui/` (3 326 lignes,
relues et parfois corrigées : `||`→`??`, `useContext`→`use`, variantes
sorties dans des `*-variants.ts`) ; 34 fichiers dans `front/e2e/` (la suite
est passée de 31 tests à 63 pendant la migration, captures comprises — la
suite est un produit de la migration autant qu'un filet) ; 21 documents
dans `docs/migration-shadcn/`. `package.json` : 31 dépendances au lot 0, 32
aujourd'hui — **11 sorties** (`@mui/material`, `icons-material`,
`x-data-grid`, `x-date-pickers`, `x-tree-view`, `@toolpad/core`,
`material-react-table`, `ag-grid` ×2, `@emotion` ×2), **12 entrées**
(`@base-ui/react`, `tailwindcss`, `@tailwindcss/vite`, `shadcn`,
`tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react`, `react-day-picker`, `@tanstack/react-table`, `sonner`).
Lockfile : 604 entrées → 716 (l'outillage Tailwind et la CLI shadcn en
portent la plus grande part). Poids : §10.

**Ce que ça a rapporté.** Un seul système de composants et une seule
feuille de style, sans moteur d'injection ni ordre de couches à défendre ;
un contrat de champs de formulaire (`Champ*`, six composants, une
signature stable depuis le lot 13) qui a survécu à vingt-six écrans ; un
socle de table unique (`DataTable`) là où il y avait MRT, ag-grid et
`x-data-grid` ; une suite e2e reproductible (lot 1bis) et un filet de
captures (lot 2bis) ; quatorze défauts trouvés au navigateur et corrigés en
passant, dont deux qui perdaient des données de saisie (lot 7 salle, lot 15
nom vide) ; et la fermeture de ce lot : le mode sombre à source unique, le
défaut « choix ≠ OS » de dix lots, une remise à zéro du corps de page
lisible en huit lignes de CSS.

**Ce qui a marché.** La cohabitation par couches CSS (lot 1) a tenu seize
lots sans une régression de style globale — après la course du premier
jour ; les tokens dérivés de la palette MUI (lot 2) ont rendu chaque
remplacement comparable à l'œil et aux captures ; l'ordre « socle, puis
écrans, puis dépose » et le critère « zéro sélecteur modifié » (dix-sept
lots consécutifs) ; les commits par étape avec la suite entre chaque, qui
ont rendu ce lot — le plus risqué sur le papier — sans surprise ; et la
règle de vérifier au navigateur ce que la suite ne voit pas, qui a produit
quatorze corrections et, ici, la preuve dans `document.styleSheets` plutôt
qu'à l'œil.

**Ce qui a été sous-estimé.** Le poids de Base UI : présenté comme
« quelques petits fichiers » au lot 1, il pèse 554 kB rendus à l'arrivée —
plus que `@mui/material` au moment de sa dépose ; le gain net vient de
MUI, pas de Base UI qui se rentabiliserait (déjà dit au lot 16, confirmé).
La suite e2e elle-même : instable au lot 1, il a fallu un lot entier
(1bis) pour la rendre reproductible avant de pouvoir s'y fier. Les
« petits » composants shadcn générés, qui ont demandé une relecture chaque
fois (lint, React 19, `GroupLabel` hors `Group` qui plantait un écran
entier avec 45 tests verts). Et le nombre de choses invisibles des tests :
les captures ont attrapé ce que 63 tests de rôles ne voyaient pas, et le
navigateur ce que les captures ne voyaient pas (focus, popups, désync de
mode).

**Ce qui reste ouvert.** La typographie (Roboto et interlettrage MUI,
assumés) et la bascule de mode (aucun consommateur de `setMode`) — deux
décisions de design ; les versions épinglées à rouvrir ; les cinq défauts
constatés hors périmètre de CLAUDE.md (`UpdateToeic`, colonne « Rôles »,
message zod, `axes.ts` en français, `registre.spec.ts`) et les deux
défauts structurels (rendu figé de `BarreAxes`, rebond Keycloak) que la
migration a subis à chaque lot sans les toucher ; l'absence d'intégration
continue, qui laisse tout ce filet à la discipline de qui lance
`make test-ihm`.

## 13. Ce qui n'a pas été traité

- **Typographie** : Roboto et l'interlettrage `body1` de MUI restent la
  typographie du corps (§5). Choisir Geist ou une autre pile est une
  décision de design à prendre à part, avec régénération de toutes les
  captures.
- **Bascule de mode** : `setMode` n'a plus de consommateur ; une entrée
  dans le menu de compte est le lot naturel — et le moment de renommer la
  clé `mui-mode` avec reprise de l'ancienne valeur.
- **La page d'erreur par défaut de react-router** (« Unexpected Application
  Error! 404 Not Found 💿 Hey developer 👋… ») est ce que voit un utilisateur
  sur toute URL inconnue — constaté en vérifiant la disparition de
  `/_cohabitation`. Pré-existant, hors périmètre ; un `errorElement` sur la
  route racine y remédierait.
- **`Progress` indéterminé jamais rendu** (§5) : la branche `loading` de
  `Layout` est morte depuis qu'`App.tsx` conditionne `Outlet` à `!loading`
  — à nettoyer ou à réunir, hors périmètre.
- **Versions épinglées** (`react-day-picker` 9.14.0, `@tanstack/react-table`
  8.20.6) : la promesse « zéro montée parasite » est tenue jusqu'au bout ;
  à rouvrir dans un lot de mise à jour, avec `npm audit`.
- Hors périmètre, intacts : rendu figé de `BarreAxes` (subi trois fois au
  pilotage, absorbé par le détour), rebond Keycloak, colonne « Rôles »,
  `UpdateToeic`, message zod d'un nombre requis, `axes.ts` en français,
  `registre.spec.ts` (vert six fois dans ce lot).
