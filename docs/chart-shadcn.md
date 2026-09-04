# Lot chart-shadcn — le composant Chart de shadcn remplace la lecture des tokens au runtime

`NoteChartModal.tsx` portait, depuis le lot 4bis, un mécanisme maison pour
donner à recharts des couleurs qui suivent le mode : `getComputedStyle` sur
`<html>` pour résoudre cinq variables CSS, et un `MutationObserver` sur sa
classe pour les relire quand `.dark` bascule. Le lot 4bis avait écarté le
composant `Chart` de shadcn parce que la page devait rester MUI ; cette
raison est tombée au lot 16. Ce lot fait entrer `components/ui/chart.tsx` et
convertit la modale. Le mécanisme maison disparaît ; ce qui le remplace n'est
pas tout à fait ce que le composant du registre propose — c'est le sujet du
§2.

## 1. Constaté avant toute écriture (vs déduit)

- **Le mécanisme est celui décrit** : `lireCouleurs()` (l. 118-128,
  `getComputedStyle(document.documentElement)`, cinq `getPropertyValue`) et
  `useCouleursGraphique()` (l. 136-144, `useState` + `MutationObserver` sur
  `attributeFilter: ['class']`), consommés par 24 lectures `couleurs.*` dans
  le JSX des trois graphiques. `isAnimationActive={false}` sur les trois
  séries (l. 305, 320, 334), commentaire l. 302-304.
- **Le composant du registre pose un `<style>` à l'exécution.** Lu par
  `npx shadcn view chart` avant toute installation : `ChartStyle` rend un
  `<style dangerouslySetInnerHTML>` qui déclare `--color-<clé>` sur
  `[data-chart=<id>]` et `.dark [data-chart=<id>]` à partir de
  `config[clé].color`/`theme`. C'est **exactement** ce que l'invariant
  CLAUDE.md #11 interdit (« aucun moteur qui injecte du CSS à l'exécution
  (CSS-in-JS, `<style>` posé en JS) »). L'énoncé du lot supposait que
  `ChartContainer` « définit des variables CSS locales sur un conteneur » :
  il le fait, mais par une feuille posée en JS, hors couche. Déduit puis
  vérifié par lecture du source : sans `color` ni `theme` dans le `config`,
  `ChartStyle` rend `null` et rien n'est injecté.
- **`var(--token)` en attribut SVG est résolu par la cascade.** C'est ce
  que les exemples shadcn font eux-mêmes (`fill="var(--color-desktop)"`) ;
  recharts recopie ses props `stroke`/`fill` en attributs de présentation,
  que le navigateur évalue comme des valeurs CSS. Vérifié au navigateur
  (§6) : la ligne, les barres, le nuage, la grille, les axes et la ligne de
  moyenne changent de couleur à la bascule de mode, modale ouverte, sans
  aucun re-rendu React.
- **Le nuage livre deux entrées de `payload` à l'infobulle** (x `indexId` et
  y `note` — `Scatter.js`, `tooltipPayload`, lu dans `node_modules`) ;
  `ChartTooltipContent` rend une ligne par entrée. `CustomTooltip` ne lit
  que `payload[0].payload` et affiche deux lignes : le nom (ou la tranche)
  en gras, puis « Note : x / 20 » ou « Nombre d'élèves : n ».
- **Le registre cible recharts 3.8.0** ; le projet épingle `^3.7.0`
  (3.7.0 installé). `TooltipValueType`, que le fichier importe, n'existe pas
  en 3.7 ; `ValueType`/`NameType` de `DefaultTooltipContent` en tiennent
  lieu (ce que `NoteChartModal` importait déjà).
- **`--chart-4` et `--chart-5` n'ont aucun consommateur** dans `src/`
  (`grep -rn 'chart-4\|chart-5'` hors `index.css` : zéro). Le lot 2 les a
  posés avec les trois autres ; ils restent en place — ils appartiennent au
  système de design, pas à ce fichier (voir §8).
