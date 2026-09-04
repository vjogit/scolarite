# Étape 15 — structure, jury, corbeille et registre

Dix-neuf fichiers dans quatre dossiers perdent leur import `@mui/material` ;
`pages/note/` (lot 16) reste seul devant. Le sujet du lot est le contrat des
champs partagés, mis à l'épreuve une troisième fois avant le plus gros lot :
deux props optionnelles le prolongent, un présupposé de plus se révèle, et
la signature ne bouge pas.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire est exact** : dix-neuf fichiers importaient `@mui/material`
  (structure 11 dont `arbre/ArbreStructure.tsx`, jury 6, corbeille 1,
  registre 1) ; `def.tsx`, `routes.tsx`, `JuryLayout.tsx`, `service.ts`
  n'en importaient pas. Après le lot, **20 fichiers `.tsx`** l'importent
  encore : les 15 de `pages/note/`, plus `App.tsx`, `main.tsx`,
  `layouts/dashboard.tsx`, `_cohabitation/Cohabitation.tsx` et
  `services/ChampDate.tsx` (et `index.css`, par sa couche `mui`). Les
  « 20 importateurs, tous dans note » annoncés comptaient large : cinq sont
  l'infrastructure de cohabitation, qui tombe à la dépose finale.
- **Structure est bien du formulaire, à un champ près** : `TextField` ×7,
  mais aussi un `<input type="color">` natif enregistré par `register`
  (`Matiere.tsx`), le seul de l'application (zéro autre occurrence dans
  `src/`, `pages/note/` compris). Et Promotion porte deux champs dont la
  valeur API n'est pas de la forme saisie (échelles en tableau de nombres,
  saisies `a=4,b=3.5,…`), plus un `helperText` **hors erreur** (`baremeAide`)
  — deux besoins que le contrat du lot 13 ne couvrait pas.
- **Les deux `Switch` du jury ne sont pas dans un formulaire** :
  `useState(true)` dans `DelibererBulkDialog`, `useState(compteCumulActuel
  ?? true)` rejoué à l'ouverture dans `DelibererButton` ; les neuf
  `TextField` de `JuryBulletinsExportModal` sont un `useState` d'objet. Le
  contrat suppose react-hook-form (lot 14) : c'est le second présupposé, et
  il se rejoue ici trois fois.
- **Salle porte `name: ''` dans son `emptyValue`, aucun formulaire de
  structure ne le fait** (`{ id: -1, version: -1, … }` seulement). Lu avant
  le lot sans en tirer la conséquence ; le navigateur l'a tirée (§2, §6).
- **Corbeille et registre partagent leur inventaire à l'unité près** (`Card`,
  `CardActions`, `CardContent`, `Stack`, `Alert`, `CircularProgress`,
  `TextField`, `Button`) et leur en-tête (`h5` + `body2`). Les deux fumées
  e2e y ancrent des rangs de titre : `registre.spec.ts` demande le `h5`
  (`level: 5`) et des `heading` pour les trois cartes ; `carteCorbeille`
  (`hierarchieE2E.ts`) isole une carte par un `div` contenant à la fois un
  `heading` et le bouton « Purger », puis `.last()` — le `<div>` de la
  carte shadcn est bien le plus profond des deux.
- **Le registre e2e compte exactement deux `role="alert"`** ; `FieldError`
  du contrat en pose un aussi, mais seulement en erreur : le passage du
  témoin sur react-hook-form n'en ajoute aucun au repos.
- **`Card` et `Badge` n'existaient pas dans `components/ui/`** ; ils
  entrent par le CLI shadcn, comme `field`/`select`/`switch` (lot 13) et
  `progress` (lot 14), sans dépendance nouvelle. `badge.tsx` exportait ses
  variantes à côté du composant, ce que le lint du rechargement à chaud
  refuse : `badge-variants.ts` les porte, sur le modèle de
  `button-variants.ts`.
