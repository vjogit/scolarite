# Étape 4bis — trois défauts utilisateur, hors migration (migration MUI → shadcn/ui)

But de ce lot : corriger trois défauts signalés au fil des lots précédents et
jamais traités — deux libellés i18n rendus en clé brute (lot 2bis), les
chaînes en dur d'`EtatVideTable` (lot 4 §1), les couleurs figées de
`NoteChartModal` (lot 2 §2). **Ce lot ne migre rien** : aucun composant MUI
n'est passé à shadcn.

## 1. Constaté avant toute écriture (vs déduit)

- **Constaté** : les dix occurrences de `i18n.t as unknown as
  TFunction<ns>` annoncées sont exactement celles trouvées par grep — ni
  plus, ni moins.
- **Constaté, au-delà du signalement** : le signalement d'origine (« deux se
  manifestent ») était incomplet. `actionJury()` (`jury/routes.tsx:53`) est
  appelé sans `t` exactement comme `actionMobilite()` et `actionProgramme()`
  — la clé `actionJuryLibelle` sortait brute dans le menu d'actions des
  périodes du workflow Jury. **Trois manifestes, pas deux.** La suite ne le
  voyait pas : elle navigue vers Jury/Programme par le fil de contexte
  (`allerJusquaPeriode`), jamais par ces entrées de menu ; la seule action de
  greffe cliquée est « TOEIC », un nom propre en dur.
