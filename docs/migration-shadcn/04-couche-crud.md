# Étape 4 — la couche générique services/crud/ (migration MUI → shadcn/ui)

But de ce lot : migrer vers shadcn/Base UI les huit fichiers de
`front/src/services/crud/` qui touchaient MUI — le cadre commun de presque
tous les écrans — sans toucher une seule page métier. Le contrat
`render: (props) => JSX.Element` de `def.ts` isole les formulaires par
entité : les pages fournissent toujours leurs champs MUI, et continuent de
fonctionner sans modification.

Décision validée par l'utilisateur avant implémentation : **les icônes
restent MUI** dans ce lot. Motif décisif constaté à l'exploration : le type
`IconeAction` (`actions.ts`) est consommé par une vingtaine de déclarations
`icone:` dans les pages — tout passage à lucide aurait soit violé l'interdit
« ne pas toucher aux pages » (bascule totale), soit mélangé deux
iconographies dans un même menu (bascule de la couche seule). La bascule
complète se fera en un lot dédié.

## 1. Constaté avant toute écriture

- L'inventaire de la commande se confirme : 8 fichiers sur 17 touchent MUI ;
  les 9 autres sont de la logique pure et n'ont pas été modifiés.
- `Form.tsx` ne contient aucun champ : le `FormMessage`/`FormField` de
  shadcn n'a donc rien à y remplacer — les champs (et leurs messages
  d'erreur) sont rendus par les pages via `datasource.render`. La migration
  de `Form.tsx` se réduit au cadre : conteneurs et deux boutons. Le câblage
  `champsRefuses`/`focus.ts` est inchangé, au caractère près.
- `DeleteConfirmDialog` repose sur deux mécanismes de cycle de vie MUI
  (`onEntered` pour le focus, `onExited` pour vider la saisie) : leurs
  équivalents Base UI existent — `initialFocus` (Dialog.Popup) et
  `onOpenChangeComplete` (Dialog.Root), vérifiés dans les `.d.ts` du paquet
  avant d'écrire. Aucun comportement à dégrader, pas de question à poser.
- `EtatVideTable` porte deux chaînes d'interface **en dur** (« Aucun
  résultat pour cette recherche. », « Effacer les filtres ») — une entorse
  pré-existante à la convention i18n, **signalée, non corrigée** : la
  corriger changerait des libellés visibles hors du périmètre « migration ».

## 2. Correspondance fichier par fichier

| Fichier | MUI retiré | Remplaçant | Notes |
|---|---|---|---|
| `Crud.tsx` | Alert, Skeleton | Alert shadcn (variante + icône MUI de sévérité), Skeleton shadcn | L'icône que MUI dessinait d'office est posée explicitement — mêmes glyphes (`ErrorOutline`, `WarningAmber`). |
| `EtatVideTable.tsx` | Box, Typography, Button | `<div>`/`<p>` + classes, Button `outline sm` | Toute la logique vide-réel / vide-filtré inchangée. |
| `Form.tsx` | Box, Button | `<div>` + classes, Button shadcn | **`type="button"` rendu explicite sur « Annuler »** : un bouton natif dans un `<form>` soumet par défaut, MUI posait cet attribut à notre place — sans lui, Annuler aurait validé le formulaire. Ajouté aux pièges CLAUDE.md. |
| `MenuActionsLigne.tsx` | Menu, MenuItem, ListItemIcon/Text, Divider, IconButton, Tooltip, Box | DropdownMenu + Tooltip Base UI, Button `ghost icon` | Le menu se ferme seul au choix : l'état d'ancre disparaît. Base UI pose lui-même `aria-haspopup/expanded/controls` ; le nom accessible « Actions — {nom} » est conservé (les e2e s'y accrochent). Libellés en toutes lettres conservés. Correctif après vérification écran : `w-max` sur le popup — sans lui, la largeur se calait sur le bouton ⋮ et repliait les libellés sur deux lignes. |
| `DeleteConfirmDialog.tsx` | Dialog complet, TextField, List, Alert, CircularProgress, Stack, Typography | Dialog Base UI, Label + Input, `<ul>/<li>`, Alert shadcn, Spinner | `initialFocus` = saisie si exigée à l'ouverture, sinon « Annuler » (la parité de l'`autoFocus` MUI, sans le contournement du piège à focus, devenu inutile) ; l'effet « saisie née plus tard » (cascade > `SEUIL_CONFIRMATION`) est conservé tel quel ; `onOpenChangeComplete` vide la saisie après la transition de fermeture (l'`onExited` d'avant). Pas de croix de fermeture (parité). Repli « et N autres » et seuils inchangés. |
| `List.tsx` | Alert, Box, IconButton, Tooltip, Typography | Alert shadcn, `<div>`, Button `ghost icon` + Tooltip shadcn, `<h2>` | **Reste à cheval, comme prévu** — voir §3. Le relais `<span>` du tooltip sur bouton désactivé est conservé (même contrainte que MUI : un bouton désactivé n'émet pas les événements de survol). Le gabarit du bouton retour passe de 40 px (IconButton MUI) à 32 px (`w-8`), commentaire mis à jour. |
| `actions.ts` | — (types/icônes seulement) | inchangé | Icônes MUI conservées (décision du lot). |
| `suppression.ts` | — | inchangé | Déjà sans MUI depuis le lot 3. |

Composants shadcn ajoutés (`npx shadcn add alert dialog label spinner`) :
fichiers locaux uniquement, **zéro dépendance npm nouvelle** — vérifié,
`package.json`/`package-lock.json` strictement inchangés sur tout le lot
(**+0 / −0 / 0 montée parasite**). Adaptations locales, commentées dans les
fichiers : chaînes « Close »/« Loading » traduites (`shell.fermer`, nouvelle
clé `shell.chargement` fr/en), et quatre variantes de sévérité ajoutées à
`alert.tsx`.

## 3. `List.tsx` — ce qui reste à cheval, et pourquoi

Sont restés MUI/MRT, comme la commande l'exigeait :

- `mrtTheme` (fond de table, `darken(theme.palette...)`) ;
- `muiTablePaperProps` / `muiTableContainerProps` (mise en page interne de
  la table) ;
- `muiTableBodyRowProps` (surbrillance de la ligne au retour
  d'enregistrement, `alpha(palette.primary...)`) ;
- `MaterialReactTable` lui-même, sa localisation et `alpha`/`darken`
  importés de `@mui/material`.

Ce sont des props de material-react-table : elles partiront avec lui à
l'étape 5, pas avant. Conséquence visible assumée : dans la barre d'outils
des listes, les deux commandes de gauche (ajouter, supprimer) sont désormais
des boutons shadcn quand les cinq de droite (recherche, filtres, colonnes,
densité, plein écran) restent des IconButton MUI internes à MRT — deux
styles de bouton cohabitent sur la même rangée jusqu'à la sortie de MRT.
`GroupeUserPage.tsx` et `JuryPeriode.tsx` (mêmes motifs `theme.palette`) :
non touchés, hors périmètre.

## 4. Tokens de sévérité — la méthode du lot 2 étendue

MUI colorait ses `Alert` par sévérité ; les tokens shadcn n'avaient ni
`success`, ni `info`, ni `warning`. Trois tokens ajoutés à `index.css`
(+ leur enregistrement `--color-*` Tailwind), dérivés de
`palette.success/info/warning.main` des deux modes MUI (green[800]/[400],
lightBlue[700]/[400], orange[900]/[400]), convertis par le même script
sRGB → OKLCH que le lot 2 — contrôle de non-régression : `#1976d2` redonne
exactement la valeur `--primary` déjà en place. Les variantes d'`alert.tsx`
les consomment en fond teinté `/10` + texte de la teinte, la transposition
du style « standard » MUI ; `destructive` (générée sur fond neutre) est
alignée sur le même parti pour que les quatre sévérités se répondent.

## 5. Vérification à l'écran — popups et dialogues, les deux modes

Le piège du lot 3 (un popup Base UI peut planter au montage, invisible des
tests) impose l'ouverture réelle de chaque surface. Tout est passé au
navigateur, build conteneurs, compte admin :

| Surface | Clair | Sombre |
|---|---|---|
| Menu d'actions d'une ligne (liste Formations) | ✅ (menu, rôle/nom accessibles, fermeture au choix) | ✅ |
| Menu avec bloc destructif + séparateur (détail Formation/Option) | ✅ (« Supprimer » en rouge derrière séparateur) | — (même composant, style par tokens) |
| Dialogue de suppression **avec saisie** (formation FIA) | ✅ focus dans la saisie, « Supprimer » désactivé puis déverrouillé par la saisie exacte, saisie revidée à la réouverture | ✅ (chemin sélection + corbeille de la toolbar) |
| Dialogue de suppression **simple** (matière) | ✅ pas de saisie, **focus sur « Annuler »** (parité autoFocus) | — |
| État vide réel (TOEIC) + invite de création | ✅ (capture) | ✅ (capture) |
| État vide **filtré** (« Aucun résultat… » + « Effacer les filtres ») | ✅ le bouton vide bien les filtres | — |
| Formulaire création (focus premier champ), garde de sortie | ✅ (la garde s'interpose — preuve du `type="button"`) | — |
| Formulaire édition | ✅ | ✅ |
| Formulaire consultation (« Retour ») | ✅ | — |
| Alerte d'erreur de récupération (`Crud.tsx`) | ✅ (déclenchée par un id re-semé — voir §8) | — |

Aucun plantage au montage d'aucun popup ; 0 erreur console imprévue.
Un défaut de parité trouvé et corrigé pendant cette passe : la largeur du
menu d'actions (commit dédié).

## 6. Journal de réacceptation des captures

Six références régénérées (3 écrans × 2 modes), chacune regardée ; les
quatre autres (planning ×2, dialogue de délibération ×2) sont **restées
vertes sans régénération** — aucun composant de cette couche n'y est
visible, ce qui confirme en creux le périmètre du lot.

| Capture | Constaté | Attendu ? |
|---|---|---|
| formation-liste (light/dark) | Boutons ajout/corbeille de la barre et ⋮ de la colonne Actions : IconButton MUI (ronds, 40 px, halo au survol) → Button shadcn `ghost icon` (32 px, coins arrondis). Table, arbre, en-têtes : identiques. | oui |
| certification-toeic (light/dark) | Idem barre d'outils + bouton retour ← ; l'invite de l'état vide passe du bouton MUI outlined (MAJUSCULES) au Button shadcn `outline sm` (casse normale). Sélecteurs e2e insensibles à la casse : vérifiés verts. | oui |
| grille-saisie (light/dark) | **Diff regardé pixel par pixel avant réacceptation** : seuls les quatre ⋮ de la colonne Actions diffèrent — la grille consomme `MenuActionsLigne`. Notes, champs, axes : rien d'autre ne bouge. Cette capture n'était pas dans la prévision initiale du lot ; le diff en a fait la preuve plutôt que la surprise. | oui |

## 7. Bundle — par paquet, contre le build d'avant-lot

Méthode du lot 3 §9 (visualizer, tailles rendues, référence figée avant le
premier commit du lot) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@base-ui/react` | 336.2 | 345.6 | +9.4 (primitives dialog) |
| code applicatif | 564.2 | 571.7 | +7.5 (composants ui/ ajoutés) |
| `@mui/icons-material` | 26.4 | 27.5 | +1.0 (3 icônes de sévérité) |
| **`@mui/material`** | **605.2** | **605.2** | **0.0** |

**`@mui/material` ne décroît pas encore, et c'est structurel, pas un
échec de tree-shaking** : l'élagage opère au composant, or chaque composant
que cette couche abandonne reste importé par au moins une page — `TextField`
par 14 fichiers, `Tooltip` par 13, `IconButton` par 12, `Typography` par 19,
`Alert` par 6, `Dialog` par `UnsavedChangesDialog`/`LignesRefuseesDialog`/
`DelibererButton`, `Skeleton` et `CircularProgress` par un chacun (comptes
`grep` sur `src/` hors `components/ui`). La décrue de `@mui/material`
commencera quand un composant perdra son **dernier** consommateur — c'est-à-
dire avec la migration des pages, pas de la couche. Le coût net du lot est
+18 kB rendus (+ ~6 kB de CSS) ; le gain est que tous les écrans passent
désormais par des surfaces shadcn pour leurs actions, menus, dialogues de
suppression, états vides et cadres de formulaire.

## 8. Découvertes hors périmètre, signalées sans correction

- **Chaînes en dur dans `EtatVideTable.tsx`** (§1) : pré-existant.
- **URL mémorisée sur une entité re-semée** : après un passage de la suite
  e2e (qui re-sème le seed), la reprise de tâche (`RetourScolarite`) revient
  sur l'ancien id → 400 et alerte « Erreur lors de la récupération ». L'écran
  se dégrade proprement (constaté avec la nouvelle alerte) ; le comportement
  pré-existe au lot — même famille que le rebond Keycloak documenté au lot 1.
- Le compte de bloqueurs `deleteDialog` (`estBloque`) n'a pas pu être
  observé à l'écran : aucune donnée locale ne produit de blocage serveur.
  Le chemin est couvert par le typage et le rendu conditionnel inchangé.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` + vite) | ✅ |
| `make test-ihm` (run 1) | ✅ 45 passed |
| `npx playwright test` (run 2, autre point d'entrée) | ✅ 45 passed |
| Lockfile | +0 / −0 / 0 montée parasite (aucun `npm install` du lot) |

Aucune assertion e2e modifiée, aucun sélecteur adapté : les rôles `menu`/
`menuitem`/`dialog`/`button` et les noms accessibles produits par Base UI
sont ceux que la suite attendait déjà de MUI.

## 10. Ce qui n'a pas été traité

- La sortie de material-react-table (§3) : étape 5, avec ses trois props
  `mui*`, `mrtTheme`, `GroupeUserPage.tsx` et `JuryPeriode.tsx`.
- La bascule des icônes vers lucide : lot dédié (décision utilisateur), le
  type `IconeAction` restant `ComponentType<SvgIconProps>` d'ici là.
- Les deux bugs i18n du lot 2bis : intacts.
- Les chaînes en dur d'`EtatVideTable` et l'URL mémorisée sur id re-semé
  (§8) : signalés.
- `UnsavedChangesDialog` et `LignesRefuseesDialog` (dans `services/`, pas
  `services/crud/`) : toujours MUI — hors périmètre de ce lot, candidats
  naturels du prochain.
