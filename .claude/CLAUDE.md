# CLAUDE.md — projet scolarite

Gestion de scolarité (formations → promotions → options → périodes → UE →
matières → contrôles ; notes, jurys, certifications, planning, salles).
Application réservée au personnel administratif. Pas encore en production.

## Stack

- **Back** : Go (chi, pgx, sqlc), PostgreSQL, migrations Liquibase
  (`infra/liquibase/releases/`), Keycloak (Terraform `infra/keycloak/`),
  Docker Compose + nginx (`infra/run/`), Mailpit en local.
- **Front** : React 19, TypeScript durci (`noUncheckedIndexedAccess`, zéro
  `any`), MUI v7 (tables sur le socle `DataTable` — TanStack Table rendu en
  shadcn ; material-react-table **déposé**, lot 11 ; x-date-pickers et
  x-tree-view **déposés**, lot 12 — dates via `services/ChampDate.tsx` +
  react-day-picker, arbre de la structure écrit à la main),
  champs de formulaire partagés — `services/ChampTexte.tsx`,
  `services/ChampChoix.tsx`, lot 13 — sur `components/ui/field.tsx`),
  shell shadcn/Base UI (`components/ui/`, sidebar + menu de compte,
  `layouts/dashboard.tsx`) + sonner (notifications, `services/notify.ts` —
  API impérative, durées centralisées), Toolpad **sorti** (lot 3,
  `docs/migration-shadcn/03-sortie-toolpad.md`),
  TanStack Query, react-router 7 (`createBrowserRouter`),
  **i18next fr/en** (namespaces dans `front/src/i18n/locales/` — toute clé
  ajoutée l'est dans les deux langues).
- **Tests** : Go unitaires + intégration gardés par l'environnement
  (`t.Skip` explicite) ; suite Playwright versionnée dans `front/e2e/`.
- Trois modes de lancement : `makefile.local` / `makefile.prod`, fichiers
  d'environnement dans `infra/env/` (`config-*.env`, secrets jamais
  committés).

## Invariants — ne jamais les casser

1. **L'URL est la source de vérité.** Contexte, axe, sélection : tout état de
   navigation se dérive du `pathname`/query, jamais d'un état parallèle.
   Rechargement, lien partagé et bouton retour reproduisent le même écran.
2. **Clés de cache partagées.** Toute lecture d'entité réutilise les
   `queryKey` des repositories existants — le commentaire de tête de
   `services/context/freres.ts` fait loi (fonction de requête du repository
   mot pour mot, projection par `select`). Charger un écran ne doit jamais
   émettre plus de requêtes qu'avant la modification.
3. **Le serveur impose, l'interface reflète.** Droits vérifiés côté Go
   (`services.RequireRole`) ; le front (`useDroits`, `roleEcriture`,
   `RoleGuard`) ne fait que masquer. Aucune action visible ne doit produire
   un 403. Pas de `roleEcriture` = pas d'écriture (défaut sûr).
4. **Ne jamais tester `ADMIN`.** Rôle composite Keycloak : son porteur a
   tous les rôles fonctionnels dans le jeton. Tester `ADMIN` signale un rôle
   fonctionnel manquant.
5. **Le registre observe, il ne gouverne pas.** Chaque écriture de note/jury
   laisse un maillon (`pkg/registre`) **dans la même transaction** ; un échec
   d'ancrage TSA ou de témoin ne bloque jamais une écriture métier.
6. **Format canonique du registre : gelé.** Ordre et champs inaltérables ;
   jamais de texte libre ni de donnée nominative dans un maillon (la
   remarque entre par `HashRemarque`). Seuls seq + hash + date sortent vers
   la TSA et dans les témoins. Voir `docs/rgpd-registre.md`.
7. **Erreurs : codes sur le fil, mots à l'affichage.** RFC 9457
   (`application/problem+json`), point d'émission unique
   (`services/errors.go`), `code` d'extension routé par
   `front/src/services/errorMessages.ts`. **Jamais** d'`err.Error()` dans
   une réponse HTTP ; les 500 portent un identifiant de corrélation logué.
