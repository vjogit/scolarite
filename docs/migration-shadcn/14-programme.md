# Étape 14 — le workflow programme, et la correction d'`UserSelector`

Trois fichiers de `pages/programme/` perdent leur dernier import
`@mui/material`, et le lot commence par un défaut qui n'était pas à lui :
`UserSelector` (`services/`, migré au lot 5) s'ouvrait vide en édition sur
cinq écrans, dont trois déjà livrés. Le contrat des champs partagés du lot 13
rencontre ici son premier écran hors de son lot d'origine — et un écran qui
n'était pas sur react-hook-form.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire est exact** : trois fichiers de `programme/` importaient
  `@mui/material` (`Planning`, `ReservationDialog`, `HeuresPanel` ;
  `routes.tsx` et `ProgrammeLayout.tsx` non). `@mui/material` reste importé
  par **39 fichiers** après le lot — 42 avant (le lot 13 en annonçait 41 ;
  l'écart d'un vient du comptage, pas d'un importateur nouveau : aucun
  fichier n'a gagné d'import MUI depuis).
- **`HeuresPanel` ne saisit rien.** C'est un panneau de lecture (requête
  `heures`, barres de consommation, totaux) : la ligne « saisie, totaux, cas
  limites » de la vérification demandée se réduit aux totaux et aux cas
  limites (§5). Aucun champ partagé n'y a de place.
- **`ReservationDialog` n'est pas sur react-hook-form** : neuf `useState`,
  un `initialiser` rejoué sur la transition d'ouverture MUI. Or les quatre
  champs partagés exigent `control` (`useController`). Constaté par lecture,
  tranché en §3.
- **La cause du défaut d'`UserSelector` est celle annoncée** :
  `useState('')` pour le texte du champ (`UserSelector.tsx:68`) à côté d'un
  `selectedUser` reconstruit au montage. Et un second point de divergence,
  déduit par lecture : `GroupeUserPage` fait `reset(ADD_USER_DEFAULT)` après
  un ajout — ni l'un ni l'autre des deux états locaux ne suivait ce reset.
- **Base UI dérive lui-même le texte d'un combobox simple depuis `value`**
  quand `inputValue` n'est pas contrôlé — au montage
  (`AriaCombobox.js:171-179`) et à chaque changement de `value`
  (`syncInputToSelectedLabel`, l.816-832), la comparaison se faisant **par
  référence** (`useValueChanged`, `!==`). C'est ce qui permet une correction
  sans état local, à condition de mémoriser l'objet dérivé.
- **FullCalendar injecte sa feuille de style à l'exécution**, dans un
  `<style data-fullcalendar>` inséré **avant** le premier `script`/`link`/
  `style` du `<head>` (`internal-common.js:20-36`), hors de toute couche, et
  y pose ses vingt-cinq variables `--fc-*` sur `:root`. Aucun habillage
  n'existait dans le projet (zéro occurrence de `fc-`/`--fc` hors
  `node_modules`).
- **Le bouton de retrait d'un chip Base UI n'a pas de nom accessible**
  (aucun `aria-label` dans `ComboboxChipRemove.js`) ; `ComboboxChip` du
  projet ne lui en posait pas non plus — les chips n'avaient encore aucun
  consommateur.
- **La fumée du planning cible « Total période » en `heading`**
  (`planning.spec.ts:24`) : le `subtitle2` MUI rendait un `<h6>`, le
  remplaçant garde la balise. Les captures `planning-{light,dark}` sont les
  seules du périmètre.
- Référence bundle figée avant-lot : build du commit 8317e1c (lot 13) dans
  un worktree jetable, mêmes `node_modules`, `vite build` mode production,
  rapport visualizer conservé jusqu'à la comparaison.

## 2. `UserSelector` — la correction, et sa vérification sur les cinq écrans

**Ce qui change** (commit b10f0c5, seul) : la sélection est **lue dans le
formulaire** par `useWatch({ control })` et mémorisée sur ses trois valeurs
(`user_id`, `firstName`, `lastName`) ; `inputValue` n'est plus contrôlé —
Base UI affiche le libellé de `value` au montage et le resynchronise à
chaque changement, dans les deux sens (édition pré-remplie, `reset` du
parent vidant le champ) ; `onInputValueChange` ne sert plus qu'à alimenter
la recherche serveur différée (500 ms, inchangée). `getValues` reste dans
la signature mais n'est plus lu : les cinq écrans continuent de le passer.