- **Base UI sait rendre un bouton inerte mais atteignable**
  (`focusableWhenDisabled`, `Button.d.ts:21`) : un `disabled` natif n'émet
  ni survol ni focus, l'infobulle ne s'ouvrirait jamais — MUI l'enveloppait
  d'un `<span>` pour la même raison.
- **Le `TooltipTrigger` rendu par un `Badge` perd `data-slot="badge"`**
  (`mergeProps`, dernier gagnant) : un sélecteur `[data-slot=badge]` ne
  trouve pas les pastilles à infobulle. Aucun test ne s'en sert ; noté pour
  qui voudrait en écrire un.
- Référence bundle figée avant-lot : build du commit 93db759 (lot 14),
  mêmes `node_modules`, `vite build` mode production, rapport visualizer
  conservé ; gzip mesuré par le même `gzip -c | wc -c` des deux côtés.

## 2. Le contrat des champs partagés — verdict, workflow par workflow

| Workflow | Le contrat a-t-il suffi ? |
|---|---|
| **structure — Formation, Option, Groupe, Période** | **Oui, mécaniquement** : un `ChampTexte` chacun (Période garde ses deux `ChampDate` du lot 12 tels quels). |
| **structure — UE** | **Oui** : `ChampTexte` + `ChampNombre` + `ChampInterrupteur` (`FormControlLabel` + `Switch` ×1 couvert, comme annoncé). |
| **structure — Matière** | **Presque** : trois champs partagés, et **la couleur reste locale** (`ChampCouleur`, `useController` + `<input type="color">`, vingt lignes) — le seul écran à en monter un, même règle que `ChampRoles` (User, lot 13) et `ChampMultiple` (Réservation, lot 14). Elle monte au partagé le jour où un second écran la demande. |
| **structure — Promotion** | **Non, sur deux points, réglés dans le contrat** : `aide` (le `helperText` hors erreur du barème) et `formater` (échelles tableau → chaîne). `ChampInterrupteur` couvre le second `Switch` (sa valeur `null` de l'API vaut « décoché », `checked={valeur === true}`). Les `ChampDate` intacts. |
| **jury — délibération simple et groupée** | **Non tel quel** : les deux `Switch` étaient hors formulaire. Traité comme au lot 14 — `useForm` à `defaultValues`, formulaire monté dans le popup (Base UI démonte à la fermeture, chaque ouverture repart de `compteCumulActuel ?? true` sans `setState` rejoué) — puis `ChampInterrupteur` avec **`aide`** pour la légende « Décocher si… » que les deux modales glissaient sous le libellé à la main. |
| **jury — bulletins** | **Oui, une fois sur react-hook-form** : neuf `ChampTexte`. Le `useForm` vit au niveau de la modale, pas dans le popup : les paramètres saisis survivent à Annuler puis rouvrir, comme l'état de la modale MUI qui restait montée (vérifié §6). |
| **corbeille — purge** | **Hors contrat, par précédent** : la saisie de confirmation reste `Label` + `Input` nus sous `initialFocus`, exactement `DeleteConfirmDialog` (lot 4). Ce n'est pas un formulaire, il n'y a pas de schéma. |
| **registre — témoin** | **Oui, une fois sur react-hook-form** : deux `ChampTexte multiline` (chasse fixe par `className`). Les deux effets « effacer le verdict et le nom de fichier à la frappe » deviennent des **dérivations** des valeurs observées (`useWatch`) : le nom reste tant que le jeton est celui du fichier, le verdict tant que jeton et certificat sont ceux vérifiés. |

**Ce qui s'étend, sans changer de signature** (`PropsChampBase` gagne une
prop optionnelle, `PropsChampTexte` une seconde ; les quinze écrans déjà
livrés n'ont rien à changer — la condition d'arrêt n'est pas levée) :

- **`aide?: string`** sur les cinq champs : `FieldDescription` sous le
  contrôle, remplacée par `FieldError` quand l'erreur prend sa place (une
  seule ligne sous le champ, comme MUI), reliée par `aria-describedby`
  comme l'erreur. Sur `ChampInterrupteur` et `ChampCase`, libellé et
  légende passent dans un `FieldContent` à droite du contrôle — sans
  `aide`, le balisage des lots 13 et 14 ne bouge pas.