- **Constaté** : la cause a un second étage que le remplacement du repli ne
  suffit pas à corriger. Ces trois actions sont créées **une seule fois, au
  chargement du module** (`main.tsx` construit le routeur au chargement,
  `actionsLigne` est figé dans `reglages` par `enrober`). Même avec le bon
  namespace, une chaîne y aurait figé la langue de démarrage : la bascule
  fr/en en cours de session aurait laissé l'ancien libellé dans le menu —
  vérifié comme exigence, pas supposé (le test e2e ajouté l'aurait détecté).
- **Constaté** : `entityMessages.ts` exerce réellement son repli
  (`suppression.ts:42` appelle `messageSuppression` sans `t`) sans jamais
  produire de clé brute : chacun de ses appels passe `{ ns: 'crud' }`
  explicitement — la même parade que `useFicheImport.tsx`, appliquée sans le
  dire.
- **Déduit puis vérifié à l'écran** : `CartesianGrid`, `XAxis`, `YAxis` de
  `NoteChartModal` sans couleur explicite prenaient les gris par défaut de
  recharts, illisibles sur fond sombre — le défaut dépassait les séries.

## 2. Les dix occurrences — verdict, appelants réels

| # | Occurrence | ns | Verdict | Preuve (appelants) |
|---|---|---|---|---|
| 1 | `services/crud/entityMessages.ts:64` (`tCrud`) | crud | **latente** | Repli exercé (`suppression.ts:42` sans `t`) mais tout appel interne passe `{ ns: 'crud' }` ; les pages passent leur `t` (`entites/*.ts`, `List.tsx`, `Form.tsx`). |
| 2 | `services/context/workflows.ts:147` (`libelleWorkflow`) | app | latente | Unique appelant `BarreWorkflows.tsx:70`, passe `t`. |
| 3 | `services/context/niveaux.ts:46` (`libelleNiveau`) | app | latente | Unique appelant `FilContexte.tsx:167`, passe `t`. |
| 4 | `services/context/prolongements.ts:162` (`libelleSegment`) | app | latente | Appelants `FilContexte.tsx:128` et `:203`, passent `t`. |
| 5 | `pages/user/def.tsx:40` (`availableRoles`) | user | latente | Appelants `User.tsx:86` et `:127`, passent `t`. |
| 6 | `pages/certification/routes.tsx:55` (`actionMobilite`) | certification | **manifeste** | Appelée **sans `t`** (`routes.tsx:70`, `actionsLigne`). |
| 7 | `pages/salle/def.ts:10` (`typeSalleOptions`) | salle | latente | Appelants `Salle.tsx:69` et `:112`, passent `t`. |
| 8 | `pages/note/useFicheImport.tsx:34` (`libelleImportFiche`) | note | latente | Appelants `FicheImportButton.tsx:14` et `Controle.tsx:138`, passent `t` ; doublement protégée par `{ ns: 'note' }`. |
| 9 | `pages/programme/routes.tsx:39` (`actionProgramme`) | programme | **manifeste** | Appelée **sans `t`** (`routes.tsx:57`). |
| 10 | `pages/jury/routes.tsx:35` (`actionJury`) | jury | **manifeste — non signalée à l'origine** | Appelée **sans `t`** (`routes.tsx:53`). |

## 3. Option retenue, alternatives écartées

**Retenue : piste 1, `i18n.getFixedT(null, ns)`**, appliquée aux dix. Elle
lie *réellement* le namespace (le type de retour est `TFunction<ns>`, sans
assertion), suit la langue active au moment de l'appel (`lng = null`), et ne
change ni signature ni appelant. Zéro `as unknown as TFunction` dans
`front/src` (grep).

- *Écartée — piste 2 (`{ ns }` partout)* : elle corrige le lookup mais pas le
  mensonge de type — le cast resterait nécessaire puisque `i18n.t` reste
  typé sur `errors` ; c'est précisément lui qui rend le défaut invisible.
- *Écartée — piste 3 (`t` obligatoire)* : la plus sûre sur le papier, mais
  elle change la signature de dix fonctions et de leurs appelants dans les
  pages — hors du périmètre annoncé, et la commande demandait de s'arrêter
  dans ce cas. `getFixedT` atteint la même sûreté de namespace sans ce coût.

**Complément indispensable aux trois manifestes** : `libelle` d'une action
peut désormais être une fermeture (`string | (() => string)`,
`services/crud/actions.ts`), résolue au rendu par `libelleAction()` dans
`MenuActionsLigne` (et `StructureLayout`, seul autre lecteur). Les trois
actions de `routes.tsx` déclarent `libelle: () => traduire(...)` — sans
cela, corriger le namespace aurait remplacé « clé brute dans les deux
langues » par « bon mot, mais figé dans la langue de démarrage ». Le type
élargi est rétro-compatible : toutes les déclarations existantes (chaînes
construites au rendu avec le `t` du composant) restent valides, aucune page
n'a changé sa déclaration.

**Règle ajoutée à CLAUDE.md** (Conventions) : interdiction du cast, repli
par `getFixedT`, fermeture obligatoire pour tout libellé évalué au
chargement d'un module.

**Test e2e ajouté** (`i18n.spec.ts`) : le menu d'actions de la ligne
promotion (workflow Certifications) affiche « Mobilité internationale » —
jamais la clé — puis « International mobility » après bascule. Sélecteurs :
rôles + noms accessibles importés des JSON, et le repère
`crud.actions.menuLigne` que `boutonActionsLigne` de la suite utilise déjà —
les lots 6 (icônes) et 7 (tables) devront le préserver de toute façon.

## 4. État vide filtré — deux clés, pas de `_f`

`listeVideFiltree` (« Aucun résultat pour cette recherche. » / « No results
for this search. ») et `effacerFiltres` (« Effacer les filtres » / « Clear
filters ») rejoignent le voisinage `listeVide*` de `crud.json`.
Le suffixe `_f` a été examiné et **ne s'applique pas** : il porte l'accord
sur le nom d'entité interpolé (`{{nom}}`), or ces deux phrases n'en nomment
aucune — rien à accorder. `EtatVideTable` traduit via son propre
`useTranslation('crud')`, comme tout composant.

## 5. NoteChartModal — lecture des tokens au runtime

**Retenue : lire les variables CSS au runtime** — `getComputedStyle` sur la
racine, relu par `MutationObserver` quand la classe `.dark` de `<html>`
change. Conforme à l'invariant 12 : on *suit* la classe que
`layouts/dashboard.tsx` pose, aucune résolution de mode parallèle (pas de
`useMediaQuery`, pas de `localStorage`), exactement le contrat des variantes
`dark:` de Tailwind.

- *Écartée — composant `Chart` de shadcn* : il aurait imposé
  `ChartContainer` + configuration par série et restructuré le JSX d'un
  fichier qui doit rester MUI (Dialog, Tabs, Box) jusqu'à son lot de page —
  une migration déguisée dans un lot qui l'interdit — pour un besoin qui se
  réduit à cinq chaînes de couleur. Il redeviendra le bon outil quand la
  page migrera. (Fichier local, pas de dépendance npm ; la question « stop »
  de la commande ne s'est donc pas posée — l'option a été écartée sur le
  périmètre, pas sur le lockfile.)

Correspondances (celles du lot 2 §2) : `--chart-1` → courbe + barres
(ex-`#1976d2`), `--chart-2` → lignes de référence + libellé (ex-`#d32f2f`),
`--chart-3` → nuage (ex-`#9c27b0`), curseur → série + `fillOpacity: 0.1`
(ex-`rgba(25,118,210,.1)` ; le token porte l'`oklch`, l'alpha passe par
l'attribut SVG). **Grille et axes, non signalés à l'origine** : grille →
`--border` (qui porte déjà son alpha par mode — l'`opacity 0.5` d'avant
saute), lignes/graduations/textes/labels d'axes → `--muted-foreground`,
posés sur les trois onglets.

Écart assumé, au-delà des couleurs : `isAnimationActive={false}` sur les
trois séries. L'animation de tracé de recharts est pilotée en JavaScript —
`animations: 'disabled'` de Playwright ne gèle que le CSS — et la capture de
référence demandée l'aurait prise en plein tracé. Commenté dans le fichier
et dans la spec.

## 6. Capture de référence ajoutée

`note-graphique-{light,dark}.png` : la modale sur l'onglet courbe (série,
ligne de référence + libellé, grille, deux axes, bandeau KPI — l'onglet le
plus riche). Déterminisme, protocole du lot 2bis : contrôle de RATTRAPAGE
(seul contrôle qu'aucun test n'écrit, comme la capture de la grille),
animations coupées (cf. §5), et **souris éloignée avant capture** — le
pointeur atterrit sur le graphique après le clic d'ouverture et recharts y
accrochait son tooltip (constaté sur la première génération, régénérée).
Rien à masquer : notes, noms et KPIs sortent du seed, aucun id affiché.
Les deux images ont été regardées avant commit.

## 7. Vérification à l'écran — deux modes, deux langues

Au navigateur (headless, spec temporaire jetée après usage, captures hors
dépôt), compte admin :

| Vérification | FR | EN |
|---|---|---|
| Menu de ligne Certifications : « Mobilité internationale » (+ TOEIC) | ✅ | ✅ « International mobility » — après bascule *en cours de session* |
| Menu de ligne Jury : « Jury » (clé brute avant lot) | ✅ | ✅ |
| Menu de ligne Programme : « Programme » | ✅ | ✅ « Schedule » |
| Fil de contexte, écran Mobilité | ✅ | ✅ |
| État vide réel (TOEIC) : constat + invite | ✅ | ✅ « No TOEIC result recorded. » |
| État vide filtré : message + « Effacer les filtres » qui vide bien les filtres (lignes revenues) | ✅ | ✅ |
| État vide filtré, mode sombre | ✅ (mode posé avant navigation) | — |
| Graphique onglet courbe, clair + sombre | ✅ (capture de référence) | n/a |
| Graphique onglets distribution et dispersion, clair + sombre | ✅ séries, référence, curseur, grille, axes lisibles | n/a |

Faux positif écarté pendant la passe : une bascule `emulateMedia` *à chaud*
suivie d'une capture immédiate photographie la transition MUI à
mi-course (zones claires sous barre sombre). Contre-vérifié mode posé avant
navigation : rendu sombre intégralement correct — artefact de méthode, pas
un défaut d'écran.

## 8. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep 'as unknown as TFunction' front/src` | ✅ 0 occurrence |
| `npm run build` (`tsc -b` + vite) | ✅ |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `make test-ihm` (run 1) | ✅ 48 passed (45 + 1 i18n + 2 captures) |
| `npx playwright test` (run 2, autre point d'entrée) | ✅ 48 passed |
| Captures existantes | ✅ **aucune n'a bougé** — y compris `certification-toeic` (l'état vide *réel* n'a pas changé de libellé ; seule la branche filtrée, absente des captures, en a) |
| Lockfile | ✅ +0 / −0 / 0 (aucun `npm install`) |
| Build Go | ✅ (aucun fichier Go touché ; `go test` non relancé pour la même raison) |

## 9. Ce qui n'a pas été traité

- Les défauts pré-existants explicitement hors périmètre : rendu figé
  `BarreAxes`, rebond Keycloak sur lien profond, URL mémorisée sur id
  re-semé (400 après un passage de la suite). Tickets à part, hors
  migration.
- Le libellé `name="Notes"` du `Scatter` (chaîne en dur, invisible à
  l'écran — le tooltip maison ne la lit pas) : hors des trois défauts,
  signalé ici.
- Les KPI de `NoteChartModal` (`primary.50`, `success.main`…) restent MUI :
  ils suivent déjà le thème et partiront avec le lot de la page.
- Aucun composant MUI migré, aucune page touchée hors les retombées
  mécaniques du type `libelle` (`StructureLayout.tsx` : deux lectures
  passées par `libelleAction`).
