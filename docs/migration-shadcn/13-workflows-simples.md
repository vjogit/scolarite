# Étape 13 — les petits workflows, et les champs de formulaire partagés

Onze fichiers dans quatre dossiers (`salle`, `user`, `catalog`,
`certification`) perdent leur dernier import `@mui/material`. Mais le sujet
du lot est ailleurs : **les composants de formulaire partagés** sont
établis ici, sur les écrans les plus simples, comme le socle `DataTable` l'a
été sur Salle (lot 7) et `ChampDate` sur cinq écrans (lot 12). Les lots 14 à
16 les appliqueront sur une quarantaine de fichiers sans rien réinventer.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire annoncé est exact à un fichier près** : dix des onze
  fichiers du périmètre importaient `@mui/material` (`SalleLayout.tsx`,
  `CatalogLayout.tsx`, les `routes.tsx` et `def.tsx` n'en importaient pas ;
  `certification/routes.tsx` non plus). `@mui/material` reste importé par
  **41 fichiers** après le lot, comme annoncé.
- **Aucun `Autocomplete` MUI dans le périmètre.** Les quatre pages qui en
  montent sont `ReservationDialog` (×3), `NoteEleveAxe`, `GrilleNotes` et
  `FicheExportModal` — toutes hors périmètre. TOEIC et Mobilité passaient
  déjà par `UserSelector`, migré au lot 5 sur `ui/combobox.tsx`. Voir §5.
- **Le défaut de validation de la capacité (lot 7 §8) est reproduit par
  lecture** : `register('capacite')` sans `valueAsNumber` remet une chaîne à
  `z.number()`. Quatre autres écrans hors périmètre portent le
  `valueAsNumber` explicite (Promotion, Matière, UE, Contrôle, NoteControle)
  — cinq endroits où la même conversion se réécrit.
- **La suite e2e ne cible aucun formulaire du périmètre** : `salle.spec.ts`
  n'affirme que l'état vide de la liste ; `formulaire.spec.ts` travaille sur
  Formation ; `i18n.spec.ts` sur le menu d'actions de Mobilité (non touché).
  Deux ancrages, en revanche, dépendent de `StructureLayout` : le titre du
  panneau est ciblé en **`heading`** (`hierarchieE2E.ts` :
  « Formation — E2E Formation »), et le bouton « Créer une formation » de
  l'en-tête de l'arbre est cliqué en premier (`.first()`) par
  `formulaire.spec.ts` et `clavier.spec.ts`. MUI rendait `subtitle1` et
  `subtitle2` en `<h6>` : le remplaçant garde le `h6`.
- **Huit captures photographient l'écran Structure** (`formation-liste`,
  `menu-actions`, `menu-compte`, `dialogue-suppression-*`, en clair et en
  sombre) ; `certification-toeic` photographie la **liste** TOEIC vide — pas
  un formulaire.
- **Base UI associe `<label for>` à ses Checkbox et Switch** (lu dans
  `CheckboxRoot.js:197` et `SwitchRoot.js:154`) : l'`id` posé sur le
  composant va sur l'`<input>` caché, et le libellé est recopié en
  `aria-labelledby` sur le `<span role="checkbox">`. `Select.Root` rend un
  `<input>` caché porteur du `name`, non `type="hidden"`, qui **renvoie le
  focus au déclencheur** (`SelectRoot.js:398`) — `services/crud/focus.ts`
  continue donc d'atteindre le champ, par le nom comme par `aria-invalid`.
