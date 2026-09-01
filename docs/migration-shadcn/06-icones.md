# Étape 6 — les icônes passent de @mui/icons-material à lucide-react

But de ce lot : retirer `@mui/icons-material` de tout `front/src` — 42
fichiers, 50 icônes distinctes (la commande en annonçait 49 ; le décompte
`grep` en donne 50), ~90 imports — sans remplacer aucun autre composant MUI.
Premier lot transversal : il touche les pages, mais uniquement sur les
icônes. lucide-react était déjà installé (tiré par le shell au lot 3) et
utilisé par les composants `ui/` ; ce lot étend un choix déjà fait.

## 1. Constaté avant toute écriture (vs déduit)

- **Constaté dans les sources des composants `ui/`** : `button-variants.ts`,
  `dropdown-menu.tsx`, `alert.tsx` et `sidebar.tsx` imposent déjà
  `[&_svg:not([class*='size-'])]:size-4` (16 px) à tout SVG enfant — et ce
  sélecteur **matchait déjà les icônes MUI** (`MuiSvgIcon-fontSizeMedium` ne
  contient pas la sous-chaîne `size-`, l'attribut est sensible à la casse ;
  la couche `utilities` bat la couche `mui`). Les icônes MUI rendues dans un
  bouton ou un menu shadcn étaient donc déjà à 16 px, leurs `fontSize` MUI
  écrasés. Conséquence : dans tout contexte shadcn, l'icône lucide se pose
  **nue, sans prop de taille** — le CSS du composant gouverne, l'apparence
  ne bouge pas.
- **Constaté** : `ComponentType<LucideProps>` n'accepte pas un composant
  d'icône MUI (le `color` de `SvgIconProps` est une union fermée, celui de
  `LucideProps` une chaîne — l'assignabilité contravariante échoue). Le
  commit qui change le type `IconeAction` doit donc embarquer **toutes** les
  déclarations `icone:` des pages d'un seul geste ; c'est ce qui a été fait
  (20 fichiers, chaque commit compile).
- **Constaté** : `@mui/icons-material` est une dépendance directe de
  `material-react-table` (`>=6` en peer, `^6.2.1` en dev) — MRT dessine avec
  elle ses commandes internes (recherche, filtres, colonnes, densité, plein
  écran, tris). **Le paquet ne peut donc pas quitter `package.json`** tant
  que MRT est là ; il ne quitte pas non plus tout à fait le bundle (§7).
  Son retrait complet appartient au lot des tables.
- **Constaté** : les huit correspondances que la commande signalait comme
  douteuses se résolvent mieux que prévu — `Gavel`, `Scale`, `Anchor` et
  l'équivalent direct de `VerifiedUser` (`ShieldCheck`) existent chez lucide
  sous le même sens, souvent sous le même nom. Aucune correspondance jugée
  « vraiment mauvaise » : la condition d'arrêt (plus de cinq) n'a pas été
  atteinte.

## 2. La correspondance fontSize → size

MUI : `small` = 20 px, `medium` (défaut) = 24 px ; le `startIcon` d'un
`Button` MUI force 20 px (18 px si `size="small"`) par `font-size`, que
lucide — tailles en attributs `width`/`height` — **ne suit plus**. La règle
appliquée uniformément, à retenir pour les lots suivants :