**Signature intacte** — la condition d'arrêt n'est pas levée. Le mode
consultation lit désormais les mêmes valeurs observées (il lisait
`getValues` à chaque rendu).

Vérifié au navigateur, compte `test-e2e`, build reconstruit (hash du script
servi comparé à `curl`), **en édition sur des données venant de l'API** :

| Écran | Résultat |
|---|---|
| TOEIC — création | champ vide ; « Eleve1 » → six options serveur → choix → champ « Eleve1 E2E », création 201 |
| TOEIC — **édition** | champ **« Eleve1 E2E »** à l'ouverture, bouton « Effacer » présent, score 850 ; Effacer → champ vide, soumission → `aria-invalid` + « Veuillez sélectionner un élève » ; choix d'Eleve2 → champ « Eleve2 E2E », PUT porte `user_id: 1355` |
| TOEIC — consultation | « Eleve1 E2E », `disabled` |
| Mobilité — création / **édition** / consultation | idem : « Eleve1 E2E » pré-rempli en édition (pays « Irlande » à côté), Annuler sans garde (rien modifié), consultation désactivée |
| GroupeUserPage — ajout puis `reset` | « Eleve5 » choisi → POST 204 → **champ vide, plus de bouton Effacer** (le second point de divergence) ; membre retiré ensuite (DELETE 204), le seed est rendu tel quel |
| NoteEleveAxe — « Tous les élèves » | choix d'Eleve2 → navigation `/eleve/1355/note`, le champ garde « Eleve2 E2E » |
| NoteControle — création / **édition** / consultation | par URL (`…/controle/623/note/1561/edit`, chemin mort de la liste, formulaire bien vivant) : « Eleve2 E2E » pré-rempli, consultation désactivée, création vide |

Données : résultat TOEIC et mobilité supprimés depuis l'interface (les deux
listes affichent à nouveau leur état vide, celui que `certification-toeic`
photographie), Eleve5 retiré du groupe.

**Découvert en passant, hors périmètre, signalé** : sur TOEIC, changer
l'élève en édition n'a **aucun effet** — `UpdateToeic`
(`toeic_write.sql:6`) ne touche que `score`, `date_passage`, `remarque`. Le
PUT porte bien le nouvel `user_id` (vérifié), le serveur l'ignore, la ligne
garde Eleve1. Soit le champ doit être en lecture seule en édition, soit
l'UPDATE doit le prendre ; ce lot ne tranche pas. Même chose à vérifier sur
Mobilité et NoteControle (non testé).

## 3. Le contrat des champs partagés hors de son lot d'origine — verdict

**Le contrat tient, à deux conditions qu'il ne disait pas.**

1. **Il suppose react-hook-form.** `ReservationDialog` portait son
   formulaire en `useState` : aucun des quatre champs n'y était applicable
   tel quel. Deux issues — monter les primitives `ui/` à la main dans
   l'écran (ce que le contrat interdit précisément : « jamais de câblage
   dans un écran »), ou passer l'écran à react-hook-form. C'est la seconde
   qui est prise : `useForm<ValeursReservation>` avec `defaultValues`
   calculés au montage, et le **formulaire monté dans le popup** — Base UI
   démonte le contenu d'un `Dialog` fermé, chaque ouverture repart de zéro
   sans `initialiser` ni effet. L'ancien « `null` tant que l'utilisateur n'a
   rien choisi, puis filtrage du référentiel » pour salles et groupes
   disparaît aussi : `SalleRef`/`GroupeRef`/`IntervenantRef` de la
   réservation ont la forme des référentiels, les valeurs initiales sont
   complètes sans attendre une requête. Le contrat gagne une ligne : *un
   écran qui n'est pas sur react-hook-form y passe d'abord*.
2. **Il n'avait pas de case à cocher.** « Distanciel » était un `Checkbox`
   MUI ; `ChampInterrupteur` l'aurait changé en interrupteur sous les yeux
   de l'utilisateur. **`ChampCase`** rejoint `ChampChoix.tsx` (cinquième
   champ, même contrat : `name`, `control`, `label`, `disabled` ; `Checkbox`
   Base UI, rôle `checkbox`, `<label for>`). Vingt lignes, aucune
   dépendance.