8. **Axes calculés en lecture seule.** Matière, UE, Période (notes) sont
   dérivés des contrôles par SQL : aucune route d'écriture, aucune action
   d'écriture à l'écran. Le seul axe de saisie est le contrôle (la grille).
9. **Suppression logique** des quatre entités structurantes (formation,
   promotion, option, période) via la corbeille ; les lectures passent par
   les vues actives. Blocage « période délibérée » côté serveur (409).
10. **Rien en dur qui diffère entre environnements.** Toute valeur
    local/prod passe par `config.yaml` typé (`services/config.go`) +
    `infra/env/`. Le spécifique-développement est marqué comme tel (Mailpit,
    seed bootstrap, TSA de dev, comptes e2e).
11. **L'ordre des couches CSS est gelé, et fragile.** `front/src/index.css`
    ouvre sur `@layer theme, base, mui, components, utilities;` — cette
    ligne doit rester la toute première du fichier, avant `@import
    "tailwindcss"`. En CSS, une règle hors couche l'emporte toujours sur une
    règle en couche : sans cet ordre, MUI (couche `mui`, activée par
    `enableCssLayer` sur `StyledEngineProvider`, `front/src/main.tsx`)
    écraserait silencieusement les utilitaires Tailwind et shadcn. **Cette
    déclaration CSS ne suffit pas à elle seule** : `main.tsx` pose aussi
    `<GlobalStyles styles="@layer theme, base, mui, components, utilities;"
    />` comme tout premier enfant de `StyledEngineProvider`, avant tout
    autre composant MUI. Sans lui, une course s'installe entre le
    chargement réseau d'`index.css` et l'injection synchrone des styles
    globaux d'Emotion (`CssBaseline`) au premier rendu ; si Emotion gagne,
    `mui` s'enregistre en première position (perdant face à `base`) et
    **toute l'application perd son apparence MUI** (boutons et champs sans
    fond, sans marge — pas une régression cosmétique isolée, une casse
    globale silencieuse, invisible aux tests e2e qui ne vérifient que rôles
    et texte accessibles). Voir `docs/migration-shadcn/01-cohabitation.md`
    §2 pour le diagnostic complet. Quiconque — humain ou agent — touche au
    CSS global doit garder ces deux déclarations synchronisées et en tête
    d'arbre.
12. **Le mode sombre a une source unique : MUI.** `layouts/dashboard.tsx`
    résout `estSombre` (thème choisi + `prefers-color-scheme` en cas de
    `'system'`, via `useColorScheme()`/`useMediaQuery`) et pose la classe
    `.dark` sur `<html>` en conséquence — c'est le seul endroit qui décide.
    Tailwind/shadcn n'ont **aucune** logique de résolution à eux : ils
    suivent la classe (`@custom-variant dark (&:is(.dark *))`,
    `front/src/index.css`). Ne jamais dupliquer cette résolution ailleurs
    (un second `useMediaQuery('(prefers-color-scheme: dark)')`, une lecture
    directe de `localStorage`, etc.) : deux sources désynchronisées
    afficheraient un mode différent entre MUI et Tailwind sur le même écran.
    L'effet qui pose `.dark` doit rester **avant** les `return` anticipés de
    `Layout` (`loading`, `!session`) — sinon l'écran de chargement et l'écran
    de connexion restent toujours clairs, quel que soit le mode.
    `useColorScheme` n'existe que parce que `App.tsx` monte un
    `ThemeProvider` racine à thème `cssVariables` + `colorSchemes`
    (le rôle que jouait l'`AppProvider` Toolpad) : le retirer ne casse
    aucune compilation mais fige silencieusement la résolution du mode.
    Cette source unique est provisoire et assumée comme telle : MUI décide
    tant qu'il porte le plus de fichiers ; l'inversion (Tailwind/shadcn
    devient la source, MUI suit) est devenue possible avec la sortie de
    Toolpad (lot 3) mais reste un lot à part entière, non fait. Voir
    `docs/migration-shadcn/02-tokens.md` §4.

## Conventions

- **Français accentué partout**, via i18next — jamais de chaîne d'interface
  en dur. Genre/élision : `entityMessages.ts`. Version anglaise entretenue
  en miroir.
- **Jamais `i18n.t as unknown as TFunction<ns>`.** `defaultNS` est `errors` :
  ce cast fait passer une fonction liée à `errors` pour liée au namespace
  annoncé, la clé sort brute à l'écran et le compilateur ne voit rien (dix
  occurrences purgées au lot 4bis). Le repli correct d'un `t` optionnel est
  `i18n.getFixedT(null, ns)` — namespace réellement lié, langue active suivie.
  Corollaire : tout libellé évalué au chargement d'un module (les
  `actionsLigne` des `routes.tsx`, figées dans le routeur) se déclare en
  fermeture `libelle: () => traduire(...)`, jamais en chaîne — une chaîne y
  fige la langue de démarrage et ignore la bascule fr/en.