- **La modale hérite de `text-sm`** (14 px, posé par `DialogContent`), et
  `body` n'a pas de taille de police propre ; `ChartContainer` impose
  `text-xs` (12 px) et `aspect-video`. Sans contre-mesure, les graduations
  rétrécissent et le graphique cesse de remplir son panneau.
- Référence bundle figée avant-lot : build de `main` à `07a253d` (la fusion
  de `ci`), mêmes `node_modules`, `vite build` mode production, rapport
  visualizer conservé ; tailles par paquet agrégées depuis le JSON du
  rapport (`renderedLength` par module, regroupé par paquet npm). Le total
  (4319,6 kB, 66 paquets, 651,0 kB de code applicatif) est celui que le
  lot 17 avait mesuré.

## 2. Ce que le mécanisme faisait, et ce qui le remplace

Le mécanisme maison résolvait les tokens **une fois, à la racine**, et les
recopiait dans des props recharts ; toute bascule de mode exigeait une
relecture (l'observateur), un `setState` et un re-rendu des trois graphiques
— une réimplémentation manuelle de ce que le navigateur fait gratuitement
partout ailleurs.

Le remplaçant tient en cinq chaînes : `COULEURS = { serie:
'var(--chart-1)', reference: 'var(--chart-2)', nuage: 'var(--chart-3)',
grille: 'var(--border)', axe: 'var(--muted-foreground)' }`. Les props
recharts sont les mêmes qu'avant (`stroke={COULEURS.serie}`,
`tick={{ fill: COULEURS.axe }}`…) ; seule leur valeur change : une
référence au lieu d'une couleur résolue. Le navigateur résout `var()` à
chaque peinture, sur la classe `.dark` que `layouts/dashboard.tsx` pose —
aucune lecture, aucun observateur, aucun état.

**Ce n'est pas le mécanisme de `ChartStyle`.** Le composant du registre
attend `config = { note: { label, color: 'var(--chart-1)' } }` et fabrique
`--color-note` par un `<style>` injecté, que les séries référencent en
`var(--color-note)`. Deux options se présentaient :

- *Écartée — reprendre `ChartStyle` et amender l'invariant 11* (une seconde
  exception après FullCalendar). La règle injectée ne déclare que des
  propriétés personnalisées à portée `[data-chart=…]` : elle ne peut
  écraser aucun utilitaire. Mais l'invariant est écrit sans exception, pour
  une raison que dix-sept lots ont payée ; l'assouplir pour épargner une
  indirection (`--chart-1` → `--color-note` → `var(--color-note)`) n'en
  vaut pas le prix. **Cette option reste ouverte à l'arbitrage** : elle
  tient en une ligne de `config` par série et la réintroduction de
  `ChartStyle` depuis le registre.
- **Retenue — `ChartContainer` sans `ChartStyle`, tokens référencés
  directement.** `chart.tsx` entre par le CLI, `ChartStyle` et le
  `color`/`theme` de `ChartConfig` n'en font pas partie (commentaire de
  tête du fichier) ; le `config` ne porte que `label`/`icon`. Le conteneur
  garde ce qu'il apporte : le `ResponsiveContainer`, le contexte, et les
  règles de classe qui corrigent les couleurs codées en dur de recharts
  (`#ccc` des grilles et lignes de référence par défaut, `#fff` des points
  actifs, curseurs).

Les règles de classe du conteneur ont deux effets sur cette modale, tous
deux traités :

- `[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted` **prime sur
  l'attribut `fill`** du curseur des barres (une règle CSS bat un attribut
  de présentation, quelle que soit sa spécificité). Le curseur du lot 4bis —
  la série à 10 % — aurait viré au gris `muted` à 10 %, presque invisible.
  Le conteneur du `BarChart` reçoit `[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-chart-1`
  (tailwind-merge garde le dernier), `fillOpacity: 0.1` reste en attribut.
