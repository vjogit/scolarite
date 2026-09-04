# Étape 7 — le socle DataTable : TanStack Table rendu en shadcn, prouvé sur Salle

But de ce lot : bâtir le socle de table qui remplacera material-react-table,
et le prouver sur **un seul** écran — `pages/salle/Salle.tsx`. Les 18 autres
consommateurs de MRT ne bougent pas : ce lot construit et prouve, le
déploiement (lots 8–10) appliquera. MRT tournait déjà sur TanStack Table :
le moteur ne change pas, seules la couche de rendu et l'API disparaissent.

## 1. Constaté avant toute écriture (vs déduit)

- **Les pages ne consomment presque rien de MRT.** Sur 19 fichiers de pages
  qui l'importent, 15 n'importent que le *type* `MRT_ColumnDef` (`Cell:`,
  quelques `Header:`/`size:`). Les seuls usages de l'instance `table` du
  contrat toolbar : `useNoteChart` (`getPrePaginationRowModel().rows`, via
  `AxeCalcule` et `NoteControle`) ; les trois autres surcharges
  (`CustomCrudUser`, `CustomCrudPeriode`, `Groupe`) n'utilisent que
  `defaultActions`/`peutEcrire`. C'est ce qui a permis un contrat sans
  instance (§4).
- **Toutes les listes passent par `CrudList`** (`Crud.tsx` et
  `Consultation.tsx`) : basculer `List.tsx` sans aiguillage aurait migré les
  18 écrans d'un coup — d'où le commutateur (§3).
- `@tanstack/react-table` était déjà dans `node_modules` (8.20.6, dépendance
  de MRT), mais pas en dépendance directe.
- Sur les ~95 chaînes de la locale MRT, notre configuration n'en montrait
  qu'environ vingt : toolbar (5), tri, filtres, menu colonnes, pagination,
  sélection, en-tête « Actions ». Grouping, pinning, réordonnancement, modes
  de filtre, copie : jamais activés, non portés.
- La suite e2e ne s'accroche à aucun interne MRT ; `salle.spec.ts` n'affirme
  que le titre et le message d'état vide (nos propres clés). Salle
  n'apparaît dans aucune capture de référence.

## 2. Décisions actées (validées par l'utilisateur avant implémentation)

| Décision | Choix | Conséquence visible |
|---|---|---|
| Dépendance | `@tanstack/react-table` **directe, épinglée 8.20.6** (`--save-exact`) — la version exacte que MRT installe | lockfile : +2 lignes, npm dédoublonne, zéro octet nouveau. Premier essai `^8.20.6` refusé : npm résolvait 8.21.3, une montée que la décision excluait |
| **Densité** | **abandonnée** — rendu unique calé sur l'ancien défaut `compact` | un utilisateur qui avait `spacious` en session revoit du compact ; son entrée `sessionStorage` reste orpheline et meurt avec l'onglet |
| **Plein écran** | **abandonné** (déjà non persisté) | rattrapable en ~15 lignes (overlay `fixed`) sur constat d'un manque réel |
| Colonnes | `ColumnDef` TanStack **nu**, pas de type maison | migration mécanique : `Cell:`→`cell:`, `Header:`→`header:` ; style de cellule par `meta` (augmentation `ColumnMeta` typée : `className`, `headerClassName`, `libelle`) |
| Menu ⋮ par colonne | supprimé | tout ce qu'il offrait d'activé existe ailleurs : tri = clic sur l'en-tête (`aria-sort`), filtre = rangée, masquage = menu colonnes |
| `sessionStorage` | une clé par table, **versionnée** : `table:v1:${JSON.stringify(queryKey)}`, un seul objet JSON des sept états | les 8 anciennes clés par table restent orphelines, aucune migration — état jetable, mort avec l'onglet ; un utilisateur à session ouverte perd une fois filtres/tri/page sur l'écran migré |
| Recherche globale | `includesString` | MRT cherchait en « fuzzy » — plus strict et plus prévisible, différence assumée |