| Contexte du rendu | Taille posée | Motif |
|---|---|---|
| Enfant d'un composant shadcn (`Button`, `DropdownMenuItem`, `Alert`, sidebar) | **aucune** | le CSS `size-4` (16 px) du composant gouverne, comme il gouvernait déjà les icônes MUI |
| `IconButton` MUI, icône sans `fontSize` | **aucune** | défaut lucide 24 px = défaut MUI `medium` (l'`IconButton` MUI ne dimensionne pas son enfant, même en `size="small"`) |
| icône qui portait `fontSize="small"` | `size={20}` | équivalence exacte |
| `startIcon` d'un `Button` MUI | `size={20}` | le `font-size: 20px` que MUI posait ne s'applique plus à lucide |
| `startIcon` d'un `Button` MUI `size="small"` | `size={18}` | idem, variante small (unique cas : `JuryPeriode.tsx`) |

Les autres props relevées : `sx={{ color: 'text.secondary', flexShrink: 0 }}`
(Etiquette de l'arbre) → `className="shrink-0 text-muted-foreground"` ;
`color="success"` (indicateur de grille) → `className="text-success"`
(tokens du lot 4) ; l'`aria-label` passe tel quel (lucide diffuse ses props
sur le `<svg>`, `aria-hidden="true"` par défaut sinon).

## 3. La table des 50 correspondances

Les cas de **jugement** (le dessin ou la métaphore change, pas seulement le
trait) sont marqués ⚖ et argumentés en dessous ; le reste est de
l'équivalence directe.

| MUI | lucide | Contexte d'usage |
|---|---|---|
| AccountTree ⚖ | ListTree | bouton d'ouverture du tiroir de l'arbre (écran étroit) |
| AddBox | SquarePlus | créer (barres d'outils, arbre, actions) |
| AltRoute ⚖ | Split | niveau **option** dans l'arbre |
| Anchor | Anchor | « Ancrer maintenant » (registre) |
| ArrowBack | ArrowLeft | boutons retour |
| ArrowDropDown | ChevronDown | caret du sélecteur de niveau |
| Article | FileText | export des bulletins (jury) |
| Balance | Scale | action « Jury » (balance de la justice, même sens) |
| BarChart | ChartColumn | graphique des notes |
| CalendarMonth | CalendarDays | action « Programme » |
| CheckCircleOutline | CircleCheck | note enregistrée (grille) |
| Class ⚖ | BookMarked | niveau **promotion** dans l'arbre |
| DateRange | CalendarRange | niveau **période** dans l'arbre |
| Delete | Trash2 | supprimer la sélection (toolbar), retirer un membre |
| DeleteForever ⚖ | Trash | « Purger » (corbeille) |
| DeleteOutline | Trash2 | corbeille (nav), mettre à la corbeille, supprimer la note |
| Download | Download | export période |
| DriveFolderUpload | FolderUp | import multi-groupes (dossier) |
| Edit | Pencil | action « Éditer » |
| ErrorOutline | CircleAlert | alertes d'erreur (Crud, List, suppression bloquée) |
| FileDownload | FileDown | exports de fiches/CSV |
| FileUpload | Upload | import de fiche de notes |
| Folder | Folder | catégories de l'arbre |
| Gavel | Gavel | délibérer (équivalent nominal exact) |
| Grading ⚖ | ClipboardCheck | action directe « Gérer les notes » |
| Groups | Users | niveau **groupe**, « voir les groupes » |
| InfoOutlined | Info | alertes d'information (dialogue de suppression) |
| ListAlt | List | « voir la liste des … » (6 usages) |
| Logout | LogOut | déconnexion (menu de compte) |
| ManageAccounts | UserCog | nav « Utilisateur » |
| MeetingRoom | DoorOpen | nav « Salle » |
| MenuBook | BookOpen | niveau **UE** dans l'arbre |
| MenuOpen ⚖ | PanelRightOpen / PanelRightClose | volet des heures (planning) |
| MoreVert | EllipsisVertical | bouton ⋮ des menus d'actions |
| Palette | Palette | mode de coloration du planning |
| People ⚖ | Users | « gérer les membres » (converge avec Groups) |
| PersonAdd | UserPlus | « Ajouter » un membre |
| Public | Globe | mobilité internationale |
| Refresh | RefreshCw | revérifier (registre), recharger la ligne (grille) |
| Replay | RotateCcw | réessayer l'enregistrement (grille) |
| Restore ⚖ | ArchiveRestore | « Restaurer » (corbeille) |
| School | GraduationCap | nav « Scolarité », niveau **formation** (même dessin) |
| Subject ⚖ | Text | niveau **matière** dans l'arbre |
| Translate | Languages | sélecteur de langue |
| Undo | Undo2 | annuler une délibération |
| UploadFile | FileUp | imports de fichiers (période, groupe, utilisateurs, témoin .tsr) |
| VerifiedUser | ShieldCheck | nav « Registre » (bouclier coché = intégrité) |
| Visibility | Eye | action « Voir » |
| WarningAmber | TriangleAlert | alertes d'avertissement |
| WorkspacePremium ⚖ | Award | certification TOEIC |

Les cas de jugement, argumentés :

- **AccountTree → ListTree** : l'organigramme à nœuds reliés n'existe pas
  chez lucide (`Network` en est loin visuellement) ; `ListTree` dessine une
  arborescence indentée — exactement ce que le bouton ouvre.
- **AltRoute → Split** : une option est une bifurcation du parcours ;
  `Split` dessine un chemin qui fourche, même métaphore, dessin proche.
- **Class → BookMarked** : l'icône MUI est un livre à signet ; `BookMarked`
  aussi. Le lien promotion↔livre reste conventionnel, mais il l'était déjà.
- **DeleteForever → Trash** : lucide n'a pas de poubelle barrée d'un X. La
  sévérité est portée par le libellé « Purger » et la couleur d'erreur ;
  `Trash` (nue) se distingue de `Trash2` (striée) utilisée pour les
  suppressions restaurables — la hiérarchie visuelle est faible, signalé.
- **Grading → ClipboardCheck** : « notes vérifiées » ; le presse-papiers
  coché dit l'évaluation mieux que `FileCheck` (déjà proche de FileText).
- **MenuOpen → paire PanelRightOpen/PanelRightClose** : l'icône MUI unique
  était retournée par `sx={{ transform: 'scaleX(-1)' }}` selon l'état ; la
  paire lucide dit nativement « ouvrir/fermer le volet droit », le `sx`
  disparaît. L'icône continue de nommer l'action à venir, comme le libellé.
- **Restore → ArchiveRestore** : l'horloge à flèche arrière MUI évoquait
  l'historique ; « sortir de la boîte d'archive » est plus juste pour la
  corbeille. Changement de métaphore assumé.
- **Subject → Text** : lignes de texte alignées dans les deux banques ; le
  sens « matière » n'est porté par aucune icône, seulement par la position
  dans l'arbre — inchangé.
- **People et Groups convergent sur Users** : MUI distinguait 2 et 3
  silhouettes ; lucide n'offre que des variantes proches (`UsersRound`).
  Les deux usages disent la même chose (des personnes) et n'apparaissent
  jamais côte à côte — un seul dessin, signalé.
- **WorkspacePremium → Award** : badge-ruban → médaille-rosette, même sens
  de distinction/certification.

Deux paires MUI redondantes sont **conservées redondantes** (pas
d'éditorialisation) : `Download`/`FileDownload` → `Download`/`FileDown` et
`FileUpload`/`UploadFile` → `Upload`/`FileUp`.

## 4. Le type `IconeAction` et les commits

`actions.ts` : `ComponentType<SvgIconProps>` → `ComponentType<LucideProps>`.
Six commits, chacun compilant et l'application fonctionnelle :

1. type + couche crud + **toutes** les déclarations `icone:` (l'exigence de
   compilation du §1) — les menus d'actions passent à lucide d'un bloc,
   aucune iconographie mélangée dans un même menu ;
2. services/ hors crud + shell (LanguageSwitcher, SelecteurNiveau,
   dashboard, navigation) ;
3. pages structure + catalog ; 4. notes ; 5. jury ;
6. programme + corbeille + registre + utilisateurs.

## 5. Journal de réacceptation des captures

Premier passage après migration : **43 tests fonctionnels verts, 20 échecs
tous en comparaison d'images** — aucun échec de rôle, de nom accessible ou
de comportement. Les 20 diffs ont été **regardés un à un avant
régénération** : le rouge ne tombe que sur des icônes (menu latéral, barres
d'outils, carets des sélecteurs, ⋮ et yeux des lignes, icônes d'alertes,
Gavel du bouton Confirmer) ; libellés, métrique, tables MRT, calendrier,
graphique : fantômés à l'identique. Puis les 20 références régénérées ont
été **regardées une à une avant commit** ; contrairement aux lots
précédents, toutes les captures bougent, et c'est l'attendu du lot.

| Capture (light/dark) | Icônes qui changent, et rien d'autre | Attendu ? |
|---|---|---|
| formation-liste | 5 icônes de nav, arbre (GraduationCap), + de l'arbre, SquarePlus/Trash2 de la toolbar, Eye + ⋮ des lignes, Languages | oui |
| grille-saisie | nav, carets ChevronDown du fil, ChartColumn/FileDown/Upload de l'en-tête, ⋮ des lignes | oui |
| certification-toeic | nav, ArrowLeft, SquarePlus/Trash2, carets | oui |
| planning | nav, carets, Palette + PanelRightClose (le `sx` miroir disparaît) ; FullCalendar au pixel près | oui |
| note-graphique | seul le liseré derrière la modale bouge (nav, toolbar) ; modale et courbe intactes | oui |
| jury-deliberer-dialog | nav, carets, FileDown/FileText d'en-tête, Gavel dans « Confirmer » ; dialogue MUI inchangé | oui |
| menu-actions | List/SquarePlus/Trash2 dans le menu ouvert, alignement icône/libellé conservé ; Pencil + ⋮ d'en-tête ; arbre | oui |
| menu-compte | LogOut dans le menu ouvert ; nav | oui |
| dialogue-suppression-simple | TriangleAlert + Info des alertes ; fond atténué | oui |
| dialogue-suppression-confirmation | Info ×2 ; saisie et boutons intacts | oui |

## 6. Vérification à l'écran — les surfaces hors captures, deux modes

Build conteneurs (`make start-scolarite`), compte `test-e2e`, mode sombre
par le stockage `mui-mode` (source unique MUI, invariant 12).

| Surface | Vérifié | Modes |
|---|---|---|
| Arbre complet déplié | 7 icônes de niveaux distinctes (GraduationCap/BookMarked/Split/CalendarRange/BookOpen/Folder/Users), 20 px, `text-muted-foreground`, alignées | clair + sombre |
| Menu d'actions d'une ligne (groupe) | Pencil « Éditer », Users « Gérer les membres » — alignement icône/libellé | clair |
| Barre d'outils d'une liste (groupes, utilisateurs) | SquarePlus, Trash2 désactivée, FolderUp / FileUp d'import | clair |
| Membres du groupe | ArrowLeft, FileUp, UserPlus dans le bouton bleu « Ajouter » (20 px, aligné) | clair |
| Corbeille | ArchiveRestore « Restaurer », Trash rouge « Purger » — `startIcon` MUI à 20 px | clair + sombre |
| Registre | RefreshCw, Anchor, FileUp « Fichier .tsr » | clair + sombre |
| Sélecteur de niveau ouvert | ChevronDown sur chaque niveau, menu + « Voir la liste » | clair |
| Menu de langue ouvert | Languages sur le déclencheur, entrées inchangées | clair |
| Planning | Palette + PanelRightClose/Open (volet ouvert/fermé) | clair (capture), sombre (capture) |

Aucun plantage au montage d'aucun popup (piège lot 3) ; aucun défaut
d'alignement ou de taille trouvé — c'est le premier lot de la série sans
défaut découvert à l'écran.

## 7. Bundle — par paquet, contre la référence figée d'avant-lot

Méthode du lot 3 §9 (visualizer, tailles rendues, référence construite sur
le commit d'avant-lot avant la première écriture). Tout ce qui bouge :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@mui/icons-material` | 27.5 | 10.2 | **−17.3** (−63 %) |
| `lucide-react` | 6.7 | 34.5 | +27.8 |
| code applicatif | 587.9 | 587.2 | −0.7 |
| **net** | | | **+9.9** |

La décrue attendue a lieu (`@mui/icons-material` perd tous ses consommateurs
applicatifs d'un coup) mais elle est **partielle et le net est légèrement
positif** : les 10.2 kB restants sont les icônes que material-react-table
importe pour ses commandes internes — ils partiront avec MRT au lot des
tables — et une icône lucide (tracés `stroke` multi-`path`) pèse en moyenne
plus lourd qu'une icône MUI (un `path` plein). ~+10 kB rendus (~+2 kB gzip),
le gain du lot est l'unification (une seule banque d'icônes dans le code
applicatif), pas le poids.

## 8. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep @mui/icons-material front/src` | ✅ zéro import |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` | ✅ |
| `npx playwright test` (run 1) | ✅ 63 passed (3.9 min) |
| `make test-ihm` (run 2, consécutif, autre point d'entrée) | ✅ 63 passed (3.9 min) |
| Sélecteurs/assertions e2e | **zéro modification** |
| Build Go | ✅ |
| `go test ./...` | ✅ sauf l'échec **pré-existant** `cmd/programme-import/pkg/extraction` (fixture `test_salle.csv` absente, déjà signalé au lot 5, aucun fichier Go touché) |
| Lockfile | **+0 / −0 / 0 montée parasite** (aucun `npm install` du lot) |

Aléa observé, sans lien avec le lot : un passage intermédiaire a vu échouer
une fois `navigation.spec.ts:33` (« rechargement au milieu d'un parcours ») —
retombée sur `/catalog_context/formation`, la signature du rebond Keycloak
déjà documenté (famille du `test.fail` de la ligne 20). Le spec seul repasse
8/8 et les deux exécutions complètes suivantes sont vertes ; à garder à
l'œil comme *flaky* connu.

## 9. Ce qui n'a pas été traité

- **`@mui/icons-material` reste dans `package.json`** : dépendance de
  material-react-table (§1) ; son retrait appartient au lot des tables, où
  les 10.2 kB restants du bundle partiront aussi.
- Les composants MUI porteurs d'icônes (`IconButton`, `Button` à
  `startIcon`, `Tooltip`…) : intacts, comme l'exigeait la commande — aucun
  débordement n'a été nécessaire, aucune icône n'a demandé de toucher à son
  porteur.
- Les icônes internes de MRT (recherche, filtres, colonnes, densité, plein
  écran) : MUI, jusqu'à la sortie de MRT — deux banques cohabitent sur la
  rangée d'outils des listes, prolongement du constat du lot 4 §3.
- La hiérarchie visuelle faible `Trash` (purge) / `Trash2` (restaurable),
  et la convergence People+Groups → Users : assumées, à revoir si un
  utilisateur s'y trompe.
- Défauts pré-existants intacts : rendu figé `BarreAxes`, rebond Keycloak
  sur lien profond froid, URL mémorisée sur id re-semé, chaînes en dur
  d'`EtatVideTable`, échec Go `programme-import`.