- `text-xs` et `aspect-video` : remplacés par `aspect-auto h-full w-full
  text-sm` (`CLASSE_GRAPHIQUE`), pour que le graphique remplisse son
  panneau et garde ses 14 px. **Les captures de référence ne bougent pas
  d'un pixel** (§5) — c'est la preuve que le tracé est le même.

Les autres règles ne matchent pas (nos grilles et lignes de référence ne
portent pas `stroke='#ccc'`) ou n'agissent qu'au survol : le trait
vertical du curseur de la courbe passe de `#ccc` à `--border`, et le point
actif de la courbe perd son liseré blanc (`stroke='#fff'` →
`stroke-transparent`, un choix shadcn ; en sombre, le liseré blanc était de
toute façon un reste de thème clair). Vérifiés au navigateur, §6.

## 3. Ce que le CLI a fait, et ce qui a été défait

`npx shadcn add chart -y` :

- a **monté recharts de `^3.7.0` à `^3.8.0`** dans `package.json` (le
  registre déclare `recharts@3.8.0`) ;
- a **installé un paquet npm nommé `cn`** (`^0.2.5`) : le registre base-nova
  déclare `cn` comme dépendance — un alias interne pour `@/lib/utils` que le
  CLI a pris pour un paquet ; le fichier écrit importait `{ cn } from "cn"` ;
- s'est arrêté sur « `card.tsx` existe déjà, écraser ? » — relancé avec
  `n`, `card.tsx` intact (« Skipped 1 file »), `chart.tsx` créé, identique
  au contenu de `view` à la directive `"use client"` près (retirée par le
  CLI) ;
- lockfile : 18 lignes ajoutées, 5 retirées.

Défait : `git checkout package.json package-lock.json` (lockfile
byte-identique à la copie prise avant, `cmp`) puis `npm ci` — recharts
3.7.0 réinstallé, `node_modules/cn` absent. **Lockfile : +0 / −0 / 0 montée
parasite.** Réponse à « vérifie s'il tire quelque chose » : oui, deux
choses, toutes deux refusées.

Adaptations de `chart.tsx` au projet (commit d'entrée, toutes listées en
tête du fichier) : import `@/lib/utils` ; types recharts 3.7 ; retrait de
`ChartStyle` (§2) ; le cinquième argument de `formatter` est le tableau
`payload` (signature recharts), là où le registre passait `item.payload`
(un `any`) ; lint du projet — `interface` plutôt que `type`, `React.use`,
contexte rendu comme fournisseur, clés de `payload` résolues en chaîne
(`dataKey` peut être une fonction), `fill` du payload lu sans `any`, deux
`no-array-index-key` motivés. Le fichier brut du registre faisait 30
erreurs et 5 avertissements sous `strictTypeChecked` ; 0/0 après.

Puis un troisième commit, dicté par la mesure (§7) : `ChartLegend` et
`ChartLegendContent` sortent. Le seul alias `const ChartLegend =
RechartsPrimitive.Legend` retenait `Legend.js`, `DefaultLegendContent.js` et
leurs contextes dans le chunk recharts (+13,9 kB rendus) sans consommateur ;
sans lui, le chunk est **byte-identique** à l'avant-lot (même hachage
`recharts-libs-B_sbMkr9.js`). Aucun graphique du projet n'a de légende ; à
reprendre du registre le jour où l'un en a besoin.

## 4. Les quatre points de vigilance

1. **`isAnimationActive={false}` survit**, sur les trois séries, avec son
   commentaire. `ChartContainer` ne touche pas à l'animation (c'est du JS
   recharts, que ni le conteneur ni `animations: 'disabled'` ne gèlent) ;
   la prop reste la seule garantie de déterminisme de `note-graphique`.
