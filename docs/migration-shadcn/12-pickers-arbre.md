# Étape 12 — pickers et arbre : les deux derniers paquets @mui/x-*

Deux sujets sans rien en commun, traités séparément : les cinq écrans à
`DatePicker`/`DateTimePicker` passent à un composant de date partagé
(`ChampDate`/`ChampDateHeure`), et l'arbre de la structure s'écrit à la main.
`@mui/x-date-pickers` et `@mui/x-tree-view` quittent `package.json`.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire annoncé est exact** : cinq écrans à pickers + `App.tsx`
  (`LocalizationProvider`/`AdapterDayjs`) pour x-date-pickers ;
  `ArbreStructure.tsx` seul importateur de x-tree-view. Le garde
  `dayjs(undefined)` était écrit huit fois (2+2+1+2 ; `ReservationDialog`
  n'en avait pas besoin, son état était déjà `Dayjs | null`).
- **Le balisage que les tests exigent, lu dans les sources du paquet**
  (méthode lot 5) : `role="treeitem"` + `aria-expanded`/`aria-disabled` sur
  le `li` (`useTreeItem.js:154`), enfants en `role="group"`, et — le choix
  MUI, pas celui de l'APG — **`aria-checked` true/false posé par le plugin
  de sélection** (`internals/plugins/selection/itemPlugin.js:74`), pas
  `aria-selected`. C'est ce qu'affirme `navigation.spec.ts:61`. Quatre
  fichiers e2e ciblent des `treeitem` ; **aucun ne touche un picker**.
- **Aucune capture de référence ne montre un picker** ; en revanche les
  cinq sujets capturés sur fond d'écran Structure montrent l'arbre.
- `Popover.Positioner` de Base UI **jette sans `Popover.Portal`** (vérifié
  dans `PopoverPortalContext.js`) ; le portail accepte un `container` —
  c'est la voie pour rester dans le sous-arbre d'une modale MUI.
- Référence bundle figée avant-lot (build du commit lot 11, visualizer) :
  `@mui/x-date-pickers` 394,1 kB rendus, `@mui/x-tree-view` 106,7,
  `@mui/x-internals` 7,7.

## 2. Le composant de date partagé, et son contrat

`services/ChampDate.tsx` — la recette shadcn adaptée au terrain : le champ
est un **`TextField` MUI** (les formulaires porteurs restent MUI, l'interdit
du lot le confirme ; un champ shadcn isolé y détonnerait), le popup un
**`Popover` Base UI** (`components/ui/popover.tsx`, nouveau), le calendrier
**react-day-picker v9** (`components/ui/calendar.tsx`, stylé tokens, sans sa
feuille de style — les états d'un jour se stylent par les `data-*` que le
paquet pose sur la cellule, pas par les clés d'état de l'énum `UI`, qui
empileraient des classes de même spécificité à l'ordre imprévisible).

Contrat (`PropsChampDate`) :

- `value: Date | string | null | undefined` → `onChange(Date | null)`.
  `label`, `disabled`, `error`, `helperText`, `fullWidth`, `sx` passés au
  TextField — les écrans gardent leur câblage `Controller` inchangé, en
  plus court.
- **Saisie vide → `null` ; saisie inanalysable → `Date` invalide** transmis
  tel quel : les `z.coerce.date()` des schémas le refusent à la soumission,
  le message arrive sur le bon champ par le circuit existant — même
  comportement que du temps de MUI, aucun circuit d'erreur local.
- Parse **strict** au format localisé (`dayjs`, plugins `customParseFormat`
  + `localizedFormat`, formats `L` et `l`) : « 31/02/2026 » et « 12/05 »
  sont refusés, « 1/9/2026 » est accepté puis normalisé « 01/09/2026 » au
  blur. Placeholder i18n (`JJ/MM/AAAA` / `MM/DD/YYYY`).
- La locale se pose **instance par instance** (`.locale(...)` d'après
  `i18n.resolvedLanguage`) — dayjs global reste `en`, même principe que
  l'`adapterLocale` retiré. L'import `dayjs/locale/fr` a déménagé
  d'`App.tsx` vers `ChampDate.tsx` avec le `LocalizationProvider`.
- Le texte local est synchronisé sur la valeur externe par **ajustement
  pendant le rendu** (pas un effet : `set-state-in-effect` est une erreur
  de lint ici), jamais pendant la frappe — reformater sous les doigts
  détruirait la saisie ; comparaison par `Object.is` sur `getTime()`
  (NaN doit être égal à lui-même).
- `conteneurPopup?: RefObject<HTMLElement | null>` : voir §4.

### Comment le garde `dayjs(undefined)` a été traité

Il **vit dans le composant, une fois pour toutes** : `normaliser(value)`
rend `null` pour `null`/`undefined` — plus aucun écran ne peut rouvrir le
piège de la date du jour pré-remplie, et les huit gardes avec leur
`eslint-disable @typescript-eslint/no-unnecessary-condition` disparaissent.
Le commentaire historique est conservé en tête de `ChampDate.tsx`.

**Et le garde ne suffisait pas** — défaut trouvé au navigateur, invisible de
la compilation comme des 63 tests : en **édition**, react-hook-form est
`reset` avec la réponse de l'API telle quelle, où les dates sont des
**chaînes ISO** (la coercion `z.coerce.date` ne joue qu'à la soumission).
L'ancien `dayjs(field.value)` les avalait sans le dire ; le premier
`formater()` appelait `value.getTime()` et faisait tomber tout l'écran de
détail (ErrorBoundary). D'où le type `Date | string | ...` et `normaliser` —
c'est le dixième défaut de la migration trouvé à l'écran et par rien d'autre.

## 3. Le cas DateTimePicker (`ChampDateHeure`)

Composition jugée proportionnée, pas de condition d'arrêt levée :
`ChampDate` pour la date + **`<input type="time">` natif** (TextField MUI)
pour l'heure — pas de roue d'horloge à recomposer. Une heure saisie avant
toute date est retenue localement et rattachée au premier jour choisi
(`combiner` ; attention : `''.split(':')` rend `['']` dont `Number` fait
NaN, le cas vide est traité à part). `ReservationDialog` passe ses deux
états de `Dayjs | null` à `Date | null` (seuls `toISOString()` et le
`disabled` du bouton s'en servaient) ; dayjs y reste pour le formatage des
horaires de conflit (l.161-162), hors périmètre pickers. Les deux champs
passent côte à côte → l'un sous l'autre (chacun fait déjà deux champs) —
aucune capture ne fige ce dialogue.

`handleSubmit` et le bouton Créer exigent désormais `dateComplete` (non-null
**et** valide) : un `Date` invalide en cours de saisie ne peut plus partir
en `toISOString()`.

## 4. Le piège à focus de la modale MUI, traité par `container`

Un popup Base UI portalé vers `<body>` depuis un `Dialog` MUI serait fermé
sitôt ouvert : le piège à focus de la modale reprend le focus dès qu'il
sort de son sous-arbre. Le `Popover.Portal` étant obligatoire, la solution
est son `container` : `ReservationDialog` passe la ref de son `Stack` via
`conteneurPopup`, le calendrier se rend **dans** la modale. Vérifié ouvert
au navigateur (piège lot 3 §5) : sélection d'un jour opérante, Échap ferme
le popover **sans** fermer la modale.

## 5. L'arbre — ce que rend le remplaçant, rôle par rôle

`ArbreStructure.tsx` réécrit sans bibliothèque (~460 lignes ; `Collapsible`
Base UI écarté : il pose `aria-expanded` sur un bouton déclencheur, les
tests l'exigent sur le `li`). Requêtes, projection `select`, clés de cache
partagées, `NoeudVide`/`NoeudInerte`, étiquettes (Typography MUI + icônes
lucide du lot 6) : inchangés. Le balisage reproduit le constat MUI :

| MUI x-tree-view | Remplaçant |
|---|---|
| `ul role="tree"` + aria-label | idem |
| `li role="treeitem"`, aria-label | idem (`LigneArbre`) |
| `aria-expanded` si dépliable | idem (absent des feuilles ; MUI rendait en plus un `role="group"` vide — supprimé) |
| **`aria-checked` true/false** (sélection), absent si inerte | idem — `navigation.spec.ts` l'affirme |
| `aria-disabled` sur nœuds inertes | idem, non focalisables |
| enfants en `ul role="group"` | idem, **monté seulement déplié** (l'`unmountOnExit` de MUI ; le nœud fermé n'a plus besoin d'enfant fantôme « … » pour être dépliable) |
| tabindex tournant | idem : focalisé, sinon sélectionné, sinon premier nœud |
| clavier : flèches, Home/End | par **délégation** sur la racine, ordre visuel = ordre document (`querySelectorAll`) ; droite déplie puis descend, gauche replie puis remonte |
| Entrée/Espace | sélectionnent (la surcharge « Entrée = clic » du maître-détail est conservée, en plus simple : plus de `defaultMuiPrevented`) |
| chevron déplie seul | idem (`stopPropagation`, focus explicite du `li` — tous les navigateurs ne remontent pas le focus à l'ancêtre) |
| typeahead (recherche à la frappe) | **non repris** — aucun test ni usage |

Cas limite assumé : si la sélection est repliée hors de vue et que rien n'a
encore été focalisé, l'arbre n'a pas de point d'entrée Tab (MUI le
recalculait). Aux flèches et au clic, rien ne change.

**Zéro sélecteur ni assertion modifié** — les `treeitem` de
`corbeille.spec.ts`, `navigation.spec.ts` (aria-checked) et le parcours
`hierarchieE2E.ts` passent tels quels ; douzième lot consécutif.

## 6. Vérification à l'écran — le lot où ça compte

Compte `test-e2e`, build conteneurs **reconstruit d'abord** (`make
start-scolarite` — le piège du build figé, lot 11 §4, vérifié par
comparaison du `src` du script avec `curl`). Pilotage MCP.

| Vérification | Résultat |
|---|---|
| Création (Promotion ×2, Période ×2, TOEIC, Mobilité ×2) | champs **vides**, pas à aujourd'hui ; calendrier ouvert sur le mois courant, aucun jour sélectionné |
| Édition/consultation (Promotion, Période) | dates affichées au format de la langue ; consultation : champ **et** bouton calendrier désactivés |
| Saisie clavier | « 1/9/2026 » accepté → normalisé « 01/09/2026 » au blur ; sélection au calendrier ferme le popup et remplit le champ |
| Effacement | champ vide, valeur `null`, pas de plantage |
| Date invalide | « 31/02/2026 » : soumission bloquée, `aria-invalid` + message zod sur le bon champ, texte fautif conservé à l'écran |
| Français / anglais | placeholders JJ/MM/AAAA ↔ MM/DD/YYYY, valeurs reformatées à la bascule, calendrier fr lundi-first ↔ enUS dimanche-first, aria-labels des jours localisés ; « 31/12/2026 » refusé en anglais |
| Clair / sombre | popup, calendrier et arbre suivent `.dark` (emulateMedia posé avant navigation, piège lot 4bis) |
| ReservationDialog | créneau glissé pré-rempli (02/09 12:00→13:30) ; calendrier ouvert **dans** la modale, Échap ne ferme que lui ; heure native éditable ; création 201 ; **chevauchement : « Le groupe TD1 est déjà planifié de 09:00 à 10:30 »** (formatage l.161-162), modale restée ouverte sur l'alerte ; édition pré-remplie ; suppression — planning remis à zéro, rien de persisté |
| Arbre | aria-checked/expanded/disabled conformes (tableau §5), flèches/Entrée/chevron vérifiés un à un, sélection ↔ URL dans les deux sens |
| Console | 0 erreur inattendue (le 409 du test de conflit est le comportement testé) |

Aucune donnée résiduelle : INFRES18 jamais soumis (Annuler + garde), la
réservation de test supprimée par le dialogue lui-même.

## 7. Journal des captures — dix régénérées, justifiées une à une

Les dix échecs de captures du premier run avaient **une seule cause** : les
lignes de l'arbre (décalage de quelques pixels, chevron/graisse) — vérifié
en regardant chaque `*-diff.png` avant toute régénération. Les cinq sujets
sont tous photographiés sur fond d'écran Structure où l'arbre est visible :
`formation-liste` (light+dark), `menu-actions`, `dialogue-suppression-simple`,
`dialogue-suppression-confirmation`, `menu-compte` (light+dark chacun). Les
menus, dialogues et tables y sont **pixel-identiques** ; les dix autres
références n'ont pas bougé d'un octet. Régénération ciblée
(`--update-snapshots` sur les deux specs), chaque nouvelle image regardée
avant commit.

## 8. Bundle — par chunk et par paquet, contre la référence d'avant-lot

Par chunk (kB minifiés / gzip) :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| `mui-material-libs` | 438.18 / 124.47 | 287.05 / 82.39 | **−151.1 / −42.1** (x-date-pickers) |
| `mui-libs` | 190.27 / 62.37 | 77.81 / 28.42 | **−112.5 / −33.9** (x-tree-view, x-internals) |
| **vendor** | 766.15 / 244.21 | 860.45 / 272.95 | **+94.3 / +28.7** (react-day-picker, date-fns) |
| code applicatif (index) | 299.74 / 79.70 | 306.02 / 81.78 | +6.3 / +2.1 (ChampDate, calendar, popover, arbre) |
| recharts | 360.02 / 104.07 | 364.31 / 105.56 | +4.3 / +1.5 (rééquilibrage de modules partagés, recharts inchangé) |
| CSS | 88.06 / 14.47 | 91.23 / 14.88 | +3.2 / +0.4 (utilitaires calendrier/arbre) |
| tanstack / fullcalendar / runtime | — | — | 0 |

**Net sur le fil : −155,5 kB rendus, −43,3 kB gzip.**

Par paquet (visualizer, tailles rendues, même méthode que les lots 3/6/11) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/x-date-pickers` | 394.1 | 0 | −394.1 |
| `@mui/x-tree-view` | 106.7 | 0 | −106.7 |
| `@mui/x-internals` | 7.7 | 0 | −7.7 |
| `react-day-picker` | 0 | 135.3 | +135.3 |
| `date-fns` + `@date-fns/tz` | 0 | 125.6 | +125.6 |
| `@base-ui/react` | 448.0 | 468.1 | +20.1 (popover) |
| `@mui/material` | 527.9 | 518.7 | −9.2 |
| code applicatif | 610.0 | 623.2 | +13.2 |

Réponse à la question posée : des 394,1 kB de `@mui/x-date-pickers`
restants après le lot 11, **tout part**. La contrepartie react-day-picker +
date-fns pèse 260,9 kB rendus — le paquet embarque date-fns comme moteur
(dates **et** locales : l'import `react-day-picker/locale` est un
`export * from "date-fns/locale"`, mais le tree-shaking tient — les ~650
modules de locales non utilisés survivent en coquilles vides, **3,7 kB**
superflus mesurés, pas de correction à faire). Échange pickers seuls :
−133 kB ; arbre : −107 kB contre ~+13 d'applicatif.

## 9. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep x-date-pickers\|x-tree-view` (src, e2e, package.json) | ✅ zéro occurrence |
| `npm run lint` / `tsc -b` / `npm run build` | ✅ 0/0 |
| Build Go / `go test` | ✅ / ✅ sauf l'échec pré-existant `programme-import/extraction` (fixture absente, lot 5) |
| Suite e2e (contre le build du lot) | make ❌ 53+10 captures (§7, régénérées) → **npx ✅ 63 (3,1 min) → make test-ihm ✅ 63 (3,1 min) — deux exécutions consécutives vertes, points d'entrée alternés** |
| Sélecteurs/assertions e2e | zéro modification — douzième lot consécutif |
| Lockfile | **+54 / −173 / 0 montée** — entrés : react-day-picker 9.14.0 et ses transitives (date-fns 4.4.0, @date-fns/tz, calendriers hijri/jalali) ; sortis : les deux x-*, x-internals (×2) et le doublon hoisté de @base-ui/utils (la copie de @base-ui/react reste) |
| Version react-day-picker | **9.14.0 épinglée ^9** — la v10 (10.0.1) est sortie pendant le lot, API non éprouvée, montée = chantier à part |
| Page témoin `_cohabitation` | toujours en place (dépose finale) |
| Données | INFRES18 intact ; réservation de test supprimée ; captures d'exploration purgées, rien commité |

Commits : composant partagé (+ dépendance) → les cinq écrans (+ App.tsx) →
l'arbre → retrait des dépendances → correctif chaînes ISO (constaté au
navigateur, §2) → captures → doc + CLAUDE.md.

## 10. Ce qui n'a pas été traité

- **Typeahead de l'arbre** (§5) et le point d'entrée Tab quand la sélection
  est repliée : écarts assumés vis-à-vis de MUI, documentés dans le fichier.
- L'effacement d'une date suivie d'une soumission passe `null` à
  `z.coerce.date`, qui en fait le 1ᵉʳ janvier 1970 (`new Date(null)`) —
  **comportement pré-existant à l'identique** (l'ancien `onChange` MUI
  passait le même `null`), signalé, non corrigé : le durcissement des
  schémas est hors périmètre.
- Hors périmètre, intacts : `BarreAxes`/rebond Keycloak (revu au passage :
  un `goto` profond retombe toujours sur `/`), validation `capacite`,
  désynchronisation mode/OS, chemin mort de `NoteControle`, passe-plat de
  `Salle.tsx`, `registre.spec.ts` intermittent (aucun échec sur ce lot),
  échec Go `programme-import`.
- Les libellés de niveaux de l'arbre (`niveaux.ts` : « Formation »,
  « Période »…) restent en français en dur — état antérieur au lot,
  inchangé (les noms accessibles `treeitem` des tests en dépendent).