- **Commits en français**, une ligne qui raconte l'intention, pas la
  mécanique.
- **Définitions d'entités** dans `pages/*/entites/*.ts` ; actions de ligne
  **déclaratives** (`services/crud/actions.ts`), jamais de JSX d'action ad
  hoc ; états vides via `EtatVideTable` ; focus via `focus.ts` ;
  téléchargements via `services/telechargement.ts` ; dialogues sur le modèle
  `DeleteConfirmDialog` / `UnsavedChangesDialog` (son contournement du piège
  à focus MUI fait référence) ; erreurs d'import en tableau via
  `LignesRefuseesDialog`.
- **sqlc uniquement** (jamais de SQL concaténé) ; régénérer par
  `infra/gen_sql.sh` et committer le généré. Changesets Liquibase avec `id`,
  `author`, `comment` **et `rollback`**.
- Pas de nouvelle dépendance sans validation explicite de l'utilisateur.
- `npm run build`, `npm run lint`, build Go et `go test` au vert avant de
  conclure.
- Tests Go : package externe `_test`, style de
  `pkg/registre/registre_integration_test.go` (fixture partagée, pool réel,
  handlers en direct, `sub` injecté au contexte) ; comptes Keycloak de test
  en `@test.invalid`, purgés en `t.Cleanup` **et** en préalable ;
  `pkg/user/` documente la stratégie double-système (base ↔ Keycloak).

## Suite e2e (front/e2e) — le filet de régression

- **La suite ne se reproduit qu'à partir d'un état semé — à chaque
  exécution, quel que soit le point d'entrée.** Le seed (`front/e2e/setup/seed.sql`
  — hiérarchie canonique : période complète, rattrapage validé, note non
  évaluée, groupe avec élèves, option sacrificielle pour la corbeille) est
  idempotent *en tant que script*, mais la suite elle-même MUTE cet état
  (notes saisies, éléments mis à la corbeille...) et plusieurs specs
  dépendent explicitement de ce qu'un test précédent y a laissé (voir le
  commentaire de `grille-saisie.spec.ts`). `front/e2e/setup/globalSetup.ts`
  (le `globalSetup` de `playwright.config.ts`) pose donc ce seed sans
  condition, avant toute vérification de rôle — que la suite soit lancée par
  `make test-ihm` (makefile racine ; `make -f makefile.local test-ihm` échoue,
  les variables viennent du makefile racine) ou par `npx playwright test`
  directement depuis `front/`. **Jamais deux suites en parallèle** : le
  re-seed de l'une casse l'autre en plein run (constaté au lot 4ter).
  **Ne jamais réintroduire un seed conditionnel ou propre à
  un seul point d'entrée** : c'est exactement le piège qui rendait la suite
  irreproductible avant `docs/migration-shadcn/01bis-stabilisation-e2e.md`
  (résultats différents selon l'invocation, y compris sur du code
  strictement identique). La stack doit déjà tourner
  (`start-local-keep`) : `globalSetup.ts` échoue immédiatement sinon.