2. **`CustomTooltip` est conservé tel quel**, monté sur `ChartTooltip`
   (l'alias shadcn de `Tooltip`, même composant). `ChartTooltipContent`
   n'a pas été adopté : sur le nuage, il rendrait **deux lignes** (`indexId`
   et `note`, §1) là où l'infobulle en montre une ; obtenir le contenu
   actuel exigerait `hideLabel` + `hideIndicator` + un `formatter` qui rend
   les deux `<p>` pour l'entrée 0 et `null` pour la suivante — une coquille
   shadcn autour d'un contenu entièrement à nous, avec un cadre différent
   (`bg-background`, `text-xs`, `shadow-xl`). Contenu vérifié au navigateur
   avant et après (§6) : identique, dans les deux langues. Si un jour
   l'infobulle doit ressembler aux autres graphiques shadcn, c'est une
   décision d'apparence, pas de migration.
3. **`ReferenceLine` et `ZAxis`** : la ligne de moyenne et son étiquette
   gardent `stroke={COULEURS.reference}` / `fill: COULEURS.reference`, hors
   `config` — une référence `var(--chart-2)`, résolue par la cascade comme
   le reste. **Suit le mode sombre, modale ouverte** (§6) — le défaut que le
   lot 4bis avait corrigé ne réapparaît pas. `ZAxis range={[60, 60]}`
   inchangé.
4. **Le `config` se construit dans le composant**, avec le `t` du rendu :
   `{ note: { label: t('noteChartModal.serieNote') }, count: { label:
   t('noteChartModal.axeNombreEleves') } }` — recalculé à chaque rendu,
   donc à chaque bascule fr/en. Une clé ajoutée dans les deux langues
   (`serieNote` : « Note » / « Grade »). Honnêteté : rien ne lit ces
   libellés aujourd'hui (seuls `ChartTooltipContent`/`ChartLegendContent`
   les consomment) ; ils nomment les séries pour qui les reprendra.

## 5. Journal des deux captures — aucune régénérée