Ce que le contrat ne couvre pas, et ne couvrira pas dans ce lot : le
**choix multiple** (`Autocomplete multiple` ×3). Un `ChampMultiple` local
(`Combobox` Base UI à chips, `ui/combobox.tsx` — les exports `ComboboxChips`
/`ComboboxChip`/`ComboboxChipsInput` trouvent leur premier consommateur)
reste dans `ReservationDialog` : un seul écran en monte, les deux
`Autocomplete` restants des lots note sont des choix simples. Il monte
au partagé le jour où un second écran le demande.

Et `ChampSelection` travaille **en chaînes** : `matiere_id` (nombre côté
API) est une chaîne dans le formulaire, convertie à la soumission. Le
contrat ne le disait pas ; c'est consigné dans le type `ValeursReservation`.

Ce qu'un écran passe de plus que `name`/`control`/`label`/`disabled` :
**`className="mb-0"`** — `mb-4` de chaque champ partagé doublait le `gap-4`
du corps de la modale. `className` était déjà dans `PropsChampBase`.

## 4. L'habillage FullCalendar et l'invariant 11

FullCalendar n'est pas remplacé (interdit, et indépendant de MUI). Son
habillage est un bloc de **variables**, rien d'autre :

```css
@layer components {
  .fc { --fc-border-color: var(--border); --fc-page-bg-color: var(--background); … }
}
```

**Pourquoi ça ne sort pas de l'ordre des couches** — et pourquoi ça ne
pouvait pas se faire autrement :

- FullCalendar déclare ses variables sur `:root`, **hors couche**. Une
  redéclaration sur `:root` depuis `index.css` perdrait dans tous les cas —
  hors couche contre hors couche, la feuille FullCalendar est insérée avant
  la nôtre… mais surtout, dans une couche, elle perdrait par principe
  (invariant 11 : hors couche bat en couche).
- Redéclarées sur **`.fc`**, l'élément lui-même, elles ne sont plus en
  concurrence avec `:root` : une propriété personnalisée déclarée sur un
  élément prime sur celle qu'il hériterait, quelle que soit la couche et
  quel que soit l'ordre des feuilles. La cascade ne joue qu'entre
  déclarations sur le même élément.
- Les valeurs sont des **références** aux tokens du lot 2 (`var(--border)`,
  `var(--primary)`…) : `.dark` n'a rien à redéclarer, les tokens basculent
  déjà. Vérifié en calcul (`getComputedStyle(.fc)` rend `lab(0% 0 0/.12)`
  pour la bordure, la couleur primaire pour les boutons) et à l'écran dans
  les deux modes.