- Trois comptes provisionnés par le seed Terraform local (mêmes variables
  `KC_*` que le bootstrap) : ADMIN / CONSULTATION / NOTES_ECRITURE ;
  `storageState` par rôle capturé en setup (`fixtures/roles.ts`), **langue
  épinglée `fr`** avant capture (`i18nextLng`) — le détecteur de langue
  rendrait la suite dépendante du navigateur sinon.
- Règles d'écriture des specs : ciblage par rôle et nom accessible, **les
  libellés s'importent des JSON `locales/`** (jamais recopiés) ; aucun
  `waitForTimeout` ; absence affirmée explicitement ; specs indépendantes
  les unes des autres (une dépendance d'état *à l'intérieur* d'un même
  fichier, comme dans `grille-saisie.spec.ts`, reste admise et documentée en
  commentaire) ; `workers: 1` (base partagée) ; `BASE_URL` par variable
  d'environnement ; artefacts gitignorés.
- **Critère permanent : deux exécutions consécutives vertes.** Toute
  modification d'interface se conclut par `make test-ihm` ; un scénario
  nouveau validé au navigateur a vocation à rejoindre la suite. Ce critère
  suppose une suite déjà déterministe (point ci-dessus) — un « vert » sur
  une suite qui ne re-sème pas ne prouve rien.