- **Le registre shadcn est joignable et `shadcn` est déjà en dépendance** :
  `field`, `select` et `switch` (style `base-nova`) entrent par le CLI, sans
  aucune dépendance nouvelle. `field.tsx` demandait trois retouches de lint
  (`Array<T>`, chaînage optionnel superflu, clé d'index), consignées dans le
  fichier.
- Référence bundle figée avant-lot : build du commit f0e14e6 (lot 12) dans
  un worktree jetable, mêmes `node_modules`, `vite build` mode production.

## 2. Le contrat des champs de formulaire partagés

Deux modules dans `services/`, sur le modèle de `ChampDate.tsx` :

| Composant | Fichier | Remplace | Rend |
|---|---|---|---|
| `ChampTexte` | `services/ChampTexte.tsx` | `TextField` (texte, mot de passe, `multiline`) | `Field` + `FieldLabel` + `Input`/`Textarea` + `FieldError` |
| `ChampNombre` | `services/ChampTexte.tsx` | `TextField type="number"` + `valueAsNumber` + `slotProps.htmlInput` | idem, `<input type="number">` |
| `ChampSelection` | `services/ChampChoix.tsx` | `TextField select` + `MenuItem` | `Select` Base UI (`ui/select.tsx`) |
| `ChampInterrupteur` | `services/ChampChoix.tsx` | `FormControlLabel` + `Switch` | `Switch` Base UI (`ui/switch.tsx`), rôle `switch` |

**Ce qu'un écran leur passe, et rien d'autre** (`PropsChampBase<D>`) :
`name: Path<D>`, `control: Control<D>`, `label`, `disabled?`
(`isReadOnly`), `className?`. Plus, selon le champ : `type`, `multiline`,
`rows`, `autoComplete` (texte) ; `step`, `min`, `max` (nombre) ;
`options: { id, label }[]` et `libelleVide?` (sélection).

**Ce qui vit dans le composant, une fois pour toutes** :

- le câblage react-hook-form par **`useController`** — plus de
  `register(...)` dans les écrans, plus d'`errors` à faire suivre : le
  composant lit `fieldState.error` lui-même. `RenderProps` ne change pas
  (`register`, `errors`, `getValues`, `setValue` restent fournis, les
  écrans hors périmètre n'ont rien à changer — pas de condition d'arrêt) ;
- l'affichage de l'erreur : `aria-invalid` sur le contrôle,
  `aria-describedby` vers un `FieldError` (`role="alert"`), `data-invalid`
  sur le `Field` qui colore le libellé — le même circuit que `Form.tsx`
  exploite pour poser le focus sur le premier champ refusé ;
- la **normalisation à l'affichage** : `null`/`undefined` → champ vide
  (création : les champs absents d'`emptyValue` sont `undefined` ; édition :
  react-hook-form est `reset` avec la réponse brute de l'API — la leçon du
  lot 12) ;
- le libellé en **`<label for>`** : le nom accessible du `TextField` MUI
  est conservé, `getByLabel` trouve chaque champ ;
- le `name` sur l'`<input>` (ou l'`<input>` caché de Base UI) :
  `premierChampSaisissable` et `premierChampEnErreur` (`focus.ts`)
  travaillent sans changement ;
- la marge basse (`mb-4`, l'ancien `sx={{ mb: 2 }}`), alignée sur celle
  d'`UserSelector`.

**`ChampNombre` et le sort du défaut de validation numérique** — réglé
**structurellement**, sans toucher aux schémas zod (la seconde condition
d'arrêt n'est donc pas levée) : le composant remet au formulaire
`Number(saisie)`, ou **`null` si le champ est vidé**. Un `z.number()` reçoit
un nombre ; un `.nullable()` accepte l'effacement. La création de salle,
qui échouait en validation depuis le lot 7 (« nombre attendu, string
reçu »), passe — constaté au navigateur (§6). Le choix de `null` plutôt que
du `NaN` de `valueAsNumber` est délibéré : `NaN` n'est accepté par aucun
schéma, `null` l'est par les optionnels (`value_matiere_eliminatoire` de
Promotion, lot 14). Un champ requis vidé produit le message zod par défaut
(« Entrée invalide : nombre attendu, null reçu » — traduit par la locale
zod active), comme avant avec `NaN` ; un message métier demanderait une
`error` sur le schéma, hors périmètre.

