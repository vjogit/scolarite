# CLAUDE.md — projet scolarite

Gestion de scolarité (formations → promotions → options → périodes → UE →
matières → contrôles ; notes, jurys, certifications, planning, salles).
Application réservée au personnel administratif. Pas encore en production.

## Stack

- **Back** : Go (chi, pgx, sqlc), PostgreSQL, migrations Liquibase
  (`infra/liquibase/releases/`), Keycloak (Terraform `infra/keycloak/`),
  Docker Compose + nginx (`infra/run/`), Mailpit en local.
- **Front** : React 19, TypeScript durci (`noUncheckedIndexedAccess`, zéro
  `any`), **shadcn/ui sur Base UI + Tailwind v4** (`components/ui/`) — le
  seul système de composants ; aucun moteur CSS-in-JS. Une seule feuille de
  style, `src/index.css` (tokens dérivés de la palette MUI d'origine, voir
  `docs/migration-shadcn/02-tokens.md`).
  - Tables : socle `DataTable` (TanStack Table), `services/crud/`.
  - Formulaires : champs partagés `services/Champ*.tsx` sur
    `components/ui/field.tsx` — texte, nombre, sélection, interrupteur,
    case, date (`ChampDate`/`ChampDateHeure`, react-day-picker dans un
    `Popover`). Un écran ne câble pas react-hook-form lui-même.
  - Mode clair/sombre : `services/modeCouleur.ts` (`useModeCouleur`), la
    seule source (invariant 12).
  - Arbre de la structure : écrit à la main (`pages/structure/arbre/`).
  - Notifications : sonner, derrière `services/notify.ts` (API impérative,
    durées centralisées).
  - Shell : sidebar + menu de compte, `layouts/dashboard.tsx`.
  - TanStack Query, react-router 7 (`createBrowserRouter`),
    **i18next fr/en** (namespaces dans `front/src/i18n/locales/` — toute clé
    ajoutée l'est dans les deux langues).
  - **MUI et Emotion sont partis** (dix-sept lots, terminés au lot 17) :
    aucun import `@mui/*` ni `@emotion/*` ne doit revenir, ni dans `src/`,
    ni dans `package.json`. L'historique de la migration est dans
    `docs/migration-shadcn/`, un document par lot. Ne pas le dupliquer ici.
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
11. **Une seule feuille de style, aux couches de Tailwind.**
    `front/src/index.css` est le seul CSS du projet ; ses couches sont
    celles que `@import "tailwindcss"` déclare (`theme, base, components,
    utilities`), et rien ne les redéclare ailleurs. Ne réintroduire **aucun
    moteur qui injecte du CSS à l'exécution** (CSS-in-JS, `<style>` posé en
    JS) : en CSS, une règle hors couche l'emporte toujours sur une règle en
    couche, quelle que soit sa spécificité — un tel moteur écraserait
    silencieusement les utilitaires Tailwind et les composants shadcn, sans
    qu'aucun test de rôles ou de textes ne le voie (c'est exactement ce que
    la couche `mui` et son `GlobalStyles` conjuraient du lot 1 au lot 16,
    voir `docs/migration-shadcn/01-cohabitation.md` §2 et `17-depose-mui.md`
    §4). La seule feuille tierce hors couche est celle de FullCalendar,
    pilotée par des variables posées sur l'élément `.fc`, jamais par un
    utilitaire (voir « Pièges »). Le corps de page est réglé dans la couche
    `base` : interlettrage et lissage hérités de MUI, `color-scheme` par la
    classe `.dark` — ces trois règles y restent tant que la typographie
    n'est pas redécidée.
12. **Le mode sombre a une source unique : `services/modeCouleur.ts`.**
    `useModeCouleur()` lit la préférence enregistrée (`localStorage`, clé
    `mui-mode` — nom hérité de MUI, gardé au lot 17 pour ne déconnecter
    aucune préférence ; `light`/`dark`/`system`) et, en cas de `system`, la
    préférence de l'OS **par abonnement** (`matchMedia`, `storage` pour les
    autres onglets, via `useSyncExternalStore`), et en tire `estSombre`.
    `layouts/dashboard.tsx` pose la classe `.dark` sur `<html>` en
    conséquence — c'est le seul endroit qui décide. Tout le reste suit la
    classe (`@custom-variant dark (&:is(.dark *))` et `color-scheme` dans
    `index.css`) ou la valeur (`theme` du toaster). Ne jamais dupliquer
    cette résolution ailleurs (un second `matchMedia('(prefers-color-scheme:
    dark)')`, une lecture directe de `localStorage`) : deux sources
    désynchronisées afficheraient deux modes sur le même écran — c'était
    le défaut « sombre choisi + OS clair » des lots 7 à 16, fermé au lot 17.
    L'effet qui pose `.dark` doit rester **avant** les `return` anticipés de
    `Layout` (`loading`, `!session`) — sinon l'écran de chargement et l'écran
    de connexion restent toujours clairs, quel que soit le mode. Aucun écran
    n'offre encore de bascule : `setMode` n'a pas de consommateur (la page
    témoin qui l'appelait est partie au lot 17).

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
  `DeleteConfirmDialog` / `UnsavedChangesDialog` ; erreurs d'import en
  tableau via `LignesRefuseesDialog`.
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
  l'apparence shadcn sur les tokens dérivés de MUI (voir
  `docs/migration-shadcn/02-tokens.md`) dans les deux modes ; elles existent
  précisément parce que les 31 tests de rôles/textes accessibles sont restés
  verts pendant que l'étape 1 avait fait perdre à toute l'application son
  apparence (voir
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
  (`services/ChampDate.tsx`, lot 12 ; sur le contrat `name`/`control` des
  autres champs partagés depuis le lot 17) — jamais un `dayjs(field.value)`
  direct dans un écran. Le composant porte les deux gardes qui ont chacun
  mordu : `dayjs(undefined)` rend l'heure courante (un formulaire de
  création s'ouvrirait pré-rempli à aujourd'hui), et **en édition la valeur
  est une chaîne ISO**, pas un `Date` — react-hook-form est `reset` avec la
  réponse brute de l'API, `z.coerce.date` ne joue qu'à la soumission ;
  `getTime()` sur cette chaîne a fait tomber tout l'écran de détail
  (constaté au navigateur, lot 12). Saisie invalide → `Date` invalide
  transmis, refusé par les schémas zod : ne pas court-circuiter ce circuit
  d'erreur. Le calendrier se portalise vers `<body>` : la modale Base UI le
  reconnaît comme sien, aucun conteneur à passer.
- **Tout champ de formulaire passe par les champs partagés** (lot 13) :
  `ChampTexte`/`ChampNombre` (`services/ChampTexte.tsx`),
  `ChampSelection`/`ChampInterrupteur`/`ChampCase` (`services/ChampChoix.tsx`),
  et `ChampDate` pour les dates. **Ils supposent react-hook-form** : un
  écran qui porte son formulaire en `useState` y passe d'abord (précédent
  `ReservationDialog`, lot 14 — `useForm` à `defaultValues` calculés au
  montage, formulaire monté dans le popup, plus d'initialisation sur
  transition). `ChampSelection` travaille en **chaînes** : un identifiant
  numérique se convertit à la soumission. Le choix multiple n'est pas dans
  le contrat (combobox à chips local à `ReservationDialog`), ni le
  sélecteur de couleur (`<input type="color">` local à `Matiere`, seul
  écran à en monter un). Un écran ne leur passe que `name`, `control`,
  `label` et `disabled={isReadOnly}` — plus, depuis le lot 15, **`aide`**
  (le texte sous le champ, l'ancien `helperText` hors erreur ; en légende
  sous le libellé d'un interrupteur ou d'une case, ce que les modales du
  jury faisaient à la main) et, sur `ChampTexte` seul, **`formater`**
  (la valeur que l'API livre sous une autre forme que la saisie — les
  échelles de Promotion arrivent en tableau, se saisissent en
  `a=4,b=3.5,…`). Le câblage react-hook-form
  (`useController`), l'erreur (`aria-invalid` + message sous le champ) et
  l'état désactivé vivent dans le composant — jamais de `register(...)`
  nu, d'`<input>` de formulaire nu, ni d'`error`/`helperText` recopiés dans
  un écran.
  **`ChampTexte` soumet `''` pour un champ absent d'`emptyValue`** :
  `useController` soumet la valeur du formulaire (`undefined` en création),
  là où `register` soumettait celle du DOM — sans ce repli, un nom laissé
  vide recevait le message générique de zod (« string attendu, undefined
  reçu ») au lieu de « Le nom est requis » (constaté au navigateur, lot 15,
  sur les sept formulaires de structure ; Salle ne le montrait pas parce
  que son `emptyValue` porte `name: ''`). Une modale à interrupteur ou à
  champs sans schéma (délibération, bulletins) passe aussi par `useForm` +
  champs partagés, formulaire monté dans le popup (lot 15, précédent lot
  14) ; seule la saisie de confirmation d'une suppression ou d'une purge
  reste un `Label` + `Input` nus, sur le modèle de `DeleteConfirmDialog`.
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
- **`UserSelector` lit sa sélection dans le formulaire** (`useWatch`, objet
  mémorisé sur ses trois valeurs) et laisse Base UI dériver le texte du
  champ de `value` (`inputValue` non contrôlé) — lot 14. Deux états locaux
  recopiés du formulaire s'en désynchronisaient (champ vide en édition,
  élève fantôme après un `reset` du parent). Base UI compare `value` **par
  référence** pour resynchroniser le texte : un objet reconstruit à chaque
  rendu rendrait le champ insaisissable.
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
  TanStack Table) : ne retirer ni la directive, ni le commentaire. Depuis
  le lot 10, le socle
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
- Le nom accessible d'un bouton icône (`Button variant="ghost"
  size="icon"`) est un `aria-label` explicite, jamais le seul `Tooltip`.
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
- Un bouton **natif** dans un `<form>` est `type="submit"` par défaut — le
  `Button` shadcn pose `type="button"` à notre place (Base UI `useButton`,
  vérifié au lot 4ter : retirer l'attribut explicite de `Form.tsx` ne casse
  rien). Le vrai risque est donc un `<button>` nu ; tout bouton
  non-soumission le déclare explicitement
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
- **Une modale shadcn ne borne pas sa hauteur** : `DialogContent` ne fait
  pas défiler son contenu, là où la modale MUI faisait défiler son
  `DialogContent` sous un titre et des actions fixes. Un formulaire long y
  déborde de l'écran, titre et bouton de soumission hors de vue — invisible
  des tests (rôles et textes restent accessibles), constaté au navigateur
  (lot 14, `ReservationDialog`). Le motif : `max-h-[calc(100vh-4rem)]` +
  `grid-rows-[auto_minmax(0,1fr)_auto]` sur `DialogContent`, corps en
  `overflow-y-auto` avec marge interne compensée (anneau de focus). Tout
  popup ouvert depuis ce corps se portalise vers `<body>` — la modale Base
  UI reconnaît ses popups (sélection, combobox, calendrier) —, sinon le
  défilement le rogne.
- **FullCalendar injecte sa feuille de style à l'exécution, hors couche**
  (`<style data-fullcalendar>` inséré avant la feuille du projet, variables
  `--fc-*` déclarées sur `:root`). Son habillage vit dans `index.css` sous
  `.fc { --fc-…: var(--token) }` (lot 14, bloc `components`) : une variable
  déclarée **sur l'élément** prime sur celle héritée de `:root`, quelle que
  soit la couche — c'est ce qui laisse l'invariant 11 intact. Ne jamais
  redéclarer ces variables sur `:root` (perdant face au style injecté) ni
  poser un utilitaire Tailwind sur un élément `.fc-*` (toute règle
  FullCalendar hors couche bat une règle en couche). Les valeurs sont des
  références aux tokens : `.dark` n'a rien à redéclarer.
- **Déplacer le focus depuis le rappel d'un contrôle Base UI se fait après
  le rendu, pas dans le rappel** (lot 16, grille de saisie). Décocher « non
  évalué » doit rendre la main au champ de note : appelé dans
  `onCheckedChange`, `focus()` ne fait rien parce que le champ porte encore
  `disabled` — React n'a pas rejoué le rendu qui le réactive — et le focus
  reste sur la case, à la souris comme au clavier. `GrilleNotesTable` le
  diffère (`requestAnimationFrame`) ; le `Checkbox` MUI avait la même
  mécanique (déduit par lecture, jamais vérifié à l'écran avant ce lot).
  Corollaire pour qui pilote l'écran : tant qu'un popup Base UI est ouvert
  dans une modale (le combobox de l'export), la modale porte
  `data-base-ui-inert` et ses boutons disparaissent de l'arbre accessible —
  fermer le popup (Échap) avant de cibler « Annuler ».
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
  composant gouverne (16 px). Ne pas « corriger » une icône nue dans un
  bouton shadcn en lui posant une taille : elle créerait un écart avec
  toutes les autres. Hors composant shadcn (un `span` nu), la taille se
  pose en attribut (`size={20}` pour l'ancien « small » MUI).

## Dette et chantiers connus

- **Typographie et bascule de mode : deux décisions de design, pas de
  migration.** Le corps de page garde la pile Roboto et l'interlettrage
  `body1` de MUI (`index.css`, `@theme` et couche `base`) ; passer à une
  typographie shadcn (Geist, sans interlettrage) régénérerait toutes les
  captures. Et aucun écran n'offre de bascule clair/sombre : `setMode` de
  `useModeCouleur` attend son premier consommateur (menu de compte) — c'est
  le moment de renommer la clé `mui-mode`, avec reprise de l'ancienne valeur.
- **Versions épinglées à réévaluer** — la migration est terminée, la
  promesse « zéro montée parasite » peut être levée. `react-day-picker` est
  épinglé **9.14.0** (la v10 est sortie pendant le lot 12, API non
  éprouvée) et `@tanstack/react-table` en **8.20.6 exact** (le caret
  résolvait en 8.21.3, réépinglé au lot 7). À rouvrir dans un lot de mise à
  jour dédié, avec `npm audit`.
- **Aucune intégration continue** (`.github/workflows` absent) : lot CI à
  monter — builds, lint, `govulncheck`, `npm audit --omit=dev`, tests Go
  avec services PostgreSQL/Keycloak, Dependabot, protection de branche ;
  suite e2e en nocturne (runner auto-hébergé pressenti).
### Défauts constatés, non corrigés

Trouvés au cours de la migration, tous **hors périmètre du lot où ils sont
apparus** — donc jamais traités. Ils ne sont pas des dettes de migration :
ils survivront à celle-ci si personne ne les reprend.

- **`UpdateToeic` n'écrit pas `user_id`** (lot 14). Changer l'élève d'un
  résultat TOEIC en édition est **sans effet** : l'interface accepte, le PUT
  porte la valeur, la requête SQL ne l'écrit pas. Perte de saisie
  silencieuse, côté back. Le plus sérieux des quatre.
- **Colonne « Rôles » vide dans la liste des utilisateurs** (lot 13) : la
  consultation montre les rôles cochés, la liste ne semble pas les recevoir.
- **Message zod brut pour un nombre requis vidé** (lot 13) : un message
  métier demande une `error` sur chaque schéma concerné.
- **Les libellés et annonces des axes de notes sont des chaînes françaises
  en dur** (`pages/note/axes.ts`, `AXES[].libelle`/`annonce`, depuis l'écran
  unifié) : en anglais, la barre d'axe affiche « Élève, Contrôle, Matière, UE,
  Période » et chaque écran son annonce en français (constaté au navigateur,
  lot 16, langue `en` + rechargement). Hors périmètre de la migration ; à
  passer en fermetures `() => traduire(...)` comme les `actionsLigne` des
  `routes.tsx` — `notes-unifie.spec.ts` et `hierarchieE2E.ts` ciblent ces
  libellés en français, langue épinglée, et ne bougeraient pas.
- **`registre.spec.ts` intermittent** (lot 11) : un échec unique, y compris
  relancé seul, puis quatre passages verts ; cause non identifiée, artefacts
  écrasés. **Si l'échec revient, sauver `test-results/` avant toute
  relance.**

Deux défauts plus anciens sont documentés dans « Pièges connus » et dans la
suite e2e plutôt qu'ici, parce qu'ils piègent activement quiconque écrit du
code : rendu figé de `BarreAxes`, rebond Keycloak sur lien profond. Le
troisième — la désynchronisation des variables CSS MUI quand le mode choisi
différait de l'OS (lots 7, 8, 10) — est **fermé** par la dépose de MUI
(lot 17, vérifié au navigateur : sombre choisi + OS clair → tout l'écran
sombre, `color-scheme` compris).

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