- **`formater?: (valeur: unknown) => unknown`** sur `ChampTexte` seul,
  appelé avant la normalisation, y compris sur la chaîne en cours de frappe
  qu'il rend telle quelle. `formaterEchelle` de Promotion reprend la
  conversion `Array → a=…,b=…` que le `Controller` MUI faisait au rendu.

**Le troisième présupposé, constaté au navigateur et par rien d'autre**
(§6) : `useController` soumet la valeur du **formulaire**, `register`
soumettait celle du **DOM**. Un champ absent d'`emptyValue` vaut `undefined`
en création ; l'`<input>` MUI, lui, avait `''`. Résultat : un nom laissé
vide sur les sept formulaires de structure recevait « Entrée invalide :
string attendu, undefined reçu » au lieu de « Le nom est requis » —
invisible des tests (aucune spec ne soumet un formulaire vide), invisible
du lot 13 parce que Salle porte `name: ''` dans son `emptyValue`. Réglé
dans le composant : `ChampTexte` passe `defaultValue: ''` à
`useController`, qui ne joue que si ni `defaultValues` ni le formulaire ne
portent le champ (`useController.js:387` : `get(_formValues, name,
get(_defaultValues, name, defaultValue))`) — en édition, la valeur de l'API
reste la sienne, `null` compris. `ChampNombre` ne change pas : `undefined`
et `null` reçoivent le même message de `z.number({ error })` (« Le barème
est requis », vérifié) et un `.nullable()` accepte les deux.

**Ce qui reste hors contrat, et pourquoi** : le choix multiple (lot 14), la
couleur (ci-dessus), et la saisie de confirmation d'une purge ou d'une
suppression (précédent `DeleteConfirmDialog`).

## 3. Structure — onze fichiers

| Fichier | Avant | Après |
|---|---|---|
| `Formation`, `Options`, `Groupe`, `Periode` | `TextField` + `register` + `error`/`helperText` ; `Typography` du garde ; `Box` de la barre (Groupe) | `ChampTexte` ; `<p>` ; `div.flex.items-center.gap-4` |
| `Ue` | `TextField` ×2 (`valueAsNumber`), `Controller` + `FormControlLabel`/`Switch` | `ChampTexte`, `ChampNombre`, `ChampInterrupteur` |
| `Matiere` | `TextField` ×3, `Box` + `Typography` + `<input type="color">` sous `register` | `ChampTexte`, `ChampNombre` ×2, `ChampCouleur` local (`useController`, `<label for>`, `name` sur l'`<input>`, pastille à gauche du libellé comme une case) |
| `Promotion` | `TextField` ×5 dont deux `Controller` à conversion tableau→chaîne, `FormControlLabel`/`Switch` à `checked={null ? undefined : …}` | `ChampTexte` ×3 (`formater` ×2), `ChampNombre` ×2 (`aide`, `step`, `min`), `ChampInterrupteur` ; les deux `Controller`/`ChampDate` **intacts au caractère près** |
| `GroupeImportButton`, `GroupeMultiImportButton` | `Tooltip` + `IconButton` | `Tooltip` + `Button ghost icon` (motif `UserImport`, lot 13) |
| `GroupeUserPage` | `Box` ×6, `Typography h6`, `IconButton`/`Tooltip` ×2, `Button contained` | `div` + classes, `h6` (`text-lg`), `Tooltip`/`Button ghost icon` (retrait en `text-destructive`), `Button` à icône nue ; le bouton « Ajouter » s'aligne sur le bas du champ (`items-end` + la marge basse d'`UserSelector`) |
| `arbre/ArbreStructure` | `Box` + `Typography body2` dans l'étiquette, les nœuds inertes et l'invite vide | `div` + `span.text-sm.leading-5` (14 px / 20 px, le `body2` MUI) ; **rien d'autre ne change** — `tree`/`treeitem`/`group`, `aria-checked`, tabindex tournant, clavier |

## 4. Jury — six fichiers

