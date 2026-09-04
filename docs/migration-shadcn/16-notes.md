# Étape 16 — le workflow note, dernier consommateur applicatif de MUI

Quinze fichiers de `pages/note/` perdent leur import `@mui/material` ; il ne
reste que les cinq fichiers d'infrastructure de cohabitation (lot 17). Le
sujet du lot est double : la grille de saisie — le cœur métier, l'écran le
mieux couvert par la suite — et la dernière mise à l'épreuve du contrat des
champs partagés. Le contrat n'a pas bougé d'une ligne ; il a montré une
limite de plus, restée locale.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire est exact** : quinze `.tsx` de `pages/note/` importaient
  `@mui/material` ; `routes.tsx`, `NoteLayout.tsx`, `useFicheImport.tsx`,
  `RedirectionNoteEleve.tsx` et les `.ts` non. Après le lot, **cinq `.tsx`**
  l'importent encore — `App.tsx`, `main.tsx`, `layouts/dashboard.tsx`,
  `services/ChampDate.tsx`, `pages/_cohabitation/Cohabitation.tsx` — plus la
  couche `mui` d'`index.css`. Tous du lot 17.
- **`GrilleNotesTable` est bien une table écrite à la main** (`Table`,
  `TableHead`, `TableRow`, `TableCell` MUI, largeurs en `sx`), pas une liste :
  ses lignes viennent de l'effectif, chaque ligne s'enregistre seule, l'état
  de rendu et trois `ref` (identités, tentatives, chaînes d'écriture) portent
  la logique. **Rien de cette logique n'est touché** : le diff du fichier
  commence à `if (isLoading)` (rendu) et aux imports ; les 400 premières
  lignes (état, `enregistrer`, `planifier`, `rechargerLigne`,
  `supprimerNote`, `surToucheNote`) sont byte-identiques, à un
  `useId` près.
- **Les trois `Autocomplete` sont les seuls consommateurs de
  `composantsTraduits`**, et ce mécanisme ne couvrait que `openText`,
  `closeText`, `clearText` : le `noOptionsText` de deux d'entre eux
  (`GrilleNotes`, `FicheExportModal`) restait le « No options » anglais de
  MUI, en français comme en anglais. `NoteEleveAxe` seul le passait.
- **`axes.ts` porte ses libellés et ses annonces en chaînes françaises en
  dur** (`AXES[].libelle`, `AXES[].annonce`, depuis l'écran unifié — commit
  bce5297), en violation de la convention i18next. Hors périmètre (un `.ts`
  sans MUI) : signalé en §10 et dans CLAUDE.md, pas corrigé. Constaté au
  navigateur en anglais (§6) — la barre d'axe et l'annonce restent en
  français.
- **Le chemin mort de `NoteControle` (lot 9 §1) est toujours mort** : le mode
  `list` court-circuite vers `GrilleNotes` avant `Crud` ; le formulaire
  d'une note ne se rend que par les routes `create`/`edit`/`show`, que rien
  n'atteint depuis l'écran. Migré pour la parité, non nettoyé.
- **Base UI `ToggleGroup` rend la sémantique du `ToggleButtonGroup
  exclusive`** : `div role="group"` (le `aria-labelledby` passe), boutons
  `aria-pressed`, `multiple` absent → une valeur au plus, reclic sur l'actif →
  liste vide (le `null` de MUI). Vérifié au navigateur : cinq boutons,
  `Période:true` sur l'axe Période, `UE:true` sur l'axe UE, aucun sur une
  liste intermédiaire.
- **Base UI `Combobox` ouvre sa liste au clic sur le champ**
  (`openOnInputClick = true`, `AriaCombobox.js:75`) : le geste des specs —
  `combobox` nommé puis `option` — reste valable sans `showTrigger` cliqué.
- **Base UI `Checkbox` rend un `<span role="checkbox">` plus un `<input>`
  caché** (`aria-hidden`, `tabIndex -1`) dont le `onFocus` renvoie le focus au
  `span` (`CheckboxRoot.js:235`). `getByRole('checkbox', { name })` trouve le
  `span`, `check()` lit `aria-checked` — le geste de `grille-saisie.spec.ts`
  tient.
- **`toggle-group` et `toggle` n'existaient pas dans `components/ui/`** ; ils
  entrent par le CLI shadcn (style `base-nova`, registre joignable), sans
  dépendance nouvelle. Comme `badge` au lot 15, `toggle.tsx` exportait ses
  variantes à côté du composant : `toggle-variants.ts` les porte. Le fichier
  généré portait aussi `||` là où le lint veut `??`, `React.useContext` et
  `<Context.Provider>` (React 19 : `use` et `<Context>`) — corrigés.
- Référence bundle figée avant-lot : build du commit cedca9f (HEAD du lot
  15), mêmes `node_modules`, `vite build` mode production, rapport visualizer
  conservé ; gzip mesuré par le même `gzip -9` des deux côtés.

## 2. Le contrat des champs partagés — verdict final, écran par écran

| Écran | Le contrat a-t-il suffi ? |
|---|---|
| **`Controle`** (formulaire d'un contrôle) | **Oui, mécaniquement** : `ChampTexte` (nom), `ChampNombre` (coeff — plus de `valueAsNumber`), `ChampInterrupteur` (rattrapage), `ChampTexte multiline rows={4}` (remarque). Vérifié en lecture (§6). |
| **`NoteControle`** (formulaire d'une note, chemin mort) | **Presque** : `UserSelector` intact, `ChampInterrupteur` ×2, `ChampNombre` (`step`, `min`/`max` de `bornesNote`), `ChampTexte multiline`. **Un manque** : le `Switch` MUI vidait la note dans son `onChange` ; le contrat n'offre pas de rappel au changement. Réglé **en local** par un effet dérivé de la valeur observée (`useWatch` + `useEffect` → `setValue('note', null)`), consommateur unique sur un chemin mort — même règle que `ChampCouleur` : monte au partagé au second demandeur. |
| **`NoteEleveAxe`** — interrupteur « Tous les élèves » | **Oui** : le `Switch` hors formulaire (`useState`) rejoint le `useForm` déjà présent pour `UserSelector` (`tous_les_eleves: boolean` dans ses `defaultValues`), `ChampInterrupteur` + `useWatch`. Même geste qu'au lot 15 pour les interrupteurs du jury, sans formulaire nouveau. `className="mb-0 w-auto"` pour tenir en ligne à côté du sélecteur. |
| **Les trois `Autocomplete`** (groupe ×2, élève de la période) | **Hors contrat, par nature** : ce ne sont pas des champs de formulaire — un choix d'écran (groupe mémorisé en `sessionStorage`, élève porté par l'URL). `Combobox` shadcn + `Label htmlFor` (motif `UserSelector`, lot 14) : `items`, `itemToStringLabel`, `isItemEqualToValue`, `value` à référence stable (l'objet vient du tableau de la requête ou d'un `useMemo`), `showClear`, `Spinner` dans l'`InputGroupAddon` pendant le chargement. |
| **`GrilleNotesTable`** — cellules de saisie | **Hors contrat, par nature** : pas de react-hook-form, une valeur par ligne dans l'état de la grille. `Input` nu à `aria-label` (note, remarque), `Checkbox` nu à `aria-label` (N.É., validée). L'erreur de ligne : `aria-invalid` + `<p>` sous le champ relié par `aria-describedby` — ce que `ChampTexte` fait pour un champ de formulaire, refait ici à la main parce que le message vient de l'état de la ligne, pas d'un `fieldState`. |
| **`NoteChartModal`**, **`ConfirmerSuppressionNote`**, **`FicheExportModal`** | **Aucun champ de formulaire** : onglets, cartes, un combobox (ci-dessus), boutons. La confirmation de suppression n'a pas de saisie. |

**Ce que le lot ajoute au socle, sans toucher au contrat** : `ComboboxEmpty`
porte un libellé traduit par défaut (`autocomplete.aucuneOption`, fr/en)
quand on ne lui passe pas d'enfant — la troisième chaîne que
`composantsTraduits` aurait dû porter et ne portait pas. `UserSelector` et
l'axe Élève gardent leur libellé explicite.

**Verdict final** : cinq lots (12 à 16), vingt-cinq écrans de formulaire, une
signature inchangée depuis le lot 13 (`name`, `control`, `label`,
`disabled`, plus les optionnels `aide` et `formater` du lot 15). Quatre
présupposés découverts en cours de route — react-hook-form requis (14),
`ChampCase` (14), `defaultValue: ''` (15), et ici **l'absence de rappel au
changement** (16) — dont un seul a coûté une ligne au composant (`''`). Ce
qui est resté local, et pourquoi : `ChampRoles` (User), `ChampMultiple`
(Réservation), `ChampCouleur` (Matière), l'effet de `NoteControle`, les
cellules de la grille, les saisies de confirmation (suppression, purge). Le
contrat couvre le formulaire ; il ne prétend pas couvrir la grille ni le
choix d'écran, et n'a pas eu à le faire.

## 3. Les neuf petits fichiers

| Fichier | Avant | Après |
|---|---|---|
| `AxeCalcule` | `Box` ×2, `Alert info outlined icon={false}` | `div.flex.h-full.flex-col.gap-2.p-2`, **`AnnonceAxe`** (nouveau, 20 l.) |
| `AnnonceAxe` (nouveau) | — | `Alert variant="info"` à contour seul (`border-info/50 bg-transparent py-1`), `AlertDescription` en `text-foreground` : la transposition de l'`outlined` sans icône, partagée par les trois écrans qui la recopiaient (`AxeCalcule`, `GrilleNotes`, `NoteEleveAxe`) |
| `CelluleNote` | `Typography body2`, `Box inline-flex`, `Chip outlined secondary`, `Box` visually-hidden | `span.text-sm.text-muted-foreground`, `span.inline-flex.gap-1.5`, `Badge variant="outline"`, `span.sr-only` |
| `NoteMatiere`, `NoteUniteEnseignement`, `NotePeriode` | `Alert severity="error"` du garde ; `Typography` d'absence (Période) | `Alert variant="destructive"` + `CircleAlert` + `AlertDescription` ; `span.text-sm.text-muted-foreground` |
| `NoteChartButton` | `Box` + `Tooltip` + `IconButton` | `Tooltip` + `Button ghost icon` à icône nue (motif lot 13/15) ; le `Box` d'enveloppe, sans effet, tombe |
| `FicheImportButton` | `Tooltip` + `IconButton` | idem |
| `BarreAxes` | `Box`, `Typography body2`, `ToggleButtonGroup exclusive size="small"` | `div.flex.flex-wrap.items-center.gap-3.border-b.px-4.py-2`, `span#libelle-axe-notes`, **`ToggleGroup variant="outline" size="sm" spacing={0}`** à `aria-labelledby` ; `onValueChange` lit `segments[0]`, ignore la liste vide (le reclic) — logique de navigation inchangée. **Le défaut de rendu figé n'a pas disparu** : reproduit une fois au pilotage MCP (URL passée à `/ue`, entête « GPA délibéré » encore affiché, `cliquerPuisAttendreUrl` l'absorbe) — sa cause n'est donc pas dans le `ToggleButtonGroup` |
| `FicheExportModal` | `Dialog` MUI `maxWidth="sm"`, `Autocomplete` + `TextField` + `CircularProgress` en adornement, `Button contained` à `startIcon` | `Dialog` shadcn sans croix, `sm:max-w-[600px]`, `Combobox` + `Label` + `Spinner` en `InputGroupAddon`, `ComboboxEmpty` par défaut, `Button` + `Spinner`/`FileDown` ; `handleClose` vide la sélection comme avant (vérifié : rouvrir → champ vide) |

## 4. `Controle`, `GrilleNotes`, `NoteControle`, `NoteEleveAxe`, `NoteChartModal`

| Fichier | Avant | Après |
|---|---|---|
| `Controle` | `TextField` ×3 (`register`, `valueAsNumber`, `error`/`helperText`), `FormControlLabel`/`Controller`/`Switch`, `Typography` | les quatre champs partagés (§2), `<p>` ; `register`/`errors` ne sont plus destructurés |
| `GrilleNotes` | `Paper p={2}` + `Stack spacing={2}`, `Typography h6`, `Chip` ×3 (`warning` pour Rattrapage), `Autocomplete`, `Typography body2/caption`, `Tooltip`/`IconButton`, `Alert` ×3 | **`Card className="px-4"`** (le `py` et le `gap` de la carte valent le `p={2}`/`spacing={2}`), `h6.text-lg.font-medium`, `Badge secondary` ×2 + `Badge` aux classes d'avertissement du jury (fond /15), `Combobox` « Groupe » nommé par `Label`, `p.text-sm[aria-label]` + `span.text-xs.text-muted-foreground`, `Tooltip` + `Button ghost icon`, `AnnonceAxe`, `Alert destructive`/`info` à icône |
| `NoteControle` | `TextField` ×2, `FormControlLabel`/`Switch` ×2 (dont le `setValue('note', null)`), `Box`, `Typography`, `Skeleton` | champs partagés (§2), `div.flex.items-center.gap-4`, `<p>`, `Skeleton className="h-[400px] rounded-lg"` (précédent `Crud.tsx`) |
| `NoteEleveAxe` | `Autocomplete`, `FormControlLabel`/`Switch` en `useState`, `Tabs scrollable` + `Tab`, `Paper outlined`, `Table` MUI ×N, `Chip` ×5, `Typography`, `Box`, `Stack` | `Combobox` « Élève de la période » (nom par `Label`), `ChampInterrupteur` (§2), **`Tabs` shadcn `variant="line"`** dans un `div.overflow-x-auto.border-b.px-2.py-1` (le dégagement de `BarreWorkflows`, lot 5 — vérifié sans ascenseur), valeur = rang de la période (`typeof valeur === 'number'` garde le `any` de Base UI), `div.rounded-xl.border.bg-card`, **primitives `ui/table`** (`table-fixed`, largeurs en `w-[28%]`…), `Badge` (`default`/`secondary` pour les GPA, `secondary` ECTS, `outline`/`secondary`/succès pour le type), `sr-only` pour l'origine du rattrapage |
| `NoteChartModal` | `Dialog maxWidth="lg"`, `DialogContent dividers` à 600 px, `Grid` + `Card outlined` ×5 + `Typography` (couleurs `primary.50`, `success.main`, `error.main`), `Tabs`/`Tab` + `CustomTabPanel`, `Paper elevation={3}` du tooltip, `Button contained` | `Dialog` shadcn `sm:max-w-[1200px]` à hauteur bornée (lot 14), corps `h-[600px] max-h-full overflow-y-auto border-t`, **`CarteKpi`** (`Card size="sm"`, `text-2xl`, `bg-primary/5` + `text-primary` / `text-success` / `text-destructive`), `Tabs line` + `TabsContent h-full pt-6` (panneaux non montés inactifs, comme le `hidden` MUI), tooltip en `div.bg-popover.shadow-md`, `Button`. **`useCouleursGraphique`, `lireCouleurs` et les trois `isAnimationActive={false}` sont inchangés au caractère** (`git diff -w` sur `couleurs.`, `stroke=`, `fill=` : vide) |

## 5. La grille — ce que rend le nouveau balisage

`GrilleNotesTable` reste ce qu'elle était : une table écrite à la main, sur
les **primitives fines de `components/ui/table.tsx`** (`Table`, `TableHeader`,
`TableRow`, `TableHead`, `TableBody`, `TableCell` — des enveloppes
`<table>`/`<tr>`/`<th>`/`<td>` + classes, sans moteur), **pas sur le socle
`DataTable`**. La structure est la même colonne pour colonne, la largeur des
colonnes en classes (`w-[140px]`, `w-[90px]`…), le survol de ligne porté par
`TableRow` (`hover:bg-muted/50`, l'ancien `hover`).

Rôles ARIA rendus, relevés au navigateur sur le groupe E2E (quatre élèves,
contrôle continu) :

| Rôle / attribut | Rendu |
|---|---|
| `table` | `<table aria-label="Grille de saisie des notes">` — un seul, nommé (`captures.spec.ts`, `hierarchieE2E.ts`) |
| `row` | 5 (entête + 4), nom accessible calculé du contenu → `getByRole('row', { name: /Eleve2 E2E/ })` le trouve et **contient le message de ligne** (« La note doit être comprise entre 0 et 20 » — `grille-saisie` test 2) |
| `columnheader` | 6 (`th` natifs) : Élève, Note (/20), N.É. (infobulle « Non évalué » au survol, déclencheur rendu en `span`), Remarque, État, Actions — 7 en rattrapage (Validée) |
| `cell` | 24 (4 × 6) |
| `textbox` | 8, nommés `Note de X` / `Remarque pour X` par `aria-label` sur l'`<input>` ; `disabled` natif (lecture seule, non évalué) → `toBeDisabled()`/`toBeEnabled()` |
| `checkbox` | 4 (7 en rattrapage), `<span role="checkbox" aria-checked>` Base UI nommé par `aria-label` ; l'`<input>` caché est `aria-hidden`, un seul élément par nom |
| message de ligne | `<p id>` sous le champ, `aria-invalid="true"` + `aria-describedby` sur l'`<input>` — le `TextField error/helperText` ne reliait rien |
| indicateurs d'état | `Spinner` (`role="status"`, `aria-label` par élève), `svg[aria-label="Note enregistrée pour X"]` (`grille-saisie` test 1), `span[role="img"][aria-label]` pour le point orange, `button[aria-label]` pour Réessayer / Recharger |
| menu de ligne | `button[aria-label="Actions — X"]` (inchangé, `MenuActionsLigne`) |

Le comportement — clavier compris — est vérifié en §6 : Entrée/Tab
descendent, Échap restaure, `blur` enregistre une fois, hors-barème sans
requête, conflit et réseau sur la ligne.

## 6. Vérification à l'écran — compte `test-e2e`, build reconstruit

Méthode des lots 12–15 : `make start-scolarite` après le dernier commit de
code, `src` du script servi comparé à `curl` (`index-BH79Y_L1.js`, puis
`index-g72Z1Ykc.js` après le correctif de focus), chaînes du lot cherchées
dans le JS servi (`toggle-group-item`, `aucuneOption`,
`requestAnimationFrame`). Pilotage MCP ; l'export de fiche et la lecture
seule par deux scripts Playwright autonomes (le pilote MCP coupe la
connexion à chaque téléchargement, lot 15 ; la lecture seule demande un autre
compte).

| Écran / vérification | Résultat |
|---|---|
| **Barre d'axe** | `div[role=group][aria-labelledby=libelle-axe-notes]`, cinq `button[aria-pressed]`, `Période:true` sur l'axe Période ; clic UE → URL `/ue` ; sur les listes intermédiaires aucun bouton pressé (le `null` de MUI). Le **rendu figé** s'est produit une fois (URL `/ue`, entête « GPA délibéré » encore à l'écran) — pré-existant, non disparu |
| **Axes UE / Matière / Contrôle** | entêtes « UE », « Matières », « Contrôles » ; sur UE zéro `textbox`/`checkbox` ; ligne Eleve3 « Non évaluée », ligne Eleve2 « 8,00 Rattrapage » + phrase `sr-only` (les assertions de `notes-unifie`) |
| **Grille — saisie** | `13,5` + Entrée → **PUT**, coche verte `svg[aria-label]`, focus descendu sur « Note de Eleve2 E2E » ; `25` + Entrée → message dans la ligne, `aria-invalid`, `aria-describedby` → le message, **zéro requête**, bouton « Réessayer » ; Échap → `14` restauré, `aria-invalid` retiré |
| Grille — **« non évalué »** | décocher : case `false`, champ actif, point orange « Modification non enregistrée », compteur 3/4 ; **premier build : le focus restait sur la case** (souris et clavier) — **build corrigé : focus sur le champ de note**, souris et Espace, `9` + Entrée → enregistré, 4/4 ; recocher → PUT, champ vidé et désactivé |
| Grille — **suppression** | menu « Voir les notes de l'élève / Supprimer la note » ; modale « Supprimer la note ? » (« La note de **Eleve1 E2E** (noté 13,5) sera définitivement supprimée… », conseil N.É.), **focus sur Annuler** ; Supprimer → **DELETE …/bulk**, champ vidé, 3/4, toast « Note de Eleve1 E2E supprimée. » (`notifyUndone` : l'annonce d'un geste d'annulation, sans bouton de retour — comme au jury) ; le menu de la ligne sans note n'offre plus « Supprimer » |
| Grille — **conflit de version** (deux onglets) | onglet 2 : `15` enregistré ; onglet 1 : `16` + Entrée → **409**, message « Cette note a été modifiée ailleurs… », `aria-invalid`, infobulle du bouton « Recharger la ligne » ; Recharger → `15`, ligne propre ; remise à `14` |
| Grille — **réseau indisponible** (`route.abort`) | « Serveur injoignable. La saisie est conservée, relancez l'enregistrement. » dans la ligne, valeur `11` conservée, `aria-invalid`, infobulle ; réseau rendu → « Réessayer » → **enregistrée** |
| Grille — **effectif vide / introuvable** (`route.fulfill` `[]` puis 500) | sans groupe : « Choisissez un groupe… », pas de table ; `[]` : « Ce groupe ne compte aucun élève rattaché à ce contrôle. », `0/0` ; 500 (tenu 9 s, les trois tentatives de TanStack Query) : « Impossible de charger l'effectif du groupe. » / « Unable to load the group's roster. » ; retour normal 4/4 ; groupe mémorisé (`note_grille_groupe_651`) |
| **Graphique** | modale 1120 × 656, titre, cinq `CarteKpi`, trois onglets `aria-selected`, chaque panneau 373 px avec son tracé (courbe, 20 barres, 1 point) ; Fermer. Depuis la grille (les lignes de l'effectif) — le `lignesVisibles` des axes calculés est celui du lot 9, non modifié |
| **Export de fiche** (script autonome) | « Télécharger » désactivé sans groupe, actif après ; **GET 200 `…spreadsheetml.sheet`**, `fiche_651.xlsx` ; depuis la liste des contrôles, l'entrée de menu « Exporter la fiche » ouvre la même modale (MCP, sans télécharger) ; Annuler puis rouvrir → sélection vidée |
| **Import** | bouton « Importer les notes depuis Excel » (`accept=".xlsx"`), absent en lecture seule. Le dialogue des lignes refusées (`LignesRefuseesDialog`, services, non touché) est couvert par `import-erreurs.spec.ts` (§8) : tableau, deux lignes, motifs — pas rejoué au pilote (le sélecteur de fichier bloque le `run_code`, lot 13) |
| **Axe Élève** | « Élève de la période » (`combobox` nommé par `Label`), quatre options ; choix → URL `/eleve/1408/note`, fil « Élève : Eleve1 E2E », onglet « E2E Periode » sélectionné, « Aucun GPA… », `h6` « E2E UE1 » + Badge « 5 ECTS », table 5 colonnes, 2 lignes (continu 14,00 Normal ; rattrapage 11,00 « Rattrapage validé » + `sr-only`) ; **« Tous les élèves »** (`switch` nommé) → `UserSelector` remplace le combobox, recherche « Eleve2 » → URL `/eleve/1409` ; retour → combobox resynchronisé sur « Eleve2 E2E » |
| **Contrôles — formulaire** | menu de ligne → Voir : « Nom du contrôle », « Coefficient » (`type=number`), « Rattrapage » (`switch` désactivé), « Remarque » (`textarea`), tous `disabled` (traversée en lecture), « Retour » |
| **Lecture seule** (compte `test-lecture`, script autonome) | 8 `textbox` et 4 `checkbox` désactivés, « Consultation seule : la saisie demande le rôle d'écriture des notes. », boutons graphique + export **sans import**, colonne Actions avec le seul « Voir les notes de l'élève », 4/4 |
| **Sombre + anglais** (grille, graphique, export, suppression, axe Élève) | `.dark` posé ; corps `rgb(18,18,18)`, carte et champs aux tokens ; « View », « Group », « Entered: 4/4 », « Grade (/20) », « N.A. », « Status », « Show grades chart », « Class results analysis », « Pass Rate », « Export grade sheet », « Student group », « Delete this grade? », « Student of the period », « All students », « Passed resit », « Unable to load the group's roster. » — **sauf la barre d'axe et l'annonce, en français** (`axes.ts`, §1/§10) |
| Console | 0 erreur applicative sur toute la session — les erreurs réseau sont le 409 provoqué, les `ERR_CONNECTION_FAILED` et les 500 substitués. **Trois avertissements recharts** « width(-1) and height(-1) » à l'ouverture de la modale (mesure de `ResponsiveContainer` pendant l'entrée du popup) ; les trois panneaux se tracent ensuite à 373 px — observé, non arbitré contre l'ancien build |