Les deux nuances documentées de l'ancien hook sont reprises au caractère
près : fusion `{ ...COLONNES_TECHNIQUES, ...sauvegardé }` (un `id` réaffiché
le reste — vérifié à l'écran, y compris après navigation aller-retour) et
`catch` de relecture (repli silencieux sur défauts).

## 3. Architecture — l'aiguillage par la forme des colonnes

- `components/ui/table.tsx`, `components/ui/checkbox.tsx` : primitives
  shadcn, fichiers locaux, zéro dépendance npm nouvelle.
- `services/crud/DataTable.tsx` : le moteur générique (useReactTable +
  rendu + toolbar + pagination + i18n) — c'est lui que `GroupeUserPage` et
  `JuryPeriode` reprendront à leur migration. Exclu du React Compiler
  (`'use no memo'`, exigence TanStack Table).
- `services/crud/ListMrt.tsx` : l'ancien `List.tsx` **déplacé verbatim**
  (`git mv`, zéro risque pour les 18 écrans), en sursis — il meurt avec son
  dernier consommateur.
- `services/crud/ListTanstack.tsx` : la même orchestration (requête,
  suppression, droits, mise en évidence), branchée sur `DataTable`. La
  duplication (~80 lignes) est temporaire et assumée.
- `services/crud/List.tsx` : le commutateur — `colonnes` (TanStack) présent
  → nouveau moteur ; `columns` (MRT) → `ListMrt`. **Un écran migre en
  changeant la forme de ses colonnes, rien d'autre.**
- `usePersistentTableState.ts` : nouveau hook `useEtatTablePersistant` à
  côté de l'ancien (7 états, une clé) ; l'ancien reste pour `ListMrt`.
- `EtatVideTable.tsx` : le prop `table` passe de `MRT_TableInstance` à un
  **type structurel** (`getState`/`setColumnFilters`/`setGlobalFilter`) que
  les deux moteurs satisfont — `GroupeUserPage` et `JuryPeriode` compilent
  sans retouche.

Piège d'implémentation notable : le tag JSDoc `@deprecated` sur
`columns`/`renderTopToolbarCustomActions` mettait en **erreur de lint les
14 pages non migrées** — interdites de retouche. La dépréciation est en
prose, pas en tag ; le tag viendra quand le dernier écran aura migré.

## 4. Le contrat toolbar — l'instance de table sort du contrat

C'est la signature que les lots 8–10 appliqueront en série (`def.ts`) :

```ts
actionsBarreOutils?: (props: {
  defaultActions: ReactNode;
  peutEcrire: boolean;
  lignesVisibles: () => D[];  // filtrées+triées, avant pagination, paresseux
}) => ReactNode
```

Correspondances pour les six usages réels : `CustomCrudUser`,
`CustomCrudPeriode`, `Groupe` — renommage pur (ils ignoraient `table`) ;
`AxeCalcule`, `NoteControle` — `handleOpenChart(table)` devient
`handleOpenChart(lignesVisibles)` où `useNoteChart` consomme `() => D[]` au
lieu de `getPrePaginationRowModel()`. Plus aucun type moteur dans le contrat
des pages. L'ancien champ `renderTopToolbarCustomActions` (MRT) survit sur
un champ distinct, servi par `ListMrt` seulement.

## 5. i18n — 18 clés, pas 95

Nouvelles clés `crud.json > table.*`, fr **et** en, recensées depuis l'usage
réel : recherche (3), filtres (3), colonnes (2), en-tête « Actions »,
pagination (6 : `lignesParPage`, `plage`, quatre navigations), sélection (3).
Libellés alignés sur ceux que MRT affichait (« Afficher/Masquer la
recherche »…) pour ne pas dérouter. Vérifié à l'écran dans les deux langues.

## 6. Ce que le lot répare au passage

La barre d'outils des listes mélangeait deux familles depuis le lot 4 §3 :
boutons shadcn à gauche, `IconButton` MUI internes à MRT à droite. Sur
l'écran migré, les commandes de droite (recherche, filtres, colonnes)
deviennent des `Button ghost icon` 32 px alignés sur celles de gauche — une
seule famille sur la rangée. Les trois props `mui*` et `mrtTheme` n'existent
pas dans le nouveau moteur : gabarit flex pleine hauteur par classes, fond
et cadre par tokens, surbrillance de retour d'enregistrement en
`bg-primary/15` clair / `/25` sombre (la transposition de
`alpha(palette.primary.main, 0.14 | 0.24)`), fondu porté par le
`transition-colors` de `TableRow` (+ `motion-reduce`).

## 7. Vérification à l'écran — Salle, jeu de 12 salles semées en base

Compte `test-e2e`, build conteneurs. Toutes les lignes du tableau :

| Scénario | Constaté | Modes |
|---|---|---|
| Tri au clic (Capacité) | desc → asc → effacé ; `aria-sort` posé ; **numérique = descendant au premier clic** (`sortDescFirst` TanStack, MRT montait d'abord — différence mineure assumée) ; persisté en session | sombre |
| Recherche globale | bascule + **focus au geste utilisateur seulement** (pas au chargement restauré) ; « amphi » → 2 amphis ; X efface | sombre |
| Filtres par colonne | « Bât. B » → 3 lignes, persisté ; valeur sans résultat → état vide filtré + « Effacer les filtres » qui vide **l'état persisté** | sombre |
| Menu colonnes | s'ouvre sans plantage (piège lot 3) ; id/version décochées ; réafficher `id` → colonne visible, menu reste ouvert, **persiste après navigation aller-retour** (`{id:true, version:false}` — la nuance de fusion) | sombre |
| Pagination | « 1–10 sur 12 », page 2 = « 11–12 sur 12 », désactivations exactes ; taille 25 → 12 lignes, `pageIndex` remis à 0, persisté | sombre |
| Sélection → suppression | compteur « 2 sur 12 ligne(s) sélectionnée(s) », en-tête indéterminé ; modale nomme les objets ; **Annuler conserve la sélection** (parité) ; confirmer supprime, notification « 2 salles supprimées. » accordée | sombre |
| Mise en évidence au retour | édition (bâtiment) → retour liste, ligne en `bg-primary/25`, éteinte après 2 s | sombre |
| Menu ⋮ de ligne, garde de sortie | « Éditer » navigue ; Annuler du formulaire → garde « Quitter sans enregistrer » | sombre |
| Rendu complet | capture regardée : rangée d'outils unifiée, cases, filtres, pagination | **clair + sombre** |
| fr/en | tous les libellés basculent (« Filter by Name », « Rows per page », « 1–10 of 10 »…) | clair |
| Console | **0 erreur** sur toute la session (seuls les avertissements d'iframe Keycloak, pré-existants) | — |

Deux défauts du socle trouvés **par la capture d'écran** (invisibles des
rôles/textes), corrigés puis re-prouvés :

- **`Checkbox.Root` Base UI rend un `<span>`, inline** : `size-4` ignoré,
  case écrasée à 1,6 px de large — rôle et clic fonctionnaient, tout test
  d'accessibilité passait. Correctif : `inline-flex` (commenté dans
  `checkbox.tsx`, ajouté aux pièges CLAUDE.md).
- **Texte des cellules hérité du body** : lisible en usage normal, illisible
  dans la combinaison « mode sombre choisi + OS clair » (§8). Correctif :
  `text-foreground` sur la racine de `DataTable` — la surface pose ses deux
  tokens elle-même.

## 8. Découvertes hors périmètre, signalées sans correction

- **La création de salle échoue en validation** : « Entrée invalide : nombre
  attendu, string reçu » sur Capacité — `register('capacite')` sans
  `valueAsNumber` face à `z.number()`. Pré-existant (le formulaire n'est pas
  touché par ce lot ; la fumée e2e ne teste que l'état vide), très
  probablement jamais exercé. L'édition marche tant qu'on ne retape pas la
  capacité (la valeur chargée reste un nombre). À corriger dans un lot
  formulaire.
- **Mode choisi ≠ OS : la charpente MUI se désynchronise.** Mesuré au
  navigateur (`mui-mode=dark`, `prefers-color-scheme: light`) : la classe
  `.dark` est bien posée (invariant 12 respecté, Tailwind suit) et les
  composants MUI stylés par le thème JS (cellules MRT en blanc, Paper
  sombre) suivent le choix — mais les **variables CSS** MUI
  (`--mui-palette-*`, dont le fond et la couleur de texte du body via
  CssBaseline) suivent la **media query**, pas le choix : body blanc, texte
  hérité noir, h2 des listes ternes sur les écrans sombres. Invisible de la
  suite (les captures posent `emulateMedia` : media et choix coïncident).
  Pré-existant à ce lot (le h2 de `ListMrt` l'avait déjà) ; la vraie
  correction appartient au chantier « inversion de la source de mode »
  (invariant 12) ou au paramétrage `colorSchemeSelector` du thème.
- Aléa e2e : trois runs consécutifs sur machine chargée (6,7–7,5 min contre
  3,5 en charge normale) ont chacun vu échouer un spec **différent** de la
  famille « l'écran ne suit pas la navigation » (défaut `BarreAxes`/rebond
  documenté — y compris une capture en échec de *navigation*, pas de
  comparaison). Chaque spec repasse seul ; charge retombée, deux runs
  complets verts d'affilée. Le défaut pré-existant s'aggrave avec la
  lenteur : à garder en tête pour la CI nocturne.

## 9. Bundle — par chunk, contre la référence figée d'avant-lot

| Chunk | Avant (kB / gzip) | Après | Δ |
|---|---|---|---|
| code applicatif (index) | 289.8 / 77.1 | 306.8 / 81.1 | **+17.0 / +4.0** (DataTable, ListTanstack, ui/table+checkbox) |
| `tanstack-libs` | 108.2 / 30.8 | 108.6 / 31.0 | +0.4 (import direct, dédoublonné sur la copie de MRT) |
| vendor | 881.0 / 277.0 | 888.8 / 280.0 | +7.8 (12 icônes lucide nouvelles) |
| CSS | 83.9 / 13.8 | 86.9 / 14.3 | +3.0 |
| **`mui-material-libs`** | **502.1** | **502.1** | **0.0** |

Net ≈ **+28 kB rendus (+7,5 gzip)**. MRT ne décroît pas encore — il sert
toujours 18 écrans ; la décrue (MRT ~large + le reliquat 10,2 kB de
`@mui/icons-material`, lot 6 §7) viendra avec les lots 8–10.

## 10. Vérifications finales

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` + vite) | ✅ |
| `make test-ihm` (run 1, build final) | ✅ 63 passed (3,5 min) |
| `npx playwright test` (run 2, consécutif, autre point d'entrée) | ✅ 63 passed (3,6 min) |
| Sélecteurs/assertions e2e | **zéro modification** ; **zéro capture régénérée** (Salle n'est pas capturée, les 20 références restent vertes) |
| Build Go / `go test` | ✅ / ✅ sauf l'échec pré-existant `programme-import/extraction` (fixture absente, lot 5) |
| Lockfile | +2 lignes (l'arête directe `@tanstack/react-table@8.20.6`), 0 montée |
| Données de vérification | 12 salles « Vérif7 » semées puis purgées ; table `salle` rendue vide (la fumée e2e l'exige) |

## 11. Ce qui n'a pas été traité

- **Les 18 autres consommateurs de MRT** : lots 8–10, écran par écran, en
  changeant la forme des colonnes et en renommant la surcharge toolbar (§4).
  `GroupeUserPage` et `JuryPeriode` (MRT direct) migreront sur `DataTable`.
- `ListMrt.tsx`, l'ancien `usePersistentTableState`, les champs `columns` /
  `renderTopToolbarCustomActions` : en sursis, morts avec le dernier écran.
- `actionsBarreOutils` et `meta` (`className`/`headerClassName`/`libelle`) :
  implémentés et typés, **sans consommateur encore** — Salle n'en a pas
  l'usage ; premier exercice réel aux lots 8–10.
- La capacité de salle en création (§8), la désynchronisation de charpente
  mode choisi ≠ OS (§8) : signalées.
- Défauts pré-existants intacts : rendu figé `BarreAxes`, rebond Keycloak,
  URL mémorisée sur id re-semé, échec Go `programme-import`.