| Fichier | Avant | Après |
|---|---|---|
| `DelibererButton` | `Tooltip`/`IconButton` ×3 (dont un `<span>` autour du bouton inerte), `Dialog` MUI, `FormControlLabel`/`Switch` + `Typography caption`, `CircularProgress` ×2 | `Tooltip` + `Button ghost icon` (warning / primary par classe), bouton inerte **`disabled focusableWhenDisabled`** (`aria-disabled`, infobulle au survol **et au focus**), `Dialog` shadcn sans croix, formulaire dans le popup, `ChampInterrupteur` à `aide`, `Spinner` dans le bouton |
| `DelibererBulkDialog` | `Dialog`, `FormControlLabel`/`Switch`, `Divider`, `List` MUI, `CircularProgress` | `Dialog` shadcn, formulaire dans le popup, `ChampInterrupteur` à `aide`, `Separator`, `ul` bornée (`max-h-[260px]`), `Spinner` |
| `JuryBulletinsExportModal` | `Dialog`, `Stack`, `TextField` ×9 sur `useState`, `CircularProgress` | `Dialog` shadcn, `useForm` au niveau de la modale, `ChampTexte` ×9 (`className="mb-0"`, `gap-4`), `Spinner` |
| `JuryExportButton`, `JuryBulletinsExportButton` | `Tooltip` + `IconButton` (`color` primary/secondary) | `Tooltip` + `Button ghost icon`, neutres comme le plein écran voisin (lot 10) et les import/export du catalogue (lot 13) |
| `JuryPeriode` | `Box`, `Typography` ×12, `Chip` ×5, `Tooltip` ×4, `Button contained small`, `Alert` | `div`/`span` + classes, **`Badge`** (teintes des tokens de sévérité, fond /15 pour l'ancien « plein », contour /50 pour l'ancien « outlined »), `Tooltip` shadcn (déclencheur rendu en `div` pour les entêtes, en `Badge` pour les pastilles), `Button size="sm"`, `Alert destructive` ; **la table socle et ses props ne bougent pas** |

Les trois modales portent la hauteur bornée et le corps défilant du lot 14
(`max-h-[calc(100vh-4rem)]`, rangées `auto minmax(0,1fr) auto`, corps
`overflow-y-auto` à marges compensées) — ouvertes à petite hauteur en §6.

## 5. Corbeille et registre — ensemble, et ce qui a été fait de la duplication

Les deux écrans se réécrivent sur les mêmes primitives : `Card` /
`CardHeader` / `CardDescription` / `CardContent` / `CardFooter` (entrées
par le CLI), `Alert` à icône (les sévérités de `DeleteConfirmDialog`),
`Spinner` + texte pour l'attente, `h5` + `<p>` pour l'en-tête, `Button
outline` à icône nue pour les actions de carte.

**Pas de composant de carte partagé dans `services/`**, et c'est un
choix : ce que les deux écrans dupliquaient, c'est le `Card` MUI lui-même,
que la primitive shadcn remplace terme à terme — pas un composant métier.
Ce qui reste commun après migration tient en trois lignes (une ligne
d'attente, un titre `h6`, un en-tête de page) et ne justifie pas une
extension de `services/` ; le registre garde ses deux aides locales
(`TitreCarte`, `LigneAttente`), la corbeille écrit les siennes en place.
Le jour où un troisième écran à cartes apparaît, `TitreCarte`/`LigneAttente`
sont le point de départ. La condition d'arrêt « extension de `services/` »
n'est donc pas levée.

| Fichier | Avant | Après |
|---|---|---|
| `Corbeille` | `Card variant="outlined"` ×N, `Alert` ×3, `Dialog` ×2 (purge avec `onEntered` pour le focus, restauration avec `autoFocus`), `TextField` de confirmation, `Stack`, `CircularProgress` | `Card` ; `Alert` info/destructive/warning ; `Dialog` shadcn ×2 — purge sous `initialFocus={saisieRef}` (l'ancien contournement du piège à focus MUI tombe) et `onOpenChangeComplete` qui vide la saisie après la transition, restauration sous `initialFocus={annulerRef}` et `DialogDescription` ; `Label` + `Input` (précédent `DeleteConfirmDialog`) ; Restaurer `outline`, Purger `outline` + `text-destructive`, « Purger définitivement » `destructive` |
| `Registre` | `Card` ×3, `Alert` ×7, `Button` ×4, `TextField multiline` ×2 en `useState` + `slotProps` monospace, `CircularProgress` ×2 | `Card` ×3, `Alert` à icône par sévérité, `Button outline`/`default`, `useForm` + `ChampTexte multiline` ×2 (`[&_textarea]:font-mono`), nom de fichier et verdict dérivés (§2) |

## 6. Vérification à l'écran — compte `test-e2e`, build reconstruit

Méthode des lots 12–14 : `make start-scolarite` après le dernier commit de
code, `src` du script servi comparé à `curl` (`index-PFysN6eI.js`, puis
`index-CUbzVoml.js` après le correctif de §2), chaînes du lot cherchées dans
le JS (`bg-success/15`, `focusableWhenDisabled`) et le CSS (`font-mono`)
servis. Pilotage MCP ; les deux exports du jury par un script Playwright
autonome (le pilote MCP coupe la connexion à chaque téléchargement de
fichier, deux fois de suite — même réponse HTTP observée, voir ci-dessous).

| Écran / vérification | Résultat |
|---|---|
| **Structure — consultation** (Formation, Promotion, UE, Matière) | valeurs de l'API, champs `disabled` ; Promotion : échelles **formatées** `a=4,b=3.5,c=3,d=2.5,e=2,f=0` / `a=16,…`, barème 20 **et son aide** sous le champ, interrupteur `true` et `data-disabled` ; UE : ECTS 5, Académique `true` ; Matière : coefficient 1, heures 20, couleur `type="color"` `name="color"` désactivée (`#000000`, pas de couleur en base) |
| Structure — **édition sur données API** (Promotion) | focus initial sur `name` ; barème modifié → Annuler → garde « Modifications non enregistrées », focus sur « Rester sur la page », valeur conservée ; nom vidé + échelle `n importe quoi` + note éliminatoire vidée → « Le nom est requis », « Le format n'est pas correct (ex: …) », `aria-invalid` sur `name` et `echelle_gpa`, focus sur le premier, `aria-describedby` de l'échelle → le message, du barème → l'aide ; interrupteur décoché → le champ « Note éliminatoire » disparaît, recoché → revient ; corrigé → **PUT** avec `echelle_gpa: [4,3.5,3,2.5,2,0]`, `bareme: 20`, `value_matiere_eliminatoire: 6` (les valeurs du seed, remises après un premier passage qui les avait modifiées), toast, liste |
| Structure — **création** (Promotion, Formation) | champs vides, dates vides (pas aujourd'hui), barème pré-rempli 20, interrupteur `false`, note éliminatoire absente ; soumission vide → **premier build : « Entrée invalide : string attendu, undefined reçu » ×3** (§2) — **build corrigé : « Le nom est requis »** sur Formation, et sur Promotion les trois messages métier ; barème vidé → « Le barème est requis » ; Annuler après erreurs → garde « Quitter » ; Annuler sans saisie → aucune garde |
| Structure — **Matière en édition** | couleur saisissable (`fill('#ff0000')` → `#ff0000`), coefficient `-1` → message sur `coeff`, Annuler → garde → Quitter |
| **Arbre — parcours de `hierarchieE2E`** | clic étiquette : URL + `aria-checked`, `aria-expanded` sur les dépliables seulement ; **clavier** : Bas → promotion ; Droite → déplie (`aria-expanded` true) ; Droite → descend sur « Option E2E Option » ; Gauche → remonte ; Gauche → replie ; **Entrée → navigue** (`/promotion/287`, `aria-checked`) ; Début/Fin → premier/dernier ; un seul `tabindex="0"` |
| **Membres du groupe** | `h6`, Retour/import (`accept=".xlsx"`)/Ajouter ; recherche « Eleve5 » → option → **POST 204**, ligne ajoutée, champ vidé (`reset`, lot 14) ; bouton « Retirer E2E Eleve5 du groupe », infobulle « Retirer du groupe » ; **DELETE 204**, ligne partie — seed rendu tel quel |
| **Jury — bandeau et cellules** | « 0 / 4 délibéré(s) » en `Badge` contour, « 2 dossiers incomplets » contour warning + infobulle, « En attente »/« Incomplet » (infobulle « Non évaluée : E2E UE1 »), infobulle d'entête « GPA Académique » ; bouton inerte : `aria-disabled="true"`, pas d'attribut `disabled`, `tabindex="0"`, **infobulle au survol et au focus** (« Délibération impossible : dossier incomplet. Unité non évaluée : E2E UE1. … ») |
| Jury — **délibération simple** | modale « Délibérer — Eleve1 E2E », interrupteur `true`, légende reliée par `aria-describedby`, bascule ; Confirmer → **POST 200 `{"compte_cumul":true}`**, toast, pastille « Délibéré », compteur « 1 / 4 » ; annulation → **DELETE 204**, retour « En attente » |
| Jury — **délibération groupée** | cases Eleve1 + Eleve2 (celle d'Eleve3 `aria-disabled`), bouton « Délibérer 2 sélectionné(s) », modale « Délibérer 2 élèves » listant les deux, interrupteur + légende ; Confirmer → **POST 200 bulk**, **toast « 2 élèves délibérés. »** (le pluriel du lot 10 tient), « 2 / 4 », sélection vidée ; les deux annulées → « 0 / 4 » |
| Jury — **exports** (script autonome) | ZIP : `Spinner` dans le bouton pendant l'appel, **POST 200 `application/zip`**, `bulletins_jury_621.zip` téléchargé, corps = les neuf paramètres, toast ; Excel : **200 `…spreadsheetml.sheet`**, `jury_621.xlsx`, toast |
| Jury — **bulletins, persistance** | « Établissement X » saisi → Annuler → rouvrir → **valeur conservée** |
| Jury — **les trois modales à petite hauteur** | bulletins à 420 px : modale 32→304, titre et « Exporter » visibles, corps défilant (669/151 px), dernier champ atteint au défilement ; délibération à 360 px : titre 50→66, « Confirmer » 207→239, dans le cadre ; groupée : liste bornée, même patron — **aucun débordement** |
| **Corbeille — restauration** | option sacrificielle supprimée depuis l'arbre → carte `h6` « Option « E2E Option Sacrificielle » », sous-titre, « Contient 1 groupe, … et 1 note. » ; Restaurer → modale, **focus sur Annuler**, description avec la liste ; Restaurer → carte partie, toast |
| Corbeille — **purge** | modale « Purger Option « … » ? », alerte warning de cascade, **focus sur la saisie**, « Purger définitivement » désactivé → nom saisi → activé → purge, toast, carte partie |
| Corbeille — **état vide** | la corbeille locale porte une « Période « S5 » » de la hiérarchie manuelle (23/08), ni restaurée ni purgée : l'état vide a été vu en **substituant `[]` à la réponse** (`page.route`) après rechargement — « La corbeille est vide. … » en alerte info, aucune carte |
| **Registre** | `h5`, trois `h6`, **deux alertes** au repos (chaîne valide 580 maillons ; dernière ancre), « Vérifier le témoin » désactivé, `accept=".tsr,.der,.pem,.txt"` ; Revérifier → 200 ; jeton collé (`TEXTAREA`, `ui-monospace`) → bouton activé → **POST 200** → alerte « Jeton illisible — … ber2der… » ; jeton modifié → **le verdict s'efface** (dérivation) ; « Ancrer maintenant » → **200, nouvelle ancre 40**, alerte succès, toast — une ancre de plus sur la TSA de développement, comme `make ancrer` |
| **Sombre + anglais** (registre, corbeille + purge, Promotion en édition, jury + modales) | `.dark` posé, fonds de champ/cartes/modales aux tokens ; « Ledger / Trash / Academics », « Cohort title / GPA scale / Grading scale » + aide en anglais, « Purge Period « S5 »? » + « Confirmation » + « Purge permanently », « Deliberate — Eleve1 E2E » + « Uncheck if this is a failed year (repeating) », « Transcript settings » + neuf libellés ; pastilles « Pending / Incomplete », « 1 incomplete record » |
| Console | 0 erreur applicative sur toute la session (les 400 sont des identifiants périmés après un re-seed en cours de vérification, les 401 un `fetch` de vérification sans jeton) |

Données : promotion remise aux valeurs du seed, membre retiré, délibérations
annulées, option sacrificielle purgée (le seed la repose), une ancre TSA de
plus.

**Un défaut trouvé au navigateur et par rien d'autre**, corrigé dans le lot
(commit dédié) : les messages génériques de zod en création (§2). Le
treizième sur quinze lots — et deux moins graves qu'au lot 14 : ni
débordement ni rognage, les trois modales du jury portaient le patron du
lot 14 dès l'écriture.

## 7. Journal des captures — six régénérées, justifiées

Premier run (`make test-ihm`, contre le build final) : **6 échecs, tous des
captures** (57 ✅, le septième ✘ est le `test.fail` documenté de
`navigation.spec.ts`) ; `registre.spec.ts` est passé, aucun artefact à
sauver. Chaque `*-diff.png` regardé avant toute régénération :

| Capture | Sort |
|---|---|
| `jury-deliberer-dialog` (clair, sombre) | régénérée — la modale entière (Base UI : coins, pied de page en bande, interrupteur à légende sous le libellé, « Confirmer » à icône nue) ; derrière le flou, les pastilles `Badge` du bandeau et des lignes, et les boutons d'action passés en 16 px |
| `menu-actions` (clair, sombre) | régénérée — la seule zone en diff est le champ « Titre de la formation » (libellé au-dessus et 32 px de haut contre libellé flottant et 56 px), donc le bouton « Retour » remonté ; **l'arbre est pixel-identique** (`formation-liste`, qui le montre sans formulaire, passe) |
| `dialogue-suppression-confirmation` (clair, sombre) | régénérée — derrière le flou, le bas du formulaire de « E2E Promo Vide » (échelles, barème, son aide, l'interrupteur) ; le dialogue lui-même ne bouge pas |
| `dialogue-suppression-simple` (×2) | **inchangée** — le formulaire de l'option, un seul champ, reste sous le seuil derrière le flou |
| `formation-liste`, `menu-compte`, `certification-toeic`, `grille-saisie`, `planning`, `note-graphique` (×2 chacune) | **inchangées**, byte-identiques (`git status` après `--update-snapshots` ciblé sur les deux specs : six fichiers modifiés, pas un de plus) |

Régénération ciblée sur les deux specs (23 tests), chaque nouvelle image
regardée (clair et sombre) avant commit.

## 8. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip, même mesure gzip des deux côtés) :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| `mui-material-libs` | 269.82 / 77.34 | 259.09 / 74.80 | **−10.7 / −2.5** |
| `vendor` | 891.05 / 278.84 | 891.04 / 279.16 | 0 / +0.3 (Badge : `useRender` déjà présent) |
| code applicatif (index) | 319.87 / 84.39 | 324.68 / 85.44 | +4.8 / +1.0 |
| CSS | 106.87 / 17.01 | 111.49 / 17.76 | +4.6 / +0.8 (utilitaires card/badge, aide) |
| `mui-libs`, tanstack, fullcalendar, recharts, runtime | — | — | 0 (hashs identiques) |

**Net sur le fil : −1,3 kB rendus, −0,4 kB gzip.** Franchement : la
rentabilisation de Base UI (lot 13, +41 kB) **ne commence pas ici** — c'est
plat, pour la seconde fois. La décrue MUI est du même ordre qu'au lot 14
(−10,7 kB) : `Chip`, `Card`, `List`, `Divider`, `Stack` sortent de leur
dernier fichier mais `Dialog`, `Tooltip`, `TextField`, `Typography`, `Box`,
`Button`, `Alert`, `Switch`, `CircularProgress` restent importés par
`pages/note/` (et `ChampDate`), donc dans le chunk. La rentabilisation
viendra d'un bloc, avec la dépose de `mui-material-libs` — pas d'un lot à
l'autre.

Par paquet (visualizer, tailles rendues) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/material` | 494.7 | 473.5 | **−21.2** |
| code applicatif | 659.7 | 668.6 | +8.8 |
| `@base-ui/react` | 560.4 | 560.3 | −0.1 (Card et Badge n'apportent aucun module Base UI nouveau) |
| tous les autres | — | — | 0 (rendu identique au dixième de kB, `recharts` 566.6 compris — le rééquilibrage des lots 12–14 ne se reproduit pas) |

Lockfile : **+0 / −0 / 0 montée** — `package.json` et `package-lock.json`
sont byte-identiques à 93db759.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep @mui/material` sur les dix-neuf fichiers | ✅ zéro occurrence (20 `.tsx` importateurs restent : 15 dans `note/`, 5 d'infrastructure — §1) |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 |
| Suite e2e (contre le build du lot, hash du script servi vérifié par `curl`, conteneurs plus anciens que les runs) | make ❌ 6 captures (§7, régénérées) → **npx ✅ 63 (3,0 min) → make test-ihm ✅ 63 (3,0 min) — deux exécutions consécutives vertes, points d'entrée alternés, contre le build final** (`index-CUbzVoml.js`) ; `registre.spec.ts` vert trois fois |
| Sélecteurs/assertions e2e | zéro modification — quinzième lot consécutif ; `corbeille`, `droits`, `registre`, `navigation` traversent les écrans migrés tels quels |
| Lockfile | **+0 / −0 / 0 montée** — `card` et `badge` entrent par le CLI shadcn |
| Page témoin `_cohabitation`, `ChampDate`, table socle de `JuryPeriode`, balisage `tree`/`treeitem`, `pages/note/` | intacts (aucune ligne modifiée) |
| Données | promotion remise au seed, membre retiré, délibérations annulées, option sacrificielle purgée puis reposée par le seed des runs ; une ancre TSA de plus (dev) |

Commits : champs partagés (`aide`, `formater`) → structure 1/2 (sept
formulaires) → structure 2/2 (boutons, membres, arbre) → jury → corbeille +
registre → correctif constaté au navigateur (`defaultValue: ''`) → captures
→ doc + CLAUDE.md.

## 10. Ce qui n'a pas été traité

- **`ChampCouleur` reste local** à `Matiere` ; **`ChampMultiple`** à
  `ReservationDialog` (lot 14). Ils montent au partagé au second consommateur.
- **Pas de composant de carte partagé** (§5) — assumé.
- **Les exports du jury n'ont pas été vérifiés par le pilote MCP**, qui
  coupe sa connexion sur un téléchargement ; un script Playwright autonome
  l'a fait à sa place, résultats en §6.
- **Le message d'un champ numérique requis vidé** reste celui du schéma
  (« Le barème est requis » quand le schéma porte une `error`, le message
  zod par défaut sinon — lot 13 §9, inchangé).
- **Les `Tooltip` shadcn du jury sont sans `TooltipProvider`** (délai Base
  UI par défaut ~600 ms), comme partout depuis le lot 3.
- **`ChampDate`** reste un `TextField` MUI au milieu de champs shadcn
  (Promotion, Période) — interdit de retouche, libellé flottant contre
  libellé au-dessus visible sur les captures de §6.
- Hors périmètre, intacts : `pages/note/`, la table socle de `JuryPeriode`,
  la page témoin, colonne « Rôles », `UpdateToeic`, `BarreAxes`, mode/OS,
  chemin mort de `NoteControle`, `registre.spec.ts` intermittent,
  `programme-import` Go.
- `composantsTraduits` : trois consommateurs, tous dans note (lot 14 §6),
  aucun retiré ici.
