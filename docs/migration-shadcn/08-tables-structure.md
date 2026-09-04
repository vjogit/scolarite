# Étape 8 — les tables de structure et d'utilisateurs passent au socle DataTable

But de ce lot : appliquer en série le commutateur du lot 7 aux neuf écrans de
structure (`pages/structure/`) et d'utilisateurs (`pages/user/`). Un écran
migre en changeant la forme de ses colonnes (`columns` MRT → `colonnes`
TanStack) ; les surcharges de barre d'outils passent au contrat sans instance
(`renderTopToolbarCustomActions` → `actionsBarreOutils`, lot 7 §4). Rien
d'autre ne bouge : formulaires, dialogues et champs restent MUI ; les écrans
de note, jury et certification ne sont pas touchés.

## 1. Constaté avant toute écriture (vs déduit)

- **Les sept écrans homogènes avaient bien cinq points de contact MRT
  chacun** : l'import du type `MRT_ColumnDef`, la fonction de colonnes, le
  champ `columns:` du ViewConfig, le prop `renderTopToolbarCustomActions`
  destructuré, et sa recopie dans le mémo du datasource (avec dépendances).
- **Trois surcharges toolbar réelles seulement** sur ce périmètre :
  `CustomCrudUser` (bouton d'import), `CustomCrudPeriode` (import + export),
  et le défaut interne de `Groupe` (import multiple). Toutes trois ignorent
  l'instance de table — exactement ce que le lot 7 §1 avait recensé. Les
  routes (`enrober`) ne passent jamais de surcharge : le renommage n'a
  d'impact que sur ces trois fichiers.
- **Les écrans de structure sont montés par cinq workflows** (catalog, note,
  jury, certification, programme, en `TRAVERSEE`/`EDITION`). Migrer le
  *composant*, c'est migrer sa table dans tous ces workflows — c'est le
  périmètre voulu (le composant est l'écran), mais c'est ce qui explique le
  journal des captures ci-dessous : l'écran d'accueil (`/` →
  `/catalog_context/formation`) est la liste Formation migrée.
- **`captures-ouvertes.spec.ts` ne photographie pas les listes** : menu
  d'actions et dialogues de suppression s'y ouvrent depuis l'**arbre** de la
  structure (`allerSur*ViaStructure`, en-têtes « Formation — X »), pas depuis
  les tables. Déduit à la lecture, confirmé par le run : ces six captures
  n'ont pas bougé.
- `GroupeUserPage` : 8 points de contact confirmés (MRT direct + locales +
  `renderRowActions` + `mrtTheme`/`muiTablePaperProps`/`muiTableContainerProps`
  — l'un des trois consommateurs de `theme.palette` recensés au lot 2).

## 2. Écran par écran — ce qui a changé

| Écran | Geste | Au-delà du geste mécanique |
|---|---|---|
| `Formation.tsx` | forme des colonnes + renommage prop | rien |
| `Groupe.tsx` | idem | son défaut interne `defaultBarreOutils` typé `ActionsBarreOutilsProps<Groupe>` (le `Box` MUI de la surcharge reste — on ne migre pas les composants MUI hors table) |
| `Options.tsx` | idem | rien |
| `Ue.tsx` | idem, `Cell:` → `cell:` (oui/non) | rien |
| `Matiere.tsx` | idem | rien |
| `User.tsx` + `CustomCrudUser.tsx` | idem, `Cell:` → `cell:` (rôles) | la surcharge importe le type `User` pour se typer |
| `Periode.tsx` + `CustomCrudPeriode.tsx` | idem, `Cell:` ×2 (dates) | idem avec `Periode` |
| `Promotion.tsx` | table seule | **état mixte assumé** : les deux `DatePicker` MUI du formulaire sont intacts (lot 11), commenté en tête de `promotionColonnes` |
| `GroupeUserPage.tsx` | migration à part entière (§4) | — |

Le troisième écran n'a pas demandé de réfléchir, ni les suivants : le geste
est resté mécanique de bout en bout.

## 3. Verdict sur le contrat toolbar : il a suffi, sans extension

Première mise à l'épreuve en série du contrat du lot 7 §4
(`defaultActions` / `peutEcrire` / `lignesVisibles` paresseux, aucune
instance de table) :

- Les trois surcharges du périmètre n'utilisent que `defaultActions` et
  `peutEcrire` : **renommage pur**, aucun champ ajouté, aucune signature
  modifiée, aucun contournement local.
- `lignesVisibles` reste sans consommateur sur ce lot (son premier usage réel
  sera `useNoteChart`, lot 9).
- **CLAUDE.md n'a pas à bouger** : le contrat que les lots 9 et 10
  trouveront écrit est exactement celui du lot 7.

`meta` (`className`/`headerClassName`/`libelle`) n'a pas non plus trouvé de
consommateur ici : aucune colonne de ces écrans ne portait de style MRT.

## 4. GroupeUserPage — le cas détaillé

Il ne passe **pas** par `List` : il garde sa table propre, montée sur
`DataTable` en direct — le rôle que le lot 7 §3 lui destinait, pas un
changement d'architecture. Ce qui disparaît et ce qui le remplace :

| Avant (MRT direct) | Après (DataTable) |
|---|---|
| `useMaterialReactTable` + `MaterialReactTable` + locales fr/en importées à la main | `DataTable` (i18n `crud.json > table.*` du socle) |
| `mrtTheme` (`darken(palette.background.default)`) , `muiTablePaperProps` (flex pleine hauteur), `muiTableContainerProps` | le gabarit flex et le fond/cadre du socle, portés par les tokens du lot 2 (`bg-background text-foreground`, `rounded-lg border`) — vérifié à l'écran dans les deux modes |
| `renderRowActions` | `actionsLigne` du socle, passé seulement si `peutEcrire` (parité `enableRowActions`) ; le `Tooltip`+`IconButton` MUI du retrait est conservé tel quel, nom accessible « Retirer X du groupe » compris |
| `renderEmptyRowsFallback` | `etatVide` → le même `EtatVideTable` (type structurel du lot 7 : zéro retouche du composant) |
| `enablePagination: false` + virtualisation (overscan 5) | **pagination du socle** — différence de comportement assumée : l'écran gagne pagination, recherche, filtres et menu des colonnes, alignés sur toutes les autres tables ; la virtualisation disparaît (elle n'a de sens que sans pagination) |
| aucun état persisté | `useEtatTablePersistant([STRUCTURE, 'groupe-users', groupeId])` — persisté par groupe, même clé que la requête |

Vérifié au navigateur (compte `test-e2e`, build conteneurs) : ajout d'un
membre par le sélecteur MUI (4 → 5) puis retrait (5 → 4, liste restituée à
l'identique), tri/commandes du socle, état conteneur et survol par tokens,
capture regardée en clair et en sombre.

## 5. Vérification à l'écran — trois écrans variés et plus, deux modes

Compte `test-e2e`, build conteneurs (`https://10.20.2.5:9021`), session en
**anglais** (la suite e2e épingle fr : les deux langues sont donc couvertes).

| Scénario | Où | Constaté |
|---|---|---|
| Tri au clic | Utilisateurs (« Last name ») | asc → desc → effacé, `aria-sort` posé/retiré |
| Recherche globale | Utilisateurs | « Nguyen » → 1 ligne ; X efface, 10 lignes reviennent |
| Filtre par colonne | Utilisateurs | « E2E » → 6 lignes ; valeur sans résultat → état vide filtré + « Clear filters » qui restaure |
| Menu des colonnes | Utilisateurs | ID réaffiché, menu reste ouvert, **persiste après navigation aller-retour** |
| Pagination | Utilisateurs / partout | taille 10 → 25, bouton suit ; plages « 1–10 of 10 », « 1–4 of 4 », « 0–0 of 0 » |
| Sélection → suppression | Utilisateurs | compteur « 2 of 10 row(s) selected », modale « Delete 2 users? », **Annuler conserve la sélection** (la suppression réelle est exercée par `corbeille.spec.ts`, vert, qui traverse les listes migrées) |
| Menu ⋮ de ligne | Utilisateurs, Formation, Promotion, Groupe | « View » direct + menu (« Edit », « Manage cohorts/options/members ») |
| État vide réel | Options d'« E2E Promo Vide » | « No option recorded. » + invite « Create option », capture regardée (sombre) |
| Barres personnalisées | Utilisateurs / Périodes / Groupes | import ; import + export ; import multiple — les trois surcharges renommées rendent |
| Promotion, état mixte | liste + `/edit` | table socle (dates rendues), formulaire avec 2 `DatePicker` MUI intacts |
| Console | tout le parcours | **0 erreur applicative** (les 3 du log : une URL fausse de l'exploration et deux `fetch` sans jeton, miens) |

**Cas « sombre choisi + OS clair » (lot 7 §8)** — vérifié explicitement,
`mui-mode=dark` + `prefers-color-scheme: light`, et son miroir : le défaut
pré-existant **se manifeste sur ces écrans**, autour de la table — titres MUI
(« Groupe — TD1 », h6 « Group members ») et libellés de l'arbre quasi
illisibles, body suivant la média pendant que les surfaces suivent le choix.
**La surface DataTable migrée, elle, reste parfaitement lisible** (elle pose
ses deux tokens, le correctif du lot 7). Signalé sans correction — chantier
« inversion de la source de mode » (invariant 12), inchangé.

## 6. Journal des captures — 4 bougent, 16 non, justification une à une

| Capture | Sort | Justification |
|---|---|---|
| `formation-liste-{light,dark}` | **régénérée** | c'est l'écran migré lui-même ; diff = zone table uniquement (barre unifiée, cases, tri, pagination du socle) |
| `menu-compte-{light,dark}` | **régénérée** | le menu n'a pas changé ; son **fond** est `/` → la liste Formation migrée. Diff regardé : la zone table seule, le menu intact |
| `menu-actions-*`, `dialogue-suppression-simple-*`, `dialogue-suppression-confirmation-*` | intacte | ouvertes depuis l'**arbre** de structure, pas depuis les listes (§1) |
| `certification-toeic-*`, `grille-saisie-*`, `note-graphique-*`, `planning-*`, `jury-deliberer-dialog-*` | intacte | écrans restés sur MRT — leur immobilité confirme que le lot n'a pas débordé |

Chaque image régénérée a été **regardée avant commit** ; régénération ciblée
(`-g "liste Formation"`, `-g "menu de compte"`), jamais en bloc.

Signalé sans y toucher : le titre du test « liste Formation (écran MRT
représentatif) » est désormais périmé (l'écran est le premier représentant du
*nouveau* socle). Le renommer changerait l'identité du test — décision
laissée hors de ce lot.

## 7. Bundle — par chunk, contre la référence figée d'avant-lot

| Chunk | Avant (kB / gzip) | Après | Δ |
|---|---|---|---|
| code applicatif (index) | 306.82 / 81.14 | 306.17 / 80.97 | **−0.65 / −0.17** |
| CSS | 86.90 / 14.29 | 86.90 / 14.29 | 0 (hash identique) |
| `tanstack-libs` | 108.57 / 30.96 | 108.57 / 30.96 | 0 (hash identique) |
| **`mui-material-libs`** | **502.09 / 141.03** | **502.09 / 141.03** | **0 (hash identique)** |
| vendor / mui-libs / recharts / fullcalendar | — | — | 0 (hashs identiques) |

Deux réponses mesurées aux deux questions du lot :

- **Le code applicatif décroît à peine** (−0,65 kB pour neuf écrans) : les
  définitions TanStack pèsent le même poids que les définitions MRT — la
  décrue viendra de la mort de `ListMrt` et du chunk MRT, pas des pages.
- **Aucun composant `@mui/material` n'a perdu son dernier consommateur** —
  l'exercice du lot 5 refait par la mesure : le chunk est identique au
  hachage près. Les candidats vérifiés : `darken` (reste dans `ListMrt` et
  `JuryPeriode`), les locales MRT (restent importées par `ListMrt`),
  `Box`/`Tooltip`/`IconButton`/`Typography`/`Button` (partout ailleurs).

`material-react-table` garde exactement les **9 consommateurs de pages
prévus** (note ×6 dont `useNoteChart`, jury ×1, certification ×2) plus les
trois fichiers du socle en sursis (`def.ts`, `ListMrt.tsx`,
`usePersistentTableState.ts`).

## 8. Vérifications finales

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` + vite) | ✅ |
| Suite e2e | run initial 59/63 (les 4 captures attendues) → régénération ciblée → **make test-ihm ✅ 63** ; npx 62/63 (aléa ci-dessous) ; **make test-ihm ✅ 63 (3,8 min) puis npx ✅ 63 (3,7 min) — deux exécutions consécutives vertes, points d'entrée alternés** |
| Aléa | `notes-unifie › les cinq axes se chargent` tombé une fois (run npx à 4,3 min) : méthode du lot 7 appliquée — repasse **seul**, puis deux suites complètes vertes d'affilée. Profil conforme au défaut pré-existant `BarreAxes`, pas un effet du lot |
| Sélecteurs/assertions e2e | **zéro modification** — les 59 tests fonctionnels sont passés du premier coup sur les écrans migrés |
| Build Go / `go test` | ✅ / ✅ sauf l'échec pré-existant `programme-import/extraction` (fixture absente, lot 5) |
| Lockfile | **+0 / −0 / 0** — aucune dépendance |
| Données | ajout/retrait d'un membre TD1 restitué à l'identique ; `mui-mode` du navigateur de vérification remis à `system` ; aucune capture d'exploration committée |

## 9. Ce qui n'a pas été traité

- **Les 9 consommateurs MRT restants** : note (lot 9), jury + certification
  (lot 10). `JuryPeriode` suivra le chemin de `GroupeUserPage` (DataTable en
  direct) ; `useNoteChart` sera le premier consommateur réel de
  `lignesVisibles`.
- `ListMrt.tsx`, l'ancien `usePersistentTableState`, les champs `columns` /
  `renderTopToolbarCustomActions` de `def.ts` : toujours en sursis.
- Les `DatePicker` de `Promotion.tsx` et `Periode.tsx` : lot 11 (état mixte
  documenté §2).
- Défauts pré-existants intacts et signalés : désynchronisation « mode
  choisi ≠ OS » (§5 — se manifeste sur ces écrans, autour des surfaces
  migrées), validation `capacite` sans `valueAsNumber` (lot 7 §8), rendu figé
  `BarreAxes`, rebond Keycloak, échec Go `programme-import`.
- Titre de test périmé « écran MRT représentatif » (§6).
