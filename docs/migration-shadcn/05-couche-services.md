# Étape 5 — la couche services/ hors crud (migration MUI → shadcn/ui)

But de ce lot : migrer vers shadcn/Base UI les huit fichiers de
`front/src/services/` (hors `services/crud/`) qui touchaient MUI — le fil de
contexte, la barre de workflows, la garde de sortie, les dialogues et
sélecteurs partagés — sans toucher une seule page. C'est le premier lot où la
couche migrée **produit les rôles ARIA que la suite e2e cible** (`tab`,
`menuitem`, `combobox`, `dialog`, `navigation`) : la promesse « les rôles
survivent au changement de bibliothèque » y était réellement testée.

Verdict tenu : **zéro assertion modifiée, zéro sélecteur adapté** — les deux
conditions d'arrêt prévues par la commande (rôle `tab` introuvable,
libellés du thème intransportables) ne se sont pas présentées, vérification faite
avant écriture (§1).

## 1. Constaté avant toute écriture (vs déduit)

- **Constaté dans les sources du paquet installé** (`@base-ui/react` 1.7.0,
  avant d'écrire une ligne) : `Tabs.Tab` pose `role="tab"`,
  `aria-selected`, `aria-controls` (`TabsTab.js:178-180`), `Tabs.List` pose
  `role="tablist"` (`TabsList.js:84`), et `activateOnFocus` est **false par
  défaut** (`TabsList.js:26`) — même activation manuelle que MUI, les
  flèches déplacent le focus sans naviguer. `Tabs.Root` accepte
  `value={null}` (« aucun onglet actif », l'équivalent du `value={false}`
  MUI). Les sept tests ciblant `tab` n'avaient donc rien à craindre.
- **Constaté, et cela corrige la commande** : le `combobox` « Élève de la
  période » de notes-unifie.spec.ts (l.38, 97) et de `allerAAxeEleve` n'est
  **pas** rendu par `UserSelector`, mais par l'`Autocomplete` MUI propre à
  `NoteEleveAxe.tsx` (clé `noteEleveAxe.eleveLabel`), hors périmètre.
  `UserSelector` (« Rechercher un élève », `userSelector.rechercherEleve`)
  n'est monté sur cet écran qu'en mode « Tous les élèves ». Ces deux tests
  n'étaient donc pas menacés — et n'ont pas bougé.
- **Constaté** : `composantsTraduits` (thème MUI, `layouts/dashboard.tsx`)
  ne fournit aux `Autocomplete` que les noms des trois boutons dessinés
  (ouvrir/fermer/effacer) — le **nom accessible** du champ `UserSelector`
  vient de son label i18n propre, pas du thème. Porter les libellés ne
  demandait donc pas de toucher aux pages (§4).
- **Constaté** (`grep` par composant, hors périmètre du lot) : aucun
  composant MUI ne perd ici son dernier consommateur *bundlé*. `Tabs`/`Tab`
  restent montés par `NoteEleveAxe` (onglets de périodes), `Autocomplete`
  par six occurrences dans quatre pages, et `Menu` — dont ce lot retire
  pourtant les deux derniers usages directs — reste embarqué par le `Select`
  MUI des pages (`Salle`, `ReservationDialog`, `MobiliteInternationale`).
  Les candidats « plausibles » de la commande sont réfutés par la mesure
  (§8) : la décrue de `@mui/material` attendra les pages, comme au lot 4.
- **Constaté à l'écran, corrigé en commit dédié** : le conteneur
  `overflow-x-auto` posé autour des onglets (l'héritier du
  `variant="scrollable"` MUI) faisait naître un **ascenseur vertical
  permanent** — le soulignement de l'onglet actif (variante `line`,
  `after:bottom-[-5px]`) déborde de quelques pixels sous la liste. Un
  dégagement `py-1` sur la racine `Tabs` l'absorbe (et redonne à la barre
  ses ~40 px MUI). Invisible de la suite : rôles et textes restaient
  accessibles. Ajouté aux pièges CLAUDE.md.

## 2. Correspondance fichier par fichier

| Fichier | MUI retiré | Remplaçant | Notes |
|---|---|---|---|
| `context/WorkflowLayout.tsx` | Box ×3 | `<div>` + classes | Composition pure, rien d'autre. |
| `LanguageSwitcher.tsx` | IconButton, Menu, MenuItem, ListItemText, Tooltip | DropdownMenu + Tooltip Base UI, Button `ghost icon` | Icône `Translate` MUI conservée (décision lot 4). Plus d'ancre à tenir. Langue active distinguée par style (`bg-accent font-medium`) — le rôle reste `menuitem`, pas `menuitemcheckbox`, ce que i18n.spec.ts cible. `w-max` d'office (piège lot 4). |
| `UnsavedChangesDialog.tsx` | Dialog complet | Dialog Base UI | `initialFocus` sur « Rester » remplace le contournement `onEntered` du piège à focus MUI (même parti que `DeleteConfirmDialog`, lot 4). Pas de croix (parité) ; Échap et clic dehors = `onStay`, comme avant. |
| `LignesRefuseesDialog.tsx` | Dialog, Table complet | Dialog Base UI + `<table>` natif nommé | `aria-label` conservé sur la table (import-erreurs.spec.ts la cible par rôle+nom) ; `sm:max-w-4xl` ≈ `maxWidth="md"`. |
| `context/BarreWorkflows.tsx` | Box, Tab, Tabs | Tabs Base UI (`ui/tabs.tsx`, variante `line`) | Sélection par **identifiant de workflow** (`value={workflow.id}`, `null` hors barre) au lieu de l'index MUI. Le choix navigue (`onValueChange`), l'onglet actif ne renavigue pas (Base UI ne rappelle pas pour la même valeur — vérifié à l'écran). Débordement : `overflow-x-auto` sur la racine + `py-1` (§1). |
| `UserSelector.tsx` | Autocomplete, TextField, CircularProgress | Combobox Base UI (`ui/combobox.tsx` + `input-group`/`textarea`), Label + Input, Spinner | `filter={null}` (filtrage serveur), debounce 500 ms et câblage react-hook-form inchangés au caractère près. Label visible au-dessus du champ (le nom accessible que portait le label flottant MUI). État vide traduit (`userSelector.aucuneOption` fr/en — MUI affichait « No options » en dur, entorse pré-existante résorbée par la migration). Nuance de parité assumée : le bouton Effacer n'apparaît qu'avec une **valeur choisie** (Base UI), pas dès la frappe (MUI). |
| `context/SelecteurNiveau.tsx` | Button, Menu, MenuItem, ListItemText, Divider, Box, Typography, Skeleton, TextField | DropdownMenu + Button `ghost` + Input + Skeleton shadcn | Icône `ArrowDropDown` MUI conservée. `aria-haspopup/expanded/controls` posés par Base UI (l'ancien `identifiantMenu` manuel disparaît). Requête toujours **à l'ouverture seulement** (état `ouvert` contrôlé + `skipToken`), clé de cache du repository inchangée (invariant 2). Saisie filtrante : focus via `onOpenChangeComplete` (parité `autoFocus` MUI), `stopPropagation` sauf flèches/Échap, conservés. « Réessayer » : `closeOnClick={false}` (le menu MUI restait ouvert aussi). « Voir la liste » : `render={<RouterLink>}` — rôle `menuitem`, fermeture au choix. |
| `context/FilContexte.tsx` | Stack, Typography | `<nav>` + `<span>` + classes | `aria-label` du fil, `aria-current="page"`, séparateurs `aria-hidden` : conservés à l'identique. |

Composants ui/ ajoutés par `npx shadcn add tabs combobox` : `tabs.tsx`,
`combobox.tsx`, `input-group.tsx`, `textarea.tsx` (dépendance
d'input-group) — fichiers locaux uniquement, `package.json` et lockfile
**strictement inchangés** (+0 / −0 / 0 montée parasite). Adaptations
locales commentées : exports non-composants retirés (`tabsListVariants`,
`useComboboxAnchor` — règle react-refresh, même motif que la séparation
button/button-variants), et libellés traduits par défaut dans
`combobox.tsx` (§4, précédent : le « Close » de `dialog.tsx` au lot 3).

## 3. Ce que la suite e2e a gardé, test par test

Aucune assertion ni aucun sélecteur modifiés. Vérifié à l'exécution
complète : au premier passage après migration, **47 tests fonctionnels
verts, 16 échecs tous en comparaison d'images** (§5) — aucun échec de rôle,
de nom accessible ou de comportement.

| Ancrage | Tests | Garanti par |
|---|---|---|
| `tab` + nom (7 usages listés par la commande, plus droits.spec.ts et l'aide `remonterDepuisUrlActuelle`) | navigation.spec.ts:50,58,67 ; formulaire.spec.ts:36 ; captures.spec.ts:50 ; i18n.spec.ts:13,18,19,24,25,47 ; clavier.spec.ts:99 ; droits.spec.ts:11,19,68 | `Tabs.Tab` Base UI pose `role="tab"`/`aria-selected` ; `getByRole('tab', { selected: true })` de l'aide s'appuie sur le même `aria-selected` |
| `menuitem` « English »/« Français » | i18n.spec.ts:16,22,46 | `Menu.Item` Base UI pose `role="menuitem"` (le marquage « langue active » est resté un style, pas un rôle) |
| `menuitem` du fil + boutons « Niveau : Nom » | navigation.spec.ts:42,72-75 ; aide `choisirNiveau` (tous les parcours `allerJusquaPeriode`) | `aria-label` interpolé inchangé (`selecteurNiveau.ariaLabelNiveau`), items `menuitem`, `exact: true` toujours possible |
| `navigation` nommée « Fil d'Ariane » | navigation.spec.ts:82 | `<nav aria-label>` natif |
| `combobox` « Élève de la période » | notes-unifie.spec.ts:38,97 ; aide `allerAAxeEleve` | composant de page MUI, **hors périmètre, non touché** (§1) |
| `dialog` « Modifications non enregistrées » + boutons | formulaire.spec.ts:59-95 | Dialog Base UI relié par `aria-labelledby` (Title) ; libellés inchangés |
| `dialog` « Import refusé » + `table` nommée + `row` | import-erreurs.spec.ts | table native + `aria-label` conservé |
| Captures | captures.spec.ts, captures-ouvertes.spec.ts | §5 |

Ce que la suite ne garantit toujours pas (inchangé) : la saisie filtrante du
`SelecteurNiveau` (aucun niveau du seed ne dépasse `SEUIL_RECHERCHE` = 12) —
vérifiée à l'écran par abaissement temporaire du seuil (§6) ; le mode
lecture seule d'`UserSelector` (aucun écran du parcours e2e ne le monte).

## 4. Le sort des libellés de `composantsTraduits`

Les trois libellés que le thème MUI fournissait aux `Autocomplete`
(`autocomplete.ouvrir/fermer/effacer`) sont **portés sur le composant** :
`ui/combobox.tsx` pose désormais `aria-label={t('autocomplete.ouvrir')}`
sur son Trigger et `t('autocomplete.effacer')` sur son Clear, en défauts
surchargeables — le précédent du « Close » traduit de `dialog.tsx`. Vérifié
à l'écran dans les deux langues (« Ouvrir la liste »/« Open »,
« Effacer »/« Clear »).

- `autocomplete.fermer` n'est **pas** consommé par le composant migré :
  Base UI pose `aria-expanded` sur le champ, l'alternance Open/Close du
  bouton MUI était redondante avec cet état. La clé reste vivante pour les
  pages MUI.
- `composantsTraduits` perd donc **un consommateur (UserSelector)** et en
  garde **six occurrences d'`Autocomplete` dans quatre pages**
  (ReservationDialog ×3, NoteEleveAxe, GrilleNotes, FicheExportModal — le
  commentaire du thème qui en annonce « six » comptait l'ensemble). Le
  mécanisme disparaîtra avec la migration de ces quatre fichiers ; ses clés
  sont déjà branchées sur `ui/combobox.tsx` et n'auront pas à bouger.

## 5. Journal de réacceptation des captures

Seize références régénérées (`--update-snapshots`), **chaque image regardée
avant commit**, plus les six recouvrements de diff examinés avant
régénération. Les **quatre captures des dialogues de suppression sont
restées vertes sans régénération** — elles cadrent le dialogue seul, sans
barre ni fil, ce qui confirme en creux le périmètre.

Changement commun aux seize, et unique cause identifiée : la barre de
workflows change de métrique — onglets shadcn (variante `line`,
soulignement sous l'actif, casse et graisse légèrement différentes, barre
48 → ~40 px) et fil de contexte resserré sur la même rangée — et tout
l'écran remonte de quelques pixels. Sous ce décalage, les contenus métier
sont identiques : arbre, tables MRT, notes du seed (Eleve2 : 11 validée,
Eleve4 : 7), calendrier de la semaine figée, dialogues MUI des pages.

| Capture | Spécifique constaté, au-delà du changement commun | Attendu ? |
|---|---|---|
| formation-liste (light/dark) | Rangée d'onglets seule ; pas de fil (Structure = arbre) | oui |
| grille-saisie (light/dark) | Fil complet, niveaux profonds inclus (UE/MATIÈRE/CONTRÔLE), « Notes » inerte passant à la ligne — le fil MUI passait aussi à la ligne | oui |
| certification-toeic (light/dark) | Fil à deux niveaux (le workflow s'arrête à la promotion) | oui |
| planning (light/dark) | Fil à quatre niveaux + « Programme » ; FullCalendar au pixel près | oui |
| note-graphique (light/dark) | Modale MUI de la page inchangée ; seul le liseré d'écran visible derrière bouge | oui |
| jury-deliberer-dialog (light/dark) | Le fil tient désormais sur la rangée des onglets (à droite) au lieu de déborder dessous ; dialogue MUI inchangé | oui |
| menu-actions (light/dark) | Menu déployé identique (3 entrées, séparateur, « Supprimer » destructif, largeur `w-max`) ; seul l'arrière-plan bouge | oui |
| menu-compte (light/dark) | Menu de compte identique ; seul l'arrière-plan bouge | oui |

Aucun diff surprenant ; aucune capture réacceptée sans lecture.

## 6. Vérification à l'écran — les six surfaces, deux modes, deux langues

Build conteneurs (`make start-scolarite`), compte admin, mode sombre forcé
par le stockage `mui-mode` (source unique MUI, invariant 12 — la classe
`.dark` a suivi partout).

| Surface | Vérifié | Modes/langues |
|---|---|---|
| Sélecteur de langue | menu déployé, langue active marquée, bascule effective (onglets, aria-labels du chrome suivent), fermeture au choix | clair FR/EN, sombre FR |
| Garde de sortie | provoquée réellement (saisie puis Annuler) : s'interpose, focus initial sur « Rester », « Rester » préserve la saisie, « Quitter » sort **sans créer** (liste revérifiée vide), deux boutons `type="button"` | clair FR, sombre FR, sombre EN |
| Lignes refusées | import fautif réel (fiche générée sur le modèle de `ficheFautive.ts`, contrôle 17) : dialogue nommé, tableau 2 lignes, motifs traduits, « Fermer » ; la seule erreur console est le 400 attendu | clair FR, sombre EN |
| Fil de contexte | menu ouvert à **chaque** niveau : formation/promotion/option/période (partagés) + UE/matière (profonds, frère courant marqué, « Voir la liste » = lien routeur derrière séparateur, absent quand la liste est l'écran courant) ; bascule profonde conserve le segment enfant (`/ue/7/note`) ; choisir le frère courant ne navigue pas ; niveau élève profond vu après choix | clair FR + EN (« Program: Choose », « Breadcrumb »), sombre FR |
| UserSelector | ouvert avec recherche réelle : spinner à la fin du debounce (sondé à 500 ms), options serveur (`role="option"`), état vide « Aucune option », choix → navigation `/eleve/14/note` (mode axe) et remplissage du formulaire (TOEIC), « Ouvrir la liste »/« Effacer » posés | clair FR, sombre FR/EN |
| Barre de workflows | chaque onglet cliqué (le contexte suit : Notes→Jury→Programme→Certifications), clic sur l'onglet **actif** sans effet, soulignement non rogné après correctif §1 | clair FR/EN, sombre FR |

Complément hors seed : la **saisie filtrante** du sélecteur de niveau
(aucune donnée locale ne dépasse 12 frères) a été vérifiée en abaissant
temporairement `SEUIL_RECHERCHE` à 3 — protocole du test négatif :
modification locale, reconstruction, vérification, restauration, `git diff`
vide. Constaté sur le menu UE (11 frères) : filtre monté **et focalisé** à
l'ouverture (`onOpenChangeComplete`), la frappe filtre sans que le menu ne
vole les touches (le typeahead Base UI est bien neutralisé par le
`stopPropagation`), ArrowDown passe le focus aux entrées, Entrée navigue en
conservant le segment enfant, Échap rend le focus au déclencheur, le filtre
est remis à zéro à la réouverture.

Aucun plantage au montage d'aucun popup (piège lot 3) ; un défaut trouvé et
corrigé pendant la passe (l'ascenseur des onglets, §1) — les cinq défauts
sur quatre lots trouvés « à l'écran et par rien d'autre » deviennent six
sur cinq.

## 7. Vérifications finales

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` + vite) | ✅ |
| `make test-ihm` (run 1, après réacceptation) | ✅ 63 passed (3 min 48) |
| `npx playwright test` (run 2, autre point d'entrée) | ✅ 63 passed (3 min 48) |
| Build Go (`back/`) | ✅ |
| `go test ./...` (`back/`) | ✅ sauf un échec **pré-existant et hors périmètre** : `cmd/programme-import/pkg/extraction` (fixture `test_salle.csv` absente du dépôt ; aucun fichier Go touché par ce lot, dossier inchangé depuis « séparation des espaces de travail ») — signalé, non corrigé |
| Lockfile | +0 / −0 / 0 montée parasite (aucun `npm install` ; `npx shadcn add` n'a créé que des fichiers) |
| `git diff` après le test du seuil abaissé | ✅ vide |

## 8. Bundle — par paquet, contre la référence figée d'avant-lot

Méthode du lot 3 §9 (visualizer, tailles rendues, référence construite sur
le commit d'avant-lot avant la première écriture). Tout ce qui bouge de
plus de 0,1 kB :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@base-ui/react` | 345.6 | 469.3 | **+123.7** (moteur combobox/autocomplete, tabs) |
| code applicatif | 574.4 | 587.9 | +13.5 (ui/combobox, input-group, tabs, textarea) |
| `lucide-react` | 6.0 | 6.7 | +0.7 |
| **`@mui/material`** | **605.2** | **605.2** | **0.0** |

**Aucun composant MUI ne perd son dernier consommateur bundlé** — mesuré,
pas supposé. Les candidats de la commande sont réfutés un à un : `Tabs` et
`Tab` restent montés par `NoteEleveAxe` (onglets de périodes du relevé),
`Autocomplete` par six occurrences dans quatre pages, et `Menu`, dont ce
lot retire les deux derniers **imports directs**, reste embarqué comme
rouage interne du `Select` MUI de trois pages. Le coût net du lot est
~+138 kB rendus, dominé par le moteur combobox de Base UI — le prix, payé
une fois, de la primitive qui remplacera les six `Autocomplete` restants ;
la décrue de `@mui/material` commencera avec les pages, constat identique
au lot 4.

## 9. Ce qui n'a pas été traité

- Les six occurrences d'`Autocomplete` MUI des pages, `composantsTraduits`
  et l'alternance Open/Close de son `closeText` : partiront avec la
  migration des quatre pages concernées (§4).
- `List.tsx` (services/crud) reste à cheval sur material-react-table —
  périmètre du lot des tables, comme acté au lot 4.
- La bascule des icônes vers lucide : lot dédié suivant ;
  `LanguageSwitcher` et `SelecteurNiveau` gardent leurs deux icônes MUI.
- Le mode lecture seule d'`UserSelector` (Label + Input désactivé) : typé
  et rendu, mais aucun écran ne l'a exercé au navigateur — aucun parcours
  local ne monte ce composant en consultation.
- Nuance de parité assumée sur `UserSelector` : le bouton Effacer
  n'apparaît qu'une valeur choisie (§2) ; personne n'a tranché qu'il
  faille reproduire le comportement MUI (effacer dès la frappe), à
  rediscuter si un utilisateur s'en plaint.
- L'échec Go pré-existant `cmd/programme-import/pkg/extraction` (§7) :
  signalé, hors périmètre.
- Défauts pré-existants intacts : rendu figé `BarreAxes`, rebond Keycloak
  sur lien profond froid (`test.fail` en place), URL mémorisée sur id
  re-semé.
