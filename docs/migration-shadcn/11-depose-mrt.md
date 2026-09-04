# Étape 11 — la dépose de material-react-table

But de ce lot : rien migrer — retirer le code mort que le lot 10 a laissé
derrière lui. Plus aucun écran ne montait une table MRT ; le risque n'était
pas de casser une fonctionnalité mais de retirer par erreur quelque chose qui
sert encore. Chaque suppression a donc été vérifiée par grep avant d'être
faite, jamais déduite.

## 1. Constaté avant toute écriture (vs déduit)

- **L'inventaire annoncé est exact** : trois fichiers importaient
  `material-react-table`, tous dans `services/crud/` — `ListMrt.tsx` (MRT +
  deux locales), `def.ts` (deux types, `columns` ×2,
  `renderTopToolbarCustomActions` ×2), `usePersistentTableState.ts` (cinq
  types + l'ancien hook).
- **Aucune page ne déclarait plus `columns:` MRT.** Les trois occurrences
  textuelles restantes : `ListMrt` lui-même, `DataTable.tsx:279` et
  `JuryPeriode.tsx:346` — les deux dernières sont la propriété `columns`
  **TanStack** (en-têtes groupés), le faux positif annoncé. Non touchées.
- **`CrudList` n'a que deux importateurs : `Crud.tsx` et `Consultation.tsx`**,
  tous deux internes à `services/crud/`. Aucune page n'importe `List.tsx` —
  la condition d'arrêt « changement transversal » ne s'est pas présentée.
- **`Salle.tsx:137` déstructurait encore `renderTopToolbarCustomActions`**
  et le faisait suivre à son datasource — alors que `CustomCrudSalle`, son
  seul monteur, ne le fournit pas : champ mort en bout de passe-plat.
  Retirer le champ de `CrudProps` forçait cette retouche de deux lignes ;
  le passe-plat lui-même (CrudSalle qui fait suivre ses props) reste, hors
  périmètre.
- `@mui/icons-material` : zéro import dans `front/src` (confirmé, comme
  depuis le lot 6) ; seul MRT le retenait. `darken` : dernier import à
  `ListMrt.tsx:9`.
- Deux commentaires nommaient le champ appelé à disparaître
  (`routesHierarchie.tsx:48`, `PeriodeImportButton.tsx:16`) : réorientés
  vers `actionsBarreOutils`, le champ que ces écrans utilisent réellement.

## 2. Le sort de `List.tsx` — il disparaît, et `ListTanstack` prend sa place

Le commutateur n'avait plus qu'une branche. Plutôt qu'un ré-export
(une indirection vivante pour rien), `ListTanstack.tsx` a été renommé
`List.tsx` (`git mv`) et son export `CrudListTanstack` → `CrudList` : les
deux importateurs gardent leur ligne `import { CrudList } from './List'`
**sans aucune retouche**, et le suffixe « Tanstack » — qui n'avait de sens
que face à « Mrt » — s'éteint avec la cohabitation. Le commentaire de tête
(la duplication « temporaire et assumée » du lot 7) est remplacé par
l'histoire du fichier. `DataTable.tsx` (commentaire de tête) suit.

## 3. Ce qui a été supprimé, et la preuve de non-usage

| Élément | Preuve de mort | Commit |
|---|---|---|
| `ListMrt.tsx` (l'ancienne liste entière) | seul `List.tsx` (commutateur) l'importait ; plus aucun `columns:` MRT dans les pages | 1/4 |
| `List.tsx` (le commutateur) | une seule branche restante ; importateurs internes uniquement | 1/4 |
| `def.ts` : `MRT_ColumnDef`/`MRT_TableInstance`, `columns` ×2, `renderTopToolbarCustomActions` ×2 | consommés par `ListMrt` seul ; la seule page qui citait encore le champ (Salle) recevait `undefined` | 2/4 |
| l'ancien hook `usePersistentTableState` + 5 types MRT | `ListMrt` était son seul appelant ; `COLONNES_TECHNIQUES` retypé `VisibilityState` TanStack, `relire` et `useEtatTablePersistant` conservés (trois consommateurs vivants) | 3/4 |
| `material-react-table`, `@mui/icons-material` (package.json) | zéro occurrence dans `src/` et `e2e/` au moment du retrait | 4/4 |

Lockfile : **+0 / −115 lignes / 0 montée** — sept paquets sortent (les deux
directs et cinq transitives : `@tanstack/match-sorter-utils`,
`@tanstack/react-virtual`, `@tanstack/virtual-core`, `highlight-words`,
`remove-accents`), aucune version ne bouge. `@tanstack/react-table` 8.20.6,
promu dépendance directe au lot 7, reste épinglé.

## 4. Le piège qui aurait rendu le critère vide

Les deux premières exécutions de la suite ont été **vertes contre le mauvais
build** : la stack tournait depuis trois heures, et nginx sert un build figé
(`https://10.20.2.5:9021`) — celui d'avant les commits du lot. Un « deux
runs verts » obtenu là ne prouvait rien. `make start-scolarite` (reconstruit
backend + nginx, ~30 s) puis re-suite complète. À retenir pour tout lot
futur : le critère e2e suppose que l'image servie contient le code du lot.

## 5. Bundle — la première décrue en six mesures

Par chunk (kB minifiés / gzip), contre la référence figée d'avant-lot :

| Chunk | Avant | Après | Δ |
|---|---|---|---|
| **vendor** | **889.16 / 280.10** | **766.15 / 244.21** | **−123.0 / −35.9** (MRT, ses locales, ses transitives) |
| **`mui-material-libs`** | **502.09 / 141.03** | **438.18 / 124.47** | **−63.9 / −16.6** (premier mouvement après six mesures à 0) |
| `mui-libs` | 195.94 / 64.85 | 190.27 / 62.37 | −5.7 / −2.5 (`@mui/icons-material`) |
| `tanstack-libs` | 108.57 / 30.96 | 88.19 / 23.78 | −20.4 / −7.2 (virtual, match-sorter) |
| code applicatif (index) | 306.30 / 81.22 | 299.74 / 79.70 | −6.6 / −1.5 (ListMrt, commutateur, ancien hook) |
| CSS / fullcalendar | — | — | 0 (hashs identiques) |
| recharts | 360.02 / 104.07 | 360.02 / 104.07 | 0 (hash renuméroté, taille identique) |

**Net sur le fil : −219,5 kB rendus, −63,6 kB gzip.**

Par paquet (visualizer, tailles rendues, build du commit d'avant-lot dans un
worktree — la méthode du lot 3 §9, même métrique que le lot 6) :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `material-react-table` | 251.3 | 0 | −251.3 |
| `@mui/material` | 605.2 | 527.9 | −77.3 |
| `@mui/x-date-pickers` | 442.7 | 394.1 | −48.6 |
| `@tanstack/virtual-core` + `react-virtual` | 21.2 | 0 | −21.2 |
| code applicatif | 622.9 | 610.0 | −12.9 |
| `@tanstack/match-sorter-utils` | 11.8 | 0 | −11.8 |
| `@mui/icons-material` | 10.2 | 0 | −10.2 |
| `@tanstack/table-core` | 112.6 | 106.1 | −6.5 |
| `highlight-words` | 2.6 | 0 | −2.6 |
| **net** | | | **−442.5** |

Verdict sur les quatre attendus :

1. **`material-react-table` : disparition complète.** ✔ 251.3 kB → 0,
   zéro occurrence par grep, paquet sorti de package.json et du lockfile.
2. **`@mui/icons-material` : part entièrement.** ✔ 10.2 kB → 0 — très
   exactement le reliquat mesuré au lot 6 §7, au dixième près.
3. **`darken` : zéro consommateur (grep), mais aucune décrue isolable.**
   Le module qui le porte (`colorManipulator.js`, 8 975 octets) reste
   entier avant comme après : `alpha`, utilisé partout, le retient — le
   tree-shaking de rolldown est au module, pas à la fonction. La décrue
   MUI réelle est ailleurs, et plus grosse qu'attendu : −77.3 kB de
   composants `@mui/material` que seul MRT montait, et une découverte —
   **−48.6 kB de `@mui/x-date-pickers`** : MRT importait ses composants de
   filtre de date, jamais activés chez nous.
4. **Les locales MRT disparaissent.** ✔ Comprises dans les 251.3 kB du
   paquet ; contre-preuve par chaînes témoins non portées (« Épingler »,
   « Regroupé par ») : absentes du `dist/` final.

Cumul de la migration des tables (lots 7→11) : le socle avait coûté
+28 kB rendus (lot 7 §9), les lots 8-10 ±1 ; la dépose rend −219,5.
La migration des tables rapporte net ≈ **−190 kB rendus (−56 gzip)**.

## 6. Vérification à l'écran — trois listes variées, deux modes

Compte `test-e2e`, build conteneurs (`https://10.20.2.5:9021`,
reconstruit §4), session en anglais (la suite épingle fr — deux langues
couvertes), pilotage MCP. Rien n'a changé, c'était le but :

| Écran | Vérifié | Modes |
|---|---|---|
| Formations (structure, arbre + liste) | barre unifiée (créer/supprimer + recherche/filtres/colonnes), menu des colonnes s'ouvre sans plantage (ID/Version décochées, « Show all »), tri, pagination « 1–2 of 2 » | clair + sombre |
| Utilisateurs (10 lignes) | barre surchargée (action d'import à côté des défauts — le contrat `actionsBarreOutils`), cases de sélection, colonne Actions, pagination « 1–10 of 10 » | clair + sombre |
| Salles (vide) | état vide « No room recorded. » + invite « Create room », en-têtes triables, « 0–0 of 0 » | clair + sombre |
| Menu de compte | s'ouvre sans plantage (piège lot 3 §5) | clair |
| Console | **0 erreur** sur toute la session | — |

## 7. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep material-react-table` / `@mui/icons-material` (src, e2e, package.json) | ✅ zéro occurrence |
| `grep darken front/src` | ✅ zéro occurrence |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` à chaque commit) | ✅ |
| Build Go / `go test` | ✅ / ✅ sauf l'échec pré-existant `programme-import/extraction` (fixture absente, lot 5) |
| Suite e2e (contre le build du lot, §4) | make ✅ 63 → npx ❌ 62 (`navigation › lien profond`, l'aléa pré-existant — repasse seul) → make ✅ 63 → npx ❌ 62 (`registre — fumée`, voir §8) → **npx ✅ 63 (3,7 min) puis make test-ihm ✅ 63 (3,7 min) — deux exécutions consécutives vertes, points d'entrée alternés** |
| Captures de référence | **zéro régénérée, zéro diff** — les 20 images sont restées vertes sur tous les runs : le code retiré était bien mort |
| Sélecteurs/assertions e2e | zéro modification — onzième lot consécutif |
| Lockfile | +0 / −115 / 0 montée (§3) |
| Page témoin `_cohabitation` | **toujours en place** (`main.tsx:39` et l.68), volontairement non retirée — elle servira une dernière fois à la dépose finale de MUI |
| Données | aucune donnée semée ; captures d'exploration purgées, rien commité |

Commits : ListMrt + commutateur → types de `def.ts` (+ Salle, + les deux
commentaires) → ancien hook → dépendances + lockfile → doc + CLAUDE.md.

## 8. Ce qui n'a pas été traité, et une observation

- **`registre.spec.ts` a échoué une fois, y compris relancé seul, puis est
  repassé quatre fois d'affilée sans reproduction.** Les artefacts de
  l'échec ont été perdus (écrasés par le run vert suivant) ; l'écran
  Registre est à cartes, sans table — aucun chemin touché par ce lot ne le
  traverse. Classé avec la famille des aléas sous charge (lot 7 §8, runs à
  4,1 min contre 3,2 en charge normale), mais **non identifié** : si un
  échec de ce spec se reproduit, capturer `test-results/` avant tout
  nouveau run.
- La page témoin `_cohabitation` : notée présente, retirée seulement à la
  dépose finale de MUI. C'est désormais la plus ancienne dette ouverte de
  la migration (lot 1).
- Hors périmètre, intacts : `BarreAxes`/rebond Keycloak, validation
  `capacite`, désynchronisation « mode choisi ≠ OS », chemin mort de
  `NoteControle`, passe-plat de `Salle.tsx` (le composant ; son champ mort
  est parti avec le contrat, §1), échec Go `programme-import`.
- `@mui/material` garde `Table`/`TableCell`… hors de nos imports ? Non
  vérifié composant par composant — la mesure par paquet (−77.3 kB) suffit
  au verdict de ce lot ; l'inventaire fin appartient à la dépose de MUI.