Premier run (`make test-ihm`, contre le build final servi par nginx —
`index-iPbEkhWZ.js`, vérifié par `curl` : il contient la classe
`aspect-auto h-full w-full text-sm` du lot et référence
`recharts-libs-B_sbMkr9.js`, le chunk d'avant-lot) : **63 ✅, 0 ✘, 3,5 min**.
Les 20 captures passent la comparaison de référence, `note-graphique-light`
et `note-graphique-dark` comprises — **aucun `*-actual.png`, aucun
`*-diff.png`, aucun `--update-snapshots`**. `git status` sur `front/e2e` :
vide.

| Capture | Sort |
|---|---|
| `note-graphique` (clair, sombre) | **inchangée** — l'attente de départ était qu'elles bougent ; elles ne bougent pas, parce que `CLASSE_GRAPHIQUE` neutralise les deux seules règles du conteneur qui touchaient au rendu fermé (`aspect-video`, `text-xs`), et que les tokens résolus par `var()` sont, au pixel près, ceux que `getComputedStyle` lisait. Le tracé, les couleurs, la position : identiques |
| les 18 autres | **inchangées** |

C'est la démonstration attendue au §2 : même tracé, même chrome, même
infobulle fermée ; seuls les états de survol changent (§6).

## 6. Vérification à l'écran — compte `test-e2e`, build reconstruit

Playwright MCP sur `https://10.20.2.5:9021` (nginx, build du lot), contrôle
de rattrapage E2E (deux notes : 7 et 11, moyenne 9,00), puis écran d'axe UE.
Mode piloté par `emulateMedia({ colorScheme })` — préférence `mui-mode`
absente, donc `system` : c'est l'abonnement `matchMedia` de `useModeCouleur`
qui pose `.dark`, le chemin réel de l'invariant 12. Couleurs lues par
`getComputedStyle` sur les éléments SVG (valeurs `lab()` telles que Chromium
les rend).

| Scénario | Résultat |
|---|---|
| **Bascule de mode, modale ouverte** (courbe, clair → sombre) | ✅ `<html>` passe à `class="dark"` ; l'attribut reste `stroke="var(--chart-1)"` et la couleur calculée passe de `lab(48.4 0.7 −55.7)` (`--chart-1` clair) à `lab(78.6 −10.4 −29.5)` (`--chart-1` sombre) ; **aucun re-rendu** (mêmes nœuds SVG, aucun `setState`). Idem grille (`lab(0 0 0/0.12)` → `lab(100 0 0/0.12)`), axes (`/0.6` → `/0.7`), points |
| **Ligne de moyenne et son étiquette** — clair et sombre | ✅ trait `lab(47.9 63.1 42.4)` → `lab(56.5 67.1 49.4)` (`--chart-2`) ; étiquette « Average (9.00) » / « Moyenne (9.00) », `fill` = même valeur que le trait, 12 px, dans les deux modes. Le défaut du lot 4bis ne réapparaît pas |
| **Retour sombre → clair, modale ouverte** (nuage) | ✅ classe retirée, symbole `--chart-3` `lab(68.6 31.5 −26.4)` → `lab(40.4 60.1 −48.1)`, moyenne et libellé d'axe suivent |
| **Aucune feuille injectée** | ✅ `document.querySelectorAll('style')` : deux, `data-fullcalendar` (FullCalendar, connue) et sonner — rien du graphique |
| **Graduations et libellés** | ✅ Y : 14 px (`text-sm` conservé, `fill` `--muted-foreground`) ; X de la courbe : 12 px (`fontSize: 12` explicite, inchangé) ; libellés d'axe « Nb. d'élèves » / « Élèves (Ordre alphabétique) » et leurs versions anglaises, 14 px, `--muted-foreground` dans les deux modes |
| **Infobulle — courbe** | ✅ « Eleve2 E2E » / « Note : 11.00 / 20 » (fr) — « Grade: 11.00 / 20 » (en), clair et sombre, cadre `bg-popover` inchangé |
| **Infobulle — barres** | ✅ « 7-8 » / « Nombre d'élèves : 1 » — « Number of students: 1 » |
| **Infobulle — nuage** | ✅ « Eleve4 E2E » / « Note : 7.00 / 20 » — « Grade: 7.00 / 20 » ; **une seule note**, pas une ligne par axe |
| **Curseur des barres** | ✅ `fill="var(--chart-1)"` **calculé en `--chart-1`** (pas `--muted`), `fillOpacity 0.1`, dans les deux modes — la classe `fill-chart-1` du conteneur prend le pas sur le `fill-muted` shadcn ; visible sur la capture d'écran sombre (bande bleutée derrière la barre survolée) |
| **Curseur du nuage** | ✅ croix `recharts-cross`, `stroke="var(--muted-foreground)"` calculé (`lab(100 0 0/0.7)` en sombre), pointillés |
| **Curseur de la courbe** (non stylé par la modale) | trait vertical `stroke="#ccc"` → **calculé `--border`** par la règle du conteneur (`lab(100 0 0/0.12)` en sombre) — le seul changement de rendu, au survol seulement, dans le sens du thème |
| **Point actif de la courbe** | liseré `stroke="#fff"` → **transparent** (règle shadcn `[&_.recharts-dot[stroke='#fff']]:stroke-transparent`), disque `--chart-1`, r = 8 — au survol seulement ; en sombre le liseré blanc était un reste de thème clair |
| **Trois onglets, deux langues, deux modes** | ✅ titre, cinq cartes KPI, onglets « 1. Courbe de Progression / 2. Distribution (Tranches) / 3. Dispersion Globale » et leurs versions anglaises ; le `config` recalculé au rendu suit la langue (bascule par le menu « Changer de langue », modale rouverte) |
| **Données selon le filtrage** (écran d'axe UE, `DataTable`) | ✅ sans filtre : 2 points, « Moyenne (10.00) » ; recherche « Eleve2 » : 2 lignes de table (en-tête + 1), **1 point, « Moyenne (8.00) »**, KPIs 8.00 / 8.00 / 100 % — `lignesVisibles` inchangé, contrat du lot 9 respecté |
| **Console** | ✅ 0 erreur sur toute la session (3 avertissements préexistants, sans rapport) |

Captures d'écran prises (non versionnées) : courbe clair/sombre avec et
sans infobulle, barres sombre et clair avec curseur, nuage sombre (en/fr) et
clair.

## 7. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip, tailles imprimées par `vite build`, mode
production, mêmes `node_modules`) :

| Chunk | Avant-lot (`07a253d`) | Après (entrée + conversion, légende comprise) | Après (légende retirée, final) | Δ final |
|---|---|---|---|---|
| code applicatif (`index`) | 323.73 / 84.62 | 324.71 / 85.11 | **324.70 / 85.12** | **+0.97 / +0.50** |
| `recharts-libs` | 365.41 / 105.92 (`B_sbMkr9`) | 372.29 / 107.62 | **365.41 / 105.92 (`B_sbMkr9`)** | **0 — même hachage** |
| `vendor`, `tanstack-libs`, `fullcalendar-libs`, `rolldown-runtime` | 893.55, 88.52, 270.30, 0.68 | idem | idem | 0 — mêmes hachages |
| CSS (`index-*.css`) | 116.05 / 18.40 | 119.75 / 19.03 | **119.48 / 18.97** | **+3.43 / +0.57** |
| **JS + CSS** | **2058.2 / 595.1** | 2070.2 / 597.6 | **2062.6 / 596.2** | **+4.4 / +1.1** |

Par paquet (visualizer, tailles rendues) :

| Paquet | Avant | Après (final) | Δ kB |
|---|---|---|---|
| code applicatif | 651.0 | 653.0 | **+2.0** (`chart.tsx` 1.4 rendu ; `NoteChartModal` 14.2 → 14.7, +0.5 : le `config`, les trois `ChartContainer` et la classe du curseur pèsent un peu plus que les 47 lignes retirées ; locales +0.1) |
| `recharts` | 555.4 | 555.4 | **0** (555.4 → 569.3 avec `ChartLegend`, revenu à 555.4 sans) |
| les 64 autres (`@base-ui/react` 554.1, `react-dom` 453.2, `d3-*`, `decimal.js-light`…) | — | — | **0**, identiques au dixième de kB |
| **Total rendu** | 4319.6 | 4321.6 | **+2.0** ; 66 paquets → 66 |

Bilan franc : **neutre, +4,4 kB sur le fil (+1,1 gzip)**, dont 3,4 kB de
CSS — les règles de classe du conteneur shadcn (douze sélecteurs
arbitraires `[&_.recharts-…]`, générés une fois par Tailwind) et
`fill-chart-1`. Le gain n'était pas le poids ; c'est la suppression de
47 lignes qui relisaient le DOM (le fichier garde ses 347 lignes : ce que
le mécanisme occupait, les commentaires qui expliquent son absence et le
`config` le reprennent) et d'un consommateur de la classe `.dark`. Le seul écart notable rencontré en cours de route (+13,9 kB de
`Legend`) a été mesuré, expliqué et retiré (§3).