- Boutons : `--primary` et ses teintes `color-mix` /90 (survol) et /80
  (actif), celles du `Button` shadcn. Sélection de créneau : lavis primary
  20 % ; colonne du jour : lavis warning 12 % (jugement, sans pendant MUI —
  le jaune par défaut de FullCalendar n'en avait pas non plus).

**Invariant 11 vérifié après coup** : `document.styleSheets` dans l'ordre —
le `GlobalStyles` d'Emotion (`@layer theme, base, mui, components,
utilities;`) reste la **première** feuille ; celle de FullCalendar est
quatrième, hors couche, avant `index.css` ; le bloc `.fc` est dans
`components`. Rien n'a bougé dans `index.css` au-dessus de la ligne 18.

Ce que le bloc ne couvre pas : la typographie de FullCalendar (16 px, titre
1.75 em, boutons 1 em) — ses valeurs par défaut, celles qu'il avait déjà
avec MUI. Et toute règle FullCalendar hors variables reste hors couche : un
utilitaire Tailwind posé sur un élément `.fc-*` perdrait ; aucun n'est posé.

## 5. Les trois fichiers, et la vérification à l'écran

| Fichier | Avant | Après |
|---|---|---|
| `HeuresPanel.tsx` | `Box` ×10, `Typography` ×9, `LinearProgress` ×3, `Divider` | `div` + classes, `h6` (titre ciblé par la fumée), `Progress` Base UI (entré par le CLI shadcn, `ui/progress.tsx`) teinté par slot (`[&_[data-slot=progress-indicator]]:bg-warning`), `Separator` |
| `ReservationDialog.tsx` | `Dialog`/`DialogTitle`/`DialogContent`/`DialogActions`, `Select`+`MenuItem` ×2, `Autocomplete multiple` ×3, `Checkbox`, `TextField multiline`, `Alert`, `Stack`, `Button` ×3 ; neuf `useState` | `Dialog` shadcn (sans croix, parité), `ChampSelection` ×2, `ChampMultiple` ×3 (chips), `ChampCase`, `ChampTexte multiline`, `Alert variant="destructive"`, `Button` ×3 ; `useForm` — les deux `ChampDateHeure` du lot 12 **intacts** |
| `Planning.tsx` | `Box` ×4, `IconButton`+`Tooltip` ×2, `Snackbar`+`Alert` | `div` + classes, `Tooltip`+`Button ghost icon` (icônes nues, 16 px — lot 6), conflit de déplacement par **`notifyError`** (sonner, durée d'erreur centralisée : le `Snackbar` bas-centre 6 s disparaît) |

Vérifié au navigateur (pilotage MCP), **dans les deux modes et les deux
langues** :

| Vérification | Résultat |
|---|---|
| Planning — semaine / mois / jour | bascules par les boutons FullCalendar (« Mois », « Semaine », « Jour » — `exact`, « Aujourd'hui » contient « Jour »), titres cohérents ; précédent/suivant/aujourd'hui ; `planning_date` réécrit en session |
| Planning — sombre | `.dark` posé, grille aux tokens (bordures 12 % blanc, boutons primary clair à texte sombre, colonne du jour teintée) — l'ancienne capture sombre gardait les **bordures gris clair par défaut** de FullCalendar |
| Planning — anglais | barre FullCalendar en anglais (locale `undefined`), « Term total », « Color by subject » / « Hide hours » ; infobulle « Couleur par matière » lue après survol (`[data-slot=tooltip-content]`) |
| Création par sélection de créneau | glisser 09:00→10:30 sur le 02/09 : modale « Nouvelle réservation », Début/Fin/Heure pré-remplis ; `Select` Type (six entrées) → « TD » ; `Select` Matière → « E2E UE1 — E2E Matiere » ; chips Groupes « E2E Groupe » (liste maintenue ouverte en mode multiple), Intervenants « Eleve1 » → recherche serveur → chip « E2E Eleve1 » ; bouton de retrait nommé « Retirer » ; case Distanciel `aria-checked` ; description ; **POST 201**, événement « TD — E2E Matiere / E2E Eleve1 » vert TD, panneau **1,5 / 20 h** |
| **Conflit de réservation** | seconde réservation 09:30–10:00 même jour, même groupe → 400, **« Le groupe E2E Groupe est déjà planifié de 09:00 à 10:30 »** en `Alert` destructive, modale restée ouverte, Annuler |
| Déplacement | glisser 01/09 → 02/09 : PUT complet (`salle_ids`, `groupe_ids`, `intervenant_ids`, `is_distanciel`, `description` conservés), persistant après remontage de l'écran |
| Redimensionnement | poignée basse tirée (`dragTo`) : PUT, événement étendu ; ramené à 10:30 par la modale d'édition (PUT, `version` suivie) |
| **Conflit au déplacement** | seconde réservation le 03/09, glissée sur le 02/09 : **toast d'erreur** « Un conflit a été détecté… (créneau existant : 09:00–10:30) », événement remis en place (`revert`) |
| Édition | clic sur l'événement : dates, heures, type, matière, chips, case, description **pré-remplis depuis l'API** ; fin + description modifiées → PUT |
| Suppression | « Supprimer » ×2 → DELETE `/reservation/4`, `/reservation/6`, zéro événement, panneau **0,0 / 20 h** |
| Modale — dates | popup calendrier ouvert depuis la modale : portalé vers `<body>`, non rogné, choix du 3 → « 03/09/2026 », modale toujours ouverte |
| Modale — anglais | « New booking », Start/End/Time/Class type/Subject/Rooms/Instructors/Groups/Remote/Description, « Choose date », MM/DD/YYYY, options « None/CM/TD… », Cancel/Create |
| `HeuresPanel` — totaux et cas limites | 0,0 / 20 h à vide ; 1,5 / 20 h après création ; « 20.0h restantes » ; retour à 0,0 après suppression. Dépassement et « sans affectation » **non provoqués** (une réservation > 20 h aurait exigé de fausser le seed) : la logique est inchangée au caractère près, seul le rendu a bougé |
| Console | 0 erreur applicative (les 400 des tests de conflit sont le comportement testé) |

**Deux défauts trouvés au navigateur et par rien d'autre**, corrigés dans le
lot (commit df20317) :

- **la modale débordait de l'écran** — dix champs, le titre et le bouton
  « Créer » hors de vue (« Annuler » hors viewport pour Playwright aussi). La
  modale MUI bornait sa hauteur et faisait défiler son `DialogContent` sous
  un titre et des actions fixes ; `DialogContent` shadcn ne le fait pas
  (`DeleteConfirmDialog`, court, ne l'avait jamais rencontré). Réglé par
  `max-h-[calc(100vh-4rem)]` + rangées de grille `auto minmax(0,1fr) auto`
  et un corps `overflow-y-auto` — avec une marge interne compensée, sans
  quoi le bord du défilement rognait l'anneau de focus et le libellé
  flottant des champs de date MUI ;
- corollaire : **`conteneurPopup` retiré des deux `ChampDateHeure`**. Il
  contournait le piège à focus de la modale MUI (lot 12) ; rendu dans un
  corps défilant, le calendrier y aurait été rogné. La modale Base UI
  reconnaît ses popups portalés vers `<body>` — sélections et combobox le
  prouvent au même endroit. `ChampDate` lui-même n'est pas touché.

Nuance de parité constatée : **Échap ferme la modale** quand aucun popup
n'est ouvert dedans (comme MUI) — un Échap de trop pendant la vérification
a perdu une saisie ; ce n'est pas un défaut.

## 6. L'état de `composantsTraduits`

**Ce lot retire trois consommateurs** — les trois `Autocomplete multiple`
de `ReservationDialog`. **Il en reste trois**, tous dans `pages/note/` :
`NoteEleveAxe.tsx:164` (élève de la période), `GrilleNotes.tsx:147`
(groupe), `FicheExportModal.tsx:65`. Le mécanisme reste entier dans
`layouts/dashboard.tsx` tant qu'un seul subsiste ; il tombe avec les lots
note (15/16), en un seul geste : retirer `composantsTraduits`, le
`components` des deux `createTheme`, et vérifier que
`autocomplete.fermer` (jamais consommé par `ui/combobox.tsx`, lot 5 §4)
n'a plus de lecteur. Ses clés `ouvrir`/`effacer` restent portées par le
combobox ; **`autocomplete.retirer`** (fr « Retirer », en « Remove ») les
rejoint dans ce lot, pour le bouton de retrait d'un chip.

## 7. Journal des captures — deux régénérées, justifiées

Premier run (`make test-ihm`) : **2 échecs, les deux captures du
planning** (61 ✅). Chaque image regardée avant régénération ; les écarts,
tous voulus :

| Capture | Sort |
|---|---|
| `planning-light` | régénérée — boutons FullCalendar en `--primary` (bleu MUI) au lieu du bleu nuit `#2c3e50` par défaut ; bordures de grille aux tokens (12 % noir contre `#ddd`) ; boutons de bascule shadcn `ghost icon` (icône 16 px dans 36 px, contre `IconButton small` à icône 24 px) ; barres du panneau en `Progress` (piste `bg-muted`, 4/8 px) ; typographie du panneau alignée sur `text-xs`/`text-sm` |
| `planning-dark` | régénérée — même chose, plus le changement le plus visible du lot : la **grille sombre** (bordures 12 % blanc) là où l'ancienne capture gardait les bordures gris clair par défaut de FullCalendar sur fond sombre, et les boutons en `--primary` clair à texte sombre |
| les dix autres de `captures.spec.ts`, les huit de `captures-ouvertes` | **inchangées**, byte-identiques (`git status` après `--update-snapshots` ciblé sur `captures.spec.ts`) |

## 8. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip) :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| `mui-material-libs` | 279.72 / 80.52 | 269.82 / 78.09 | **−9.9 / −2.4** |
| `vendor` | 885.95 / 280.54 | 891.04 / 282.21 | +5.1 / +1.7 (Progress, chips) |
| code applicatif (index) | 316.44 / 84.30 | 319.83 / 85.03 | +3.4 / +0.7 |
| CSS | 104.00 / 16.61 | 106.68 / 17.02 | +2.7 / +0.4 (bloc `.fc`, utilitaires progress/chips) |
| `mui-libs`, tanstack, fullcalendar, recharts, runtime | — | — | 0 (hashs identiques, `mui-libs` à −0.01) |

**Net sur le fil : +1,3 kB rendus, +0,4 kB gzip.** Franchement : la
contrepartie Base UI du lot 13 **ne se rentabilise pas encore** — c'est
plat. La décrue MUI est la plus forte depuis le lot 11 (−9,9 kB, contre
−7,3 au lot 13) parce que `Dialog`, `Snackbar`, `LinearProgress`,
`Autocomplete` sortent d'un fichier chacun… mais ils restent importés
ailleurs (`Autocomplete` par les trois pages note, `Dialog` par dix), donc
ne quittent pas le chunk ; et `Progress` + les chips du combobox entrent
dans `vendor` pour autant. La vraie rentabilisation viendra quand
`mui-material-libs` disparaîtra d'un bloc, pas d'un lot à l'autre.

Par paquet (visualizer, tailles rendues, même méthode des deux côtés — les
chiffres de référence sont ceux de **cette** mesure du commit 8317e1c, pas
la colonne « après » du lot 13, mesurée dans d'autres conditions) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/material` | 528.2 | 494.7 | **−33.4** |
| `@base-ui/react` | 601.7 | 602.2 | +0.5 (progress +4.5, compensé par le rééquilibrage) |
| code applicatif | 655.7 | 659.8 | +4.1 |
| `recharts` | 576.9 | 566.6 | −10.3 (rééquilibrage de modules partagés, recharts inchangé — même phénomène qu'aux lots 12/13) |
| `react-day-picker` / `date-fns` | 143.9 / 120.2 | 138.5 / 116.6 | −5.4 / −3.6 (idem) |
| `lucide-react` | 46.4 | 42.2 | −4.2 |

Lockfile : **+0 / −0 / 0 montée** — `progress` entre par le CLI shadcn,
`package.json` et `package-lock.json` sont byte-identiques à 8317e1c.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep @mui/material` sur les trois fichiers de programme | ✅ zéro occurrence (39 importateurs restent dans `src/`) |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 |
| Suite e2e (contre le build du lot, hash du script servi vérifié par `curl` et chaînes du lot cherchées dans le JS **et** le CSS servis) | make ❌ 2 captures (§7, régénérées) → **npx ✅ 63 (3,3 min) → make test-ihm ✅ 63 (3,6 min) — deux exécutions consécutives vertes, points d'entrée alternés, contre le build final** (hash `index-DA3M7uE2.js`) |
| Sélecteurs/assertions e2e | zéro modification — quatorzième lot consécutif |
| Ordre des couches CSS (invariant 11) | ✅ première feuille = `@layer theme, base, mui, components, utilities;` (Emotion), bloc `.fc` en `components`, FullCalendar hors couche comme avant |
| Page témoin `_cohabitation`, `ChampDate`/`ChampDateHeure` | intacts (aucune ligne modifiée) |
| Données | les deux réservations, le résultat TOEIC, la mobilité et le membre de groupe créés pour la vérification ont été supprimés depuis l'interface ; planning à zéro, listes vides |

Commits : `UserSelector` (seul) → HeuresPanel → ReservationDialog (+
`ChampCase`, chips nommés, clés) → Planning + habillage → correctif de la
modale constaté au navigateur → captures → doc + CLAUDE.md.

## 10. Ce qui n'a pas été traité

- **Changer l'élève d'un résultat TOEIC en édition est sans effet** (§2) :
  `UpdateToeic` n'écrit pas `user_id`. Défaut Go/contrat d'écran,
  pré-existant, signalé avec preuve, non corrigé.
- **`HeuresPanel` : dépassement et « sans affectation » non vus à l'écran**
  (§5) — logique inchangée, rendu seul migré.
- **`ChampMultiple` reste local** à `ReservationDialog` (§3) ; il montera
  au partagé si un second écran le demande.
- **`ChampSelection` en chaînes** : un identifiant numérique se convertit à
  la soumission (§3). Un `ChampSelection<number>` demanderait de typer les
  options ; non fait.
- `ChampDate`/`ChampDateHeure` restent des `TextField` MUI au milieu de
  champs shadcn (interdit de retouche ; leur libellé flottant a même exigé
  la marge de tête du corps défilant, §5).
- Interdits respectés : FullCalendar en place ; workflows hors périmètre
  intacts ; page témoin ; défauts du lot 13 §9 (colonne « Rôles », message
  zod brut) et pré-existants (`BarreAxes`, mode/OS, chemin mort de
  `NoteControle` — traversé par URL pour la vérification, sans y toucher —,
  `registre.spec.ts` intermittent, aucun échec sur ce lot,
  `programme-import` Go) non touchés.
- `composantsTraduits` : trois consommateurs restants, tous dans note (§6).