**`ChampSelection`** monte le `Select` Base UI plutôt qu'un `<select>`
natif, pour deux raisons : c'est le contrôle que la suite sait cibler
(`combobox` nommé puis `option` — le sélecteur de groupe de la grille, que
le lot 14 rencontrera), et il partage l'apparence du combobox
d'`UserSelector`. L'entrée « aucun choix » (`libelleVide`) remet `null`, non
`''` : `type_salle` et `type_mobilite` sont des `*string` côté Go, et la
cellule de liste affiche déjà `—` pour `null`. `items` est passé à Base UI
pour que le déclencheur affiche le libellé, pas la valeur.

**Piège du React Compiler, constaté et consigné** : lire `field.ref` puis
`field.value` dans le même rendu fait tenir tout `field` pour une ref
(`react-hooks/refs` : « Cannot access refs during render »). La `ref` se
destructure **sous un autre nom** (`ref: refChamp`) — commentaire en tête de
`ChampTexte`.

**Ce qui reste MUI dans ces formulaires** : `ChampDate` (lot 12, interdit
de retouche) est un `TextField` MUI — sur TOEIC et Mobilité, il voisine
désormais avec des champs shadcn (libellé flottant contre libellé au-dessus,
hauteur différente ; visible sur les captures d'exploration, §6). Le
raccord de `ChampDate` au `Field` shadcn est le lot suivant naturel.

## 3. Les onze écrans

| Fichier | Avant | Après |
|---|---|---|
| `salle/Salle.tsx` | 5 `TextField` (dont `select` + `MenuItem`), `register` sans `valueAsNumber` | `ChampTexte` ×3, `ChampNombre` (`min={0}`), `ChampSelection` (`libelleVide="—"`) |
| `user/User.tsx` | 4 `TextField`, `FormControl`/`FormGroup`/`Checkbox` | `ChampTexte` ×4 ; les rôles en `FieldSet`/`FieldLegend` + `Checkbox` shadcn, groupe local `ChampRoles` (un seul écran) |
| `user/UserImport.tsx`, `catalog/PeriodeImportButton.tsx`, `catalog/PeriodeExportButton.tsx` | `Tooltip` + `IconButton` | `Tooltip` shadcn + `Button variant="ghost" size="icon"` — le motif de `LanguageSwitcher` |
| `user/CustomCrudUser.tsx`, `catalog/CustomCrudPeriode.tsx` | `Box sx={{ display: 'flex', gap: '1rem' }}` | `div.flex.items-center.gap-4` |
| `catalog/StructureLayout.tsx` | `Box` ×9, `Typography` ×2, `Divider`, `Drawer`, `IconButton`/`Tooltip` ×2, `useMediaQuery`/`useTheme` | `div` + classes, `h6` ×2, `Separator`, `Sheet side="left"`, `Button`/`Tooltip` shadcn, **`useIsMobile()`** |
| `certification/Toic.tsx` | `TextField` ×2, `Typography` | `ChampNombre` (`min`/`max` 0–990), `ChampTexte multiline`, `<p>` |
| `certification/MobiliteInternationale.tsx` | `Grid` ×4, `TextField` ×4, `Switch`/`FormControlLabel`, `MenuItem`, `Typography` | `div.grid.md:grid-cols-2`, `ChampTexte` ×3, `ChampSelection`, `ChampInterrupteur`, `<p>` |

Deux arbitrages sur `StructureLayout` :

- **le seuil « écran étroit » passe de 900 px (`md` MUI) à 768 px** (`md`
  Tailwind, `hooks/use-mobile.ts` — le hook du shell shadcn, réécrit en
  `useSyncExternalStore` au lot 3). Un seul point de rupture pour toute
  l'application ; entre 768 et 899 px l'arbre est désormais un panneau fixe
  au lieu d'un tiroir. Pas de second `useMediaQuery` : l'invariant 12
  interdit une seconde source de résolution du mode, et le même principe
  vaut pour la largeur ;
- le tiroir (`Sheet`) reste **sans croix** (parité `Drawer` : sélection
  d'un nœud, Échap, clic hors panneau le ferment) avec un `SheetTitle`
  `sr-only`. Sa largeur se pose **sous la variante `data-[side=left]`** :
  un `w-80` nu perd face au sélecteur d'attribut du composant, plus
  spécifique — constaté au navigateur (tiroir aux trois quarts de
  l'écran), corrigé, revérifié à 320 px.

## 4. Vérification à l'écran — compte `test-e2e`, build reconstruit

Méthode du lot 11/12 : `make start-scolarite` après chaque commit de code,
et le `src` du script servi comparé à `curl` (le bundle servi contient les
chaînes du lot, `field-error` puis `disabled:opacity-60`). Pilotage MCP,
zéro erreur console sur toute la session.

| Écran / vérification | Résultat |
|---|---|
| **Salle** — création | cinq champs par `<label for>` + `name`, focus sur Nom, capacité pré-remplie « 1 » ; `Select` ouvert : six options (« — » + cinq types), choix « Salle TD » → déclencheur « Salle TD », input caché `TD` ; **création 201, ligne « 25 / Salle TD »** — le défaut du lot 7 est réglé |
| Salle — erreurs | nom vide + capacité `-1` → « Le nom est requis » sur `name`, « La capacité doit être positive » sur `capacite` (`aria-describedby` vérifiés), `aria-invalid` sur les deux, focus sur le premier |
| Salle — édition | valeurs de l'API : « 25 », type affiché « Salle TD » ; capacité retapée « 30 » → garde « Rester » conserve la saisie → enregistrement, ligne « 30 » ; capacité vidée → « expected number, received null » (message zod par défaut, en anglais car la langue l'était — cf. §2) ; remise à la valeur d'origine → Annuler sort **sans** garde (`dirtyFields` vide, comportement de `Form.tsx`) |
| Salle — consultation | les cinq contrôles `disabled`, `Select` compris |
| Salle — sombre / anglais | `.dark` posé, fond de champ token sombre, libellés « Name / Capacity / Room type / Building / Equipment » |
| **Utilisateur** — création | quatre `ChampTexte` (mot de passe `type="password"`, absent en consultation) + neuf cases par rôle et nom (`getByRole('checkbox')`) ; cocher/décocher ; email « pas-un-email » → « Email invalide » sur `email`, focus dessus ; création → compte Keycloak créé (`keycloak_id` en liste) |
| Utilisateur — consultation / édition | cases et champs désactivés, rôles cochés fidèles ; édition pré-remplie ; modification d'un rôle + Annuler → garde « Quitter » : rien n'est écrit ; suppression par la sélection (pas de « Supprimer » au menu de ligne — état antérieur) |
| Utilisateur — import | `aria-label` « Importer des utilisateurs depuis un fichier Excel », `accept=".xlsx"`, le clic ouvre le sélecteur de fichier |
| **Structure** — large | en-tête « Structure » + bouton « Créer une formation » (infobulle vérifiée après ~600 ms, délai Base UI par défaut) ; titre du panneau `h6` 16 px / 400 « Formation — E2E Formation » ; liste des périodes : import/export alignés sur la barre, **export 200** (fichier reçu) |
| Structure — étroit (700 px) | bouton « Ouvrir l'arborescence » ; `Sheet` nommé « Arborescence », arbre dedans, **320 px** après correctif ; sélection d'un nœud le ferme et met le titre à jour ; Échap le ferme |
| **TOEIC** — création | `UserSelector` : recherche « Eleve » → six options serveur, choix, **effacement** (bouton « Effacer ») → champ vide ; score `1000` → « Le score doit être compris entre 0 et 990 » ; date vide → message zod sur `ChampDate` ; création (score 850, 01/09/2026) → ligne |
| TOEIC — édition / consultation / anglais sombre | score « 850 » depuis l'API, retapé « 900 », enregistré ; consultation : champs désactivés, « Test date 09/01/2026 » ; suppression par la sélection |
| **Mobilité** — création (anglais, sombre) | grille deux colonnes ; `Select` « Mobility type » ouvert (quatre entrées) ; `switch` « Validated » `false` → `true` ; fin < début → « The end date must be after the start date » sur la date de fin ; création → ligne « Stage / 01/09/2026 / 20/12/2026 / Yes » |
| Mobilité — édition / consultation (français, clair) | type « Stage » et interrupteur `true` depuis l'API, dates ISO reformatées ; type → « Autre », interrupteur → `false`, Annuler → garde « Rester » ; enregistrement → « Autre / Non » ; consultation : les huit contrôles désactivés ; suppression |

Données : la salle, l'utilisateur (et son compte Keycloak), le résultat
TOEIC et la mobilité de test ont été supprimés depuis l'interface ; la
liste des salles affiche à nouveau « Aucune salle enregistrée. » (l'état
que `salle.spec.ts` exige).

Deux défauts trouvés au navigateur et par rien d'autre, corrigés dans le lot
(commit dédié) : le tiroir aux trois quarts de l'écran (§3) et les cases à
cocher qui paraissaient saisissables en consultation — la case Base UI est
un `<span>`, `disabled:` n'y prend jamais ; le `fieldset`, vrai contrôle
désactivé, porte l'opacité.

## 5. L'état de `composantsTraduits`

**Ce lot ne lui retire aucun consommateur.** Les six `Autocomplete` MUI de
quatre pages annoncés au lot 5 §4 sont tous hors périmètre
(`ReservationDialog` ×3, `NoteEleveAxe`, `GrilleNotes`, `FicheExportModal`)
; TOEIC et Mobilité, cités comme « pages à Autocomplete », n'en montaient
plus depuis la migration d'`UserSelector`. Le mécanisme reste donc entier
dans `layouts/dashboard.tsx` : 6 occurrences, 4 fichiers, 0 dans ce lot. Il
tombera avec les lots note (14/15) et programme (16) ; ses trois clés
(`autocomplete.*`) sont déjà branchées sur `ui/combobox.tsx` et n'auront pas
à bouger.

## 6. Journal des captures — six régénérées, justifiées

Premier run : **6 échecs, tous des captures** (le septième ✘ est le
`test.fail` documenté de `navigation.spec.ts`). Chaque `*-diff.png` regardé
avant toute régénération : la zone en diff est **l'en-tête de l'arbre**
(titre « Structure » en `h6` 14 px / 500 et bouton `icon-sm` à icône
16 px, contre `subtitle2` et `IconButton small` à icône 24 px) et les lignes
de l'arbre décalées de quelques pixels par la nouvelle hauteur de cet
en-tête. Le panneau de droite est pixel-identique.

| Capture | Sort |
|---|---|
| `formation-liste` (clair, sombre) | régénérée — en-tête de l'arbre |
| `menu-actions` (clair, sombre) | régénérée — en-tête de l'arbre ; menu et panneau identiques |
| `menu-compte` (clair, sombre) | régénérée — en-tête de l'arbre ; menu identique |
| `dialogue-suppression-simple`, `dialogue-suppression-confirmation` (×2) | **inchangées** — le flou du fond de modale absorbe le décalage sous le seuil |
| `certification-toeic` (×2) | **inchangées** — la liste vide ne monte aucun champ |
| `grille-saisie`, `planning`, `note-graphique`, `jury-deliberer-dialog` (×2) | inchangées |

Régénération ciblée sur les deux specs (23 tests), six fichiers modifiés,
chaque nouvelle image regardée (clair et sombre) avant commit.

## 7. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip) :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| `mui-material-libs` | 287.05 / 82.39 | 279.72 / 80.52 | **−7.3 / −1.9** |
| `vendor` | 860.45 / 272.95 | 885.95 / 280.54 | **+25.5 / +7.6** (Base UI select/switch) |
| code applicatif (index) | 306.09 / 81.82 | 316.39 / 84.28 | +10.3 / +2.5 (champs, field, StructureLayout) |
| CSS | 91.23 / 14.88 | 103.85 / 16.59 | +12.6 / +1.7 (utilitaires field/select/switch/sheet) |
| `mui-libs`, tanstack, fullcalendar, recharts, runtime | — | — | 0 (hashs identiques) |

**Net sur le fil : +41,1 kB rendus, +9,9 kB gzip.** Dit franchement : ce lot
coûte plus qu'il ne rend. `@mui/material` ne décroît que de 7 kB pour dix
fichiers migrés — la confirmation du lot 11 : le tree-shaking opère au
module, et `TextField`, `Select`, `Switch`, `Drawer`, `Grid` restent tous
importés ailleurs. La contrepartie (Base UI `Select` + `Switch` +
`Field`) est payée une fois ; les ~40 fichiers des lots 14 à 16 n'y
ajouteront rien.

Par paquet (visualizer, tailles rendues ; les écarts de −0,1 kB sur tous les
paquets sont du bruit de minification) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@base-ui/react` | 533.4 | 587.4 | **+54.0** (select, switch) |
| `@mui/material` | 544.0 | 515.7 | **−28.3** |
| code applicatif | 638.7 | 655.6 | +16.9 |
| `recharts` | 576.9 | 566.6 | −10.3 (rééquilibrage de modules partagés, recharts inchangé — même phénomène qu'au lot 12) |
| `react-day-picker` / `date-fns` | 143.9 / 120.2 | 138.5 / 116.6 | −5.4 / −3.6 (idem) |
| `lucide-react` | 45.9 | 42.2 | −3.7 |

## 8. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep @mui/material` sur les onze fichiers | ✅ zéro occurrence (41 importateurs restent dans `src/`) |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 |
| Suite e2e (contre le build du lot, hash vérifié) | make ❌ 6 captures (§6, régénérées) → correctifs §4 + rebuild → **npx ✅ 63 (2,9 min) → make test-ihm ✅ 63 (3,0 min) — deux exécutions consécutives vertes, points d'entrée alternés, contre le build final** |
| Sélecteurs/assertions e2e | zéro modification — treizième lot consécutif |
| Lockfile | **+0 / −0 / 0 montée** — les trois primitives entrent par le CLI, aucune dépendance nouvelle |
| Page témoin `_cohabitation`, `ChampDate` | intacts |
| Données | tout ce qui a été créé pour la vérification a été supprimé (§4) |

Commits : composants partagés → Salle → utilisateurs → catalogue →
certifications → captures → correctifs constatés au navigateur → doc +
CLAUDE.md.

## 9. Ce qui n'a pas été traité

- **`UserSelector` s'ouvre vide en édition** (hors périmètre, lot 5) : sur
  TOEIC et Mobilité en édition, le champ « Rechercher un élève » est vide
  alors qu'un élève est bien sélectionné (`inputValue` initialisé à `''`,
  `UserSelector.tsx:68`, alors que `selectedUser` est reconstruit depuis le
  formulaire). Constaté au navigateur (Mobilité en édition : `eleve: ""`,
  `pays: "Irlande"`) ; la valeur soumise est juste, seul l'affichage
  manque. À corriger avec les Autocomplete des lots note.
- **Colonne « Rôles » vide dans la liste des utilisateurs** alors que la
  consultation montre les rôles cochés : la liste ne semble pas recevoir
  `roles` — colonne non touchée par ce lot, signalé.
- Le message d'un champ numérique requis laissé vide reste celui de zod par
  défaut (§2) : un message métier demande une `error` sur chaque schéma.
- `ChampDate` reste un `TextField` MUI au milieu de champs shadcn (§2).
- Hors périmètre, intacts : `BarreAxes`/rebond Keycloak, désynchronisation
  mode/OS, chemin mort de `NoteControle`, `registre.spec.ts` intermittent
  (aucun échec sur ce lot), échec Go `programme-import`, page témoin.
- `composantsTraduits` : entier (§5).