Données : notes remises (Eleve1 sans note, Eleve2 14, Eleve3 et Eleve4 non
évalués — l'état laissé par la suite précédente ; le seed du prochain run
repose le sien), aucun export ni import écrit.

**Un défaut trouvé au navigateur et par rien d'autre**, corrigé dans le lot
(commit dédié) : décocher « non évalué » ne rendait pas la main au champ de
note — `focus()` est appelé dans le rappel de la case, alors que le champ
porte encore `disabled` (React n'a pas rejoué le rendu), donc ne fait rien ;
la grille diffère le focus après le rendu (`requestAnimationFrame`). Le
`Checkbox` MUI avait la même mécanique (déduit par lecture : `onChange`
synthétique, rendu après le gestionnaire) ; l'ancien build n'a pas été
relancé pour le prouver. Le quatorzième sur seize lots.

## 7. Journal des captures — quatre régénérées, justifiées une par une

Premier run (`make test-ihm`, contre le build final `index-g72Z1Ykc.js`) :
**4 échecs, tous des captures** (59 ✅, le cinquième ✘ est le `test.fail`
documenté de `navigation.spec.ts`) ; `registre.spec.ts` est passé. Les
59 tests de rôles, textes et gestes — `grille-saisie` (4), `notes-unifie`
(6), `import-erreurs`, `droits`, `captures-ouvertes` — sont verts **sans
qu'un sélecteur ni une assertion ait bougé** : le filet a tenu au
seizième lot. Chaque `*-actual.png` et `*-diff.png` regardé avant toute
régénération :

| Capture | Sort |
|---|---|
| `grille-saisie` (clair, sombre) | **régénérée, attendu** — tout l'écran est du périmètre : barre d'axe en groupe de bascule à contour, annonce à contour seul, pastilles `Badge` (Coeff., Barème, Rattrapage en teinte d'avertissement), combobox « Groupe » à libellé au-dessus (le libellé flottant disparaît, comme au lot 15 pour « Titre de la formation »), table nue (entêtes en `text-muted-foreground`, champs de 32 px au lieu de 40, cases Base UI 16 px), boutons d'action à 16 px. Les valeurs (11 validée, 7, deux vides, 2/4) sont celles du seed |
| `note-graphique` (clair, sombre) | **régénérée — et elle devait bouger**, contrairement à l'attente de départ : la capture est une page entière, et le chrome de la modale est du périmètre (titre 16 px sans le padding MUI, cartes `Card size="sm"`, onglets shadcn en casse normale sous un filet, pied en bande `bg-muted/50`, « Fermer » 32 px). **Le tracé, lui, est le même** : couleurs des tokens, courbe, points, ligne de moyenne en pointillés, graduations, libellés inclinés — le `diff.png` ne montre que le décalage vertical de ~24 px dû à l'en-tête et aux cartes plus bas. Rien n'a changé dans `useCouleursGraphique` ni dans les props recharts (§4) |
| `formation-liste`, `certification-toeic`, `planning`, `jury-deliberer-dialog` (×2 chacune), les huit de `captures-ouvertes` | **inchangées**, byte-identiques (`git status` après `--update-snapshots` ciblé sur `captures.spec.ts` : quatre fichiers modifiés, pas un de plus) |

Régénération ciblée (`npx playwright test captures.spec.ts
--update-snapshots`, 15 tests), chaque nouvelle image regardée (clair et
sombre) avant commit.

## 8. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip, les tailles que `vite build` imprime, même mode des deux côtés) :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| `mui-material-libs` | 259.08 / 75.51 | 139.06 / 40.03 | **−120.0 / −35.5** |
| `mui-libs` | 77.80 / 28.42 | 72.75 / 26.92 | −5.1 / −1.5 |
| `vendor` | 891.04 / 282.52 | 893.54 / 283.27 | +2.5 / +0.8 (toggle, toggle-group, panneaux d'onglets Base UI) |
| code applicatif (index) | 324.67 / 86.15 | 328.10 / 86.11 | +3.4 / 0.0 |
| CSS | 111.49 / 17.85 | 116.07 / 18.39 | +4.6 / +0.5 (utilitaires table, toggle, cartes KPI) |
| tanstack, fullcalendar, recharts, runtime | — | — | 0 (fullcalendar et runtime au hash identique ; recharts et tanstack au kB identique, hash changé par le graphe de modules) |

**Net sur le fil : −118 kB rendus, −35 kB gzip.** C'est le premier lot où la
décrue est nette, et franchement : elle ne vient pas de Base UI qui se
rentabiliserait, elle vient de MUI qui perd d'un coup `Autocomplete`,
`Popper`, `Dialog`, `Tooltip`, `Tabs`, `Table`, `Checkbox`, `Chip`,
`Skeleton`, `ToggleButtonGroup` — tout ce que `pages/note/` était seul à
importer encore. Base UI, lui, **grossit** (+7 kB rendus) : la contrepartie
des lots 13–15 (+41, +1,3, −1,3) n'est toujours pas rentabilisée par elle
seule ; ce qui la rentabilise, c'est la dépose. Il reste 139 kB de
`mui-material-libs` (`TextField` de `ChampDate`, `ThemeProvider`,
`CssBaseline`, `createTheme`, `useColorScheme`, `useMediaQuery`, la page
témoin) et 73 kB de `mui-libs` (`@mui/system`, `@mui/utils`, Emotion) : le
lot 17 les enlève d'un bloc.

Par paquet (visualizer, tailles rendues) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/material` | 473.5 | 271.8 | **−201.7** |
| `@popperjs/core` | 51.7 | 0 | **−51.7** (sortait avec `Autocomplete`/`Tooltip`) |
| `@mui/system` | 103.2 | 91.8 | −11.4 |
| `@mui/utils` | 24.4 | 23.8 | −0.7 |
| `@base-ui/react` | 602.1 | 609.2 | +7.1 (toggle, toggle-group, tabs panel) |
| code applicatif | 668.6 | 671.8 | +3.2 |
| tous les autres | — | — | 0 (`recharts` 566.6, `react-dom` 464.1, `@fullcalendar/core` 281.2… identiques au dixième de kB) |

Lockfile : **+0 / −0 / 0 montée** — `package.json` et `package-lock.json`
sont byte-identiques à cedca9f ; `toggle`/`toggle-group` entrent par le CLI.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep @mui` sur `front/src` | ✅ **zéro dans `pages/note/`** ; cinq `.tsx` importateurs restent (`App`, `main`, `layouts/dashboard`, `services/ChampDate`, `_cohabitation/Cohabitation`) + `index.css` — tous du lot 17 |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 |
| Suite e2e (contre le build du lot, hash du script servi vérifié par `curl` à chaque étape, conteneurs plus anciens que les runs) | make ❌ 4 captures (§7, régénérées) → **npx ✅ 63 (3,0 min) → make test-ihm ✅ 63 (2,9 min) — deux exécutions consécutives vertes, points d'entrée alternés, contre le build final** (`index-g72Z1Ykc.js`) ; `registre.spec.ts` vert trois fois |
| Sélecteurs/assertions e2e | **zéro modification — seizième lot consécutif** ; `grille-saisie` (4), `notes-unifie` (6), `import-erreurs`, `droits`, `captures`, `captures-ouvertes` traversent la grille, les axes et le sélecteur d'élève tels quels. La dépendance d'ordre 1 → 3 → 4 de `grille-saisie` s'est rejouée trois fois |
| Ce que chaque test de `grille-saisie` garantit encore | 1 : `textbox` nommé + Entrée → `svg[aria-label="Note enregistrée…"]`, valeurs relues après rechargement et re-choix du `combobox` « Groupe » → `option` ; 2 : message dans la `row` nommée, aucune requête ; 3 : `checkbox` nommée `check()` → `textbox` `toBeDisabled` + vide ; 4 : « 4/4 » exact — aucun n'a changé de cible |
| Lockfile | **+0 / −0 / 0 montée** — `toggle`/`toggle-group` entrent par le CLI shadcn |
| `App.tsx`, `main.tsx`, `layouts/dashboard.tsx`, `services/ChampDate.tsx`, `pages/_cohabitation/`, couleurs et animation de `NoteChartModal`, `BarreAxes` (défaut), chemin mort de `NoteControle`, `@mui/material` dans `package.json` | intacts (aucune ligne modifiée, sauf `NoteChartModal` autour du tracé et `BarreAxes` pour le seul rendu) |
| `composantsTraduits` | zéro consommateur, **présent** dans `layouts/dashboard.tsx` (lot 17) |
| Données | notes du groupe E2E remises à un état équivalent, seed reposé par chaque run ; un `.xlsx` téléchargé par le script d'export, aucun import écrit |

Commits : ui (toggle-group, ComboboxEmpty, clé i18n) → neuf petits fichiers →
BarreAxes → FicheExportModal → Controle → GrilleNotes → NoteControle →
NoteEleveAxe → NoteChartModal → GrilleNotesTable → correctif constaté au
navigateur (focus) → captures → doc + CLAUDE.md.

## 10. Ce qui n'a pas été traité

- **`axes.ts` : libellés et annonces en français en dur** (§1) — hors
  périmètre, consigné dans « Défauts constatés, non corrigés » de CLAUDE.md
  avec la correction attendue (fermetures `() => traduire(...)`).
- **Le rappel au changement d'un champ partagé** reste hors contrat ; l'effet
  local de `NoteControle` est son seul demandeur, sur un chemin mort.
- **Le chemin mort de `NoteControle`** (colonnes, surcharge, modale) : migré,
  non nettoyé — décision à prendre hors migration.
- **Les avertissements recharts à l'ouverture de la modale** (§6) : observés,
  sans effet visible ; à confronter à l'ancien build si quelqu'un veut
  trancher s'ils datent du lot ou de `ResponsiveContainer` lui-même.
- **`composantsTraduits`** : zéro consommateur, **non supprimé** (lot 17,
  `layouts/dashboard.tsx`). Idem `ChampDate` (`TextField` MUI sous
  react-day-picker), la page témoin, `App.tsx`, `main.tsx`.
- **`@mui/material` reste dans `package.json`** : quatre fichiers hors
  périmètre l'importent (cinq avec la page témoin).
- **La dépendance d'ordre de `grille-saisie.spec.ts`** est intacte ; aucun
  test n'a été touché.
- Hors périmètre, intacts : rendu figé de `BarreAxes` (reproduit, §6),
  rebond Keycloak, colonne « Rôles », `UpdateToeic`, message zod d'un nombre
  requis, `registre.spec.ts` intermittent, mode ≠ OS.