- **Capturer un popup/dialogue OUVERT** (`captures-ouvertes.spec.ts`, lot
  4ter) a ses pièges propres, tous traités dans le fichier : **éloigner la
  souris** avant la capture (`mouse.move(0, 0)`) — le pointeur reste sur le
  déclencheur après le clic d'ouverture (état de survol + infobulle dans le
  cadre) — et **affirmer l'absence d'infobulle** ; attendre la **résolution
  de l'analyse d'impact** avant de photographier une modale de suppression
  (le spinner n'est pas reproductible) ; et savoir que **l'état bloqué masque
  la saisie de confirmation** — formation/promotion E2E sont bloquées par la
  période délibérée, seule « E2E Promo Vide » (seed) montre la saisie.
- **Captures de référence (`e2e/captures.spec.ts-snapshots/`,
  `e2e/captures-ouvertes.spec.ts-snapshots/`) : réaccepter
  un diff est une décision, pas une formalité.** Ces captures figent
  l'apparence MUI + tokens dérivés (voir `docs/migration-shadcn/02-tokens.md`)
  dans les deux modes ; elles existent précisément parce que les 31 tests de
  rôles/textes accessibles sont restés verts pendant que l'étape 1 avait
  fait perdre à toute l'application son apparence MUI (voir
  `docs/migration-shadcn/02bis-filet-regression.md`, qui démontre cette
  détection par un test négatif). Un lot qui change volontairement
  l'apparence régénère avec `npx playwright test captures.spec.ts
  --update-snapshots`, puis **regarde chaque image avant de committer** —
  jamais en confiance sur la seule absence d'erreur de la commande. Un lot
  qui ne touche pas l'apparence et voit une capture échouer a trouvé une
  régression, pas une formalité à contourner par `--update-snapshots`
  réflexe. Ne pas confondre avec le défaut de rendu figé de `BarreAxes`
  (ci-dessus, `cliquerPuisAttendreUrl`) : celui-là fait échouer la
  *navigation* vers l'écran (avant toute capture), pas la comparaison
  d'image elle-même.

## Harnais de vérification manuelle (Playwright MCP)

- Stack : `make -f makefile.local start-local-keep` (ne pas relancer si déjà
  lancée). Application : **https://10.20.2.1:5173** par défaut (adresse
  propre à la machine), certificat mkcert → ignorer les erreurs de
  certificat.
- Keycloak en `login-required` ; comptes de test A/B/C ci-dessus ; se
  connecter une fois, réutiliser la session. Mailpit reçoit tout le courriel
  local (activation de comptes, témoins du registre).
- Cibles utiles : `make ancrer` (passage d'ancrage immédiat),
  `make fetch-freetsa-cert` (racine TSA — acte volontaire, empreinte à
  vérifier).
- **Ne jamais committer** captures, traces ou rapports.

## Déroulé d'un lot — structure éprouvée sur ce projet

1. **Exploration** : lire les fichiers désignés + ce qu'ils référencent,
   avant toute écriture.
2. **Décisions soumises** : les points de conception listés sont proposés,
   argumentés — puis **STOP : attendre la validation de l'utilisateur**.
3. Implémentation, en réutilisant l'existant (« réutilise, ne réécris pas »
   s'applique à tout module de `services/`).
4. **Vérification** : la suite `test-ihm`, plus le tableau de scénarios
   propres au lot au navigateur ; rapporter chaque ligne.
5. **Livrable** : résumé structuré — décisions actées, fichiers touchés,
   résultats, découvertes.
- Tout défaut découvert hors périmètre : **le signaler avec preuve, ne pas
  le corriger silencieusement**. Le « Hors périmètre » d'un lot est
  contraignant.

## Pièges connus du code

- `isDirty` de react-hook-form se parasite avec les champs de date/dayjs —
  normaliser les valeurs par défaut (précédent traité dans `Form.tsx`).
- **Tout champ de date de formulaire passe par `ChampDate`/`ChampDateHeure`**
  (`services/ChampDate.tsx`, lot 12) — jamais un `dayjs(field.value)` direct
  dans un écran. Le composant porte les deux gardes qui ont chacun mordu :
  `dayjs(undefined)` rend l'heure courante (un formulaire de création
  s'ouvrirait pré-rempli à aujourd'hui), et **en édition la valeur est une
  chaîne ISO**, pas un `Date` — react-hook-form est `reset` avec la réponse
  brute de l'API, `z.coerce.date` ne joue qu'à la soumission ; `getTime()`
  sur cette chaîne a fait tomber tout l'écran de détail (constaté au
  navigateur, lot 12). Saisie invalide → `Date` invalide transmis, refusé
  par les schémas zod : ne pas court-circuiter ce circuit d'erreur. Depuis
  une **modale MUI**, passer `conteneurPopup` (ref d'un nœud de la modale) :
  son piège à focus ferme sitôt ouvert tout popup portalé vers `<body>`
  (précédent : `ReservationDialog`).
- **Tout champ de formulaire passe par les champs partagés** (lot 13) :
  `ChampTexte`/`ChampNombre` (`services/ChampTexte.tsx`),
  `ChampSelection`/`ChampInterrupteur` (`services/ChampChoix.tsx`), et
  `ChampDate` pour les dates. Un écran ne leur passe que `name`, `control`,
  `label` et `disabled={isReadOnly}` : le câblage react-hook-form
  (`useController`), l'erreur (`aria-invalid` + message sous le champ) et
  l'état désactivé vivent dans le composant — jamais de `register(...)`
  nu, de `TextField`, ni d'`error`/`helperText` recopiés dans un écran.
  **Un nombre passe par `ChampNombre`**, qui remet au schéma un `number`
  (ou `null` si vidé) : c'est ce qui a réglé la création de salle, qui
  échouait en validation (« nombre attendu, string reçu ») depuis le lot 7
  — un `register('capacite')` sans `valueAsNumber`. Ne jamais ajouter de
  `valueAsNumber`/`setValueAs` dans un écran : c'est le composant qui
  convertit. Un champ vidé vaut `null`, que les schémas `.nullable()`
  acceptent et que les `z.number()` requis refusent par leur message
  habituel. `ChampSelection` monte le `Select` Base UI (le contrôle que la
  suite e2e sait cibler : `combobox` nommé puis `option`) ; son entrée
  « aucun choix » (`libelleVide`) remet `null`, pas `''`. Le libellé est un
  `<label for>` : `getByLabel` trouve chaque champ, y compris Checkbox et
  Switch Base UI (l'`id` va sur leur `<input>` caché, le `label` y est
  associé). Piège du React Compiler : la `ref` de `field` se destructure
  **sous un autre nom** (`ref: refChamp`) — sinon le lint tient tout
  l'objet pour une ref et refuse d'en lire `.value` pendant le rendu
  (constaté au lot 13).
- **L'arbre de la structure (`ArbreStructure.tsx`) est écrit à la main** et
  quatre fichiers e2e dépendent de son balisage exact : `ul role="tree"`,
  `li role="treeitem"` + `aria-expanded`, enfants en `ul role="group"`, et
  la sélection dite par **`aria-checked`** (le choix MUI historique,
  affirmé par `navigation.spec.ts` — pas `aria-selected`). Aucun élément
  focalisable dans un nœud (tabindex tournant) ; clavier par délégation sur
  la racine. Toute évolution préserve ce contrat tel quel.
- **`Checkbox.Root` de Base UI rend un `<span>`, inline par défaut** : sans
  le `inline-flex` posé dans `components/ui/checkbox.tsx`, `size-4` est
  ignoré et la case s'écrase à la largeur de sa bordure — rôle et clic
  restent fonctionnels, donc invisible des tests ; seule une capture le
  montre (constaté au lot 7). Et le socle `DataTable` est exclu du React
  Compiler (`'use no memo'` + eslint-disable ciblé, exigence documentée de
  TanStack Table) : ne retirer ni la directive, ni le commentaire. Une
  surface shadcn qui peut cohabiter avec la charpente MUI pose ses **deux**
  tokens (`bg-background` **et** `text-foreground`) : le texte du body
  appartient à CssBaseline (couche `mui`, qui bat `base`) et ne suit pas la
  classe `.dark` quand le mode choisi diffère de l'OS (voir
  `docs/migration-shadcn/07-datatable.md` §8). Depuis le lot 10, le socle
  porte quatre capacités **opt-in** (`gelColonnes`, `sansPagination`,
  `redimensionnement`, `peutSelectionnerLigne` — seul `JuryPeriode` les
  déclare) : un écran qui ne les déclare pas rend à l'identique, et toute
  évolution du rendu doit préserver cette neutralité. Leurs pièges propres :
  `redimensionnement` exige `size` sur chaque colonne de données (gabarit
  fixe par `colgroup`) ; une cellule gelée pose un **fond opaque** (le
  contenu défile dessous), donc tout état translucide posé sur la ligne
  (survol, sélection — déjà recomposés ; mise en évidence de retour, non)
  y est invisible ; et la poignée de redimensionnement est rentrée de 2 px
  (`right-0.5`) parce que le bouton de tri du `th` gelé voisin (`-ml-2.5`,
  même z-index) recouvre la frontière — la recoller au bord la rendrait
  inaccessible, sans qu'aucun test le voie (constaté au lot 10).
- Le nom accessible d'un `IconButton` peut venir du `Tooltip`, mais
  l'`aria-label` explicite est la convention.
- `chainons.ts` modélise la chaîne entité/identifiant des URL : toute
  nouvelle représentation d'URL s'y greffe, on n'écrit pas de parallèle.
- L'état de table est persisté par parent (`useEtatTablePersistant`,
  `usePersistentTableState.ts`) ; ne pas y introduire de logique supposant
  « toutes les lignes chargées » (pagination serveur possible plus tard).
- Le hash canonique du registre dépend d'une troncature à la microseconde :
  reprendre les tests de stabilité existants pour toute évolution.
- Le seed e2e est **idempotent par pose, pas par cumul** : toute donnée
  ajoutée au seed doit survivre à deux exécutions consécutives. Et son nom ne
  doit faire d'aucun nom existant un **préfixe** : les localisateurs
  Playwright matchent par sous-chaîne — « E2E Promotion Vide » rendait
  ambigus tous les sélecteurs « …E2E Promotion » (mode strict), d'où
  « E2E Promo Vide » (lot 4ter).
- Un bouton **natif** dans un `<form>` est `type="submit"` par défaut — MUI
  posait `type="button"` à notre place, et le `Button` shadcn le pose aussi
  (Base UI `useButton`, vérifié au lot 4ter : retirer l'attribut explicite de
  `Form.tsx` ne casse rien). Le vrai risque des migrations est donc le retour
  à un `<button>` nu ; tout bouton non-soumission le déclare explicitement
  (précédent : « Annuler » de `services/crud/Form.tsx`, lot 4), et
  `formulaire.spec.ts` monte la garde (« Annuler ne crée rien »).
- Les onglets shadcn (variante `line`) débordent de leur liste : le
  soulignement de l'onglet actif est posé quelques pixels **sous** la
  `TabsList` (`after:bottom-[-5px]`). Tout conteneur `overflow-x-auto`
  autour (l'héritier du `variant="scrollable"` MUI) fait alors naître un
  ascenseur vertical permanent — invisible des tests, rôles et textes
  restent accessibles. Précédent : `BarreWorkflows` (lot 5), réglé par un
  dégagement `py-1` sur la racine `Tabs` ; tout futur usage de ces onglets
  dans un conteneur défilant doit prévoir le même dégagement.
- Un popup Base UI peut planter **au montage du popup**, donc rester
  invisible de tout test qui ne l'ouvre pas et de toute capture fermée —
  précédent : `Menu.GroupLabel` hors `Menu.Group` faisait tomber tout
  l'écran à l'ouverture du menu de compte, avec 45 tests verts (lot 3 §5).
  Tout nouveau menu/dialogue shadcn se vérifie ouvert, au navigateur ;
  aucun test e2e n'ouvre le menu de compte à ce jour.
- **Icônes : lucide-react partout dans `src/`, et la taille dépend du
  porteur** (lot 6, `docs/migration-shadcn/06-icones.md` §2). Dans un
  composant shadcn (`Button`, `DropdownMenuItem`, `Alert`, sidebar), l'icône
  se pose **nue** : le CSS `[&_svg:not([class*='size-'])]:size-4` du
  composant gouverne (16 px). Dans un composant MUI, lucide ne suit pas le
  `font-size` (tailles en attributs) : `IconButton` → nue (défaut 24 px =
  MUI medium, même en `size="small"`) ; `startIcon` de `Button` →
  `size={20}` (`size={18}` si bouton small) ; l'ancien `fontSize="small"` →
  `size={20}`. Ne pas « corriger » une icône nue dans un bouton shadcn en
  lui posant une taille : elle créerait un écart avec toutes les autres.
  `@mui/icons-material` est parti avec la dépose de material-react-table
  (lot 11) ; aucun import ne doit revenir dans `src/`.

## Dette et chantiers connus

- **Page témoin `_cohabitation`** (`pages/_cohabitation/`, route dans
  `main.tsx`) — dette du lot 1, devenue la **plus ancienne encore ouverte**
  depuis la dépose de MRT (lot 11). Ne sert plus depuis le lot 4 ; se retire
  à la dépose finale de MUI, où elle servira une dernière fois à vérifier
  qu'aucun style MUI ne subsiste.
- **Montée MUI v9** — déverrouillée par la sortie de Toolpad (lot 3, qui
  épinglait MUI v7) ; non entamée.
- **Aucune intégration continue** (`.github/workflows` absent) : lot CI à
  monter — builds, lint, `govulncheck`, `npm audit --omit=dev`, tests Go
  avec services PostgreSQL/Keycloak, Dependabot, protection de branche ;
  suite e2e en nocturne (runner auto-hébergé pressenti).
- Colonnes de consultation `created_by`/`updated_by` (affichage « modifiée
  par X ») non implémentées — le registre en tient lieu pour la preuve.
- Couverture Go : forte sur resultat/structure/registre/user ; mince sur
  `certification` et `corbeille` (l'e2e couvre le parcours corbeille, pas
  ses requêtes).
- Tableau de rétention du registre : propositions en
  `docs/rgpd-registre.md`, **à valider par le DPO** avant données réelles ;
  passage DPO commun avec le futur pointage (rex-imt).
- Passe de cohérence libellés écran ↔ bulletins Excel (`jury_excel.go`)
  jamais faite — avant la première remise de bulletins.
- Version anglaise : générée, **non relue par un anglophone** — à faire
  relire ou à assumer comme brouillon.