## 8. CLAUDE.md, invariant 12, tokens morts

- **Un consommateur de `.dark` disparaît**, mais CLAUDE.md ne le nommait
  pas : l'invariant 12 dit « tout le reste suit la classe (`@custom-variant
  dark`, `color-scheme`) ou la valeur (`theme` du toaster) » — le
  `MutationObserver` en était un cas particulier non cité. **Aucune
  contrainte à retirer.** Ce qui apparaît, c'est une convention de
  graphique, ajoutée à CLAUDE.md (« Pièges connus ») : les couleurs
  recharts sont des `var(--chart-N)` en props, jamais des valeurs résolues
  ni un `config.color` shadcn (`ChartStyle`, injecté, absent de
  `chart.tsx`) ; et une règle de classe du conteneur prime sur un attribut
  `fill`/`stroke` recharts — le curseur des barres en est le précédent.
- **`--chart-4` et `--chart-5` sont morts** : posés au lot 2 (cinq tokens,
  clair et sombre, plus `--color-chart-4/5` dans `@theme`), consommés par
  personne — ce fichier n'en lit que trois. **Non supprimés** : ils
  appartiennent au système de design (`docs/migration-shadcn/02-tokens.md`),
  et un quatrième/cinquième graphique les attend. Signalé dans CLAUDE.md.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep -c 'getComputedStyle\|MutationObserver' NoteChartModal.tsx` | ✅ **0** (le commentaire de tête décrit l'ancien mécanisme sans nommer les deux identifiants, pour que ce grep reste une preuve) |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0, propre, à chaque étape |
| Suite e2e contre le build du lot (nginx reconstruit par `make start-scolarite`, script servi `index-iPbEkhWZ.js` vérifié par `curl` : contient la classe du lot et référence `recharts-libs-B_sbMkr9.js`) | **`make test-ihm` ✅ 63 (3,5 min) → `npx playwright test` ✅ 63 (3,6 min)** — deux exécutions consécutives vertes, points d'entrée alternés ; `registre.spec.ts` vert deux fois |
| Captures de référence | ✅ **20/20 passent, zéro régénérée** ; `git status front/e2e` vide |
| Sélecteurs/assertions e2e | **zéro modification** |
| Lockfile | **+0 / −0 / 0 montée parasite** (`cmp` contre la copie d'avant-lot ; le CLI en avait fait +18/−5 avec une montée de recharts et un paquet `cn`, défaits) |
| Bundle | neutre : +4,4 kB sur le fil, `recharts-libs` et `vendor` aux mêmes hachages (§7) |
| Vérification à l'écran | §6 — quatorze scénarios, deux modes, deux langues, trois onglets, bascule modale ouverte |
| Workflows GitHub sur la branche | voir la PR — complété après le premier run (§9 bis) |

Un run de plus, avant tout cela : la suite complète sur `main` après la
fusion de `ci` (partie 1 de la commande), `make test-ihm` ✅ 63 (2,9 min)
puis `npx playwright test` ✅ 63 (2,9 min), contre le build de `main`
(`front/src` identique entre `aa2c335` et la fusion).

## 10. Ce qui n'a pas été traité, et ce qui est signalé

- **Le chargement paresseux** de la modale (`React.lazy`/`Suspense`) : lot
  distinct, non fait ici, comme demandé.
- **`ChartStyle` et l'invariant 11** : la question « amender l'invariant
  pour une règle injectée qui ne déclare que des propriétés personnalisées
  à portée locale » reste ouverte (§2) ; ce lot a choisi de ne pas la
  trancher seul.
- **`ChartTooltipContent`** non adopté (§4.2) ; `CustomTooltip` reste la
  seule infobulle de graphique du projet.
- **`name="Note"` et `name="Notes"`** (`YAxis` et `Scatter` du nuage) sont
  des chaînes en dur préexistantes — jamais affichées (l'infobulle par
  défaut qui les lirait n'est pas montée). Hors périmètre, non touchées.
- **Les trois questions ouvertes du lot CI** (généré sqlc, `programme.xlsx`,
  portabilité des captures) : toujours ouvertes, non tranchées ici.
- **`--chart-4`/`--chart-5`** : morts, laissés (§8).
- **Le registre shadcn n'est pas figé** : `npx shadcn view chart` a rendu un
  fichier ciblant recharts 3.8 aujourd'hui ; une réinstallation ultérieure
  rendrait autre chose. Le fichier versionné fait foi, pas le CLI.
