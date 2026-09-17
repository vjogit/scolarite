# CLAUDE.md — projet scolarite

Gestion de scolarité (formations → promotions → options → périodes → UE →
matières → contrôles ; notes, jurys, certifications, planning, salles).
Application du personnel : administration de la scolarité, et, pour le
syllabus, responsables de formation et enseignants (comptes AGENT
existants). Pas encore en production.

## Stack

- **Back** : Go (chi, pgx, sqlc), PostgreSQL, migrations Liquibase
  (`infra/liquibase/releases/`), Keycloak (Terraform `infra/keycloak/` ;
  thème de connexion `infra/keycloak/themes/scolarite/`, CSS et scripts
  seuls sur keycloak.v2, voir « Pièges »), Docker Compose + nginx
  (`infra/run/`), Mailpit en local, **Gotenberg** (conversion HTML → PDF,
  `pdf-service` de `infra/container/compose.yaml`, image épinglée,
  `10.20.2.7:3000` sur le réseau Docker, jamais publié sur l'hôte ; démarré
  par `_pdf-up` / `_pdf-up-prod` dans les chaînes `start-*`, adresse
  `GOTENBERG_HOST` des `config-*.env`, bloc `pdf` du `config.yaml`). **Le
  client est mutualisé dans `services/pdf.go`** (`ConvertisseurPDF`,
  bibliothèque standard, POST multipart, PDF entier en mémoire, jamais
  tronqué ; défaillance → 503 `SERVICE_UNAVAILABLE`, code ajouté le 15
  septembre 2026 dans `errors.go`, `errorMessages.ts`, `errors.json`) : la
  fiche syllabus est son premier consommateur, **les bulletins de jury sont
  le second prévu** — toute génération de document passe par lui, jamais par
  un appel enfoui dans un domaine.
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
  - Shell : sidebar (groupe « Admin » repliable), bascule clair/sombre,
    langue et menu de compte, `layouts/dashboard.tsx`.
  - TanStack Query, react-router 7 (`createBrowserRouter`),
    **i18next fr/en** (namespaces dans `front/src/i18n/locales/` — toute clé
    ajoutée l'est dans les deux langues).
  - **MUI et Emotion sont partis** (dix-sept lots, terminés au lot 17) :
    aucun import `@mui/*` ni `@emotion/*` ne doit revenir, ni dans `src/`,
    ni dans `package.json`. L'historique de la migration est dans
    `docs/migration-shadcn/`, un document par lot. Ne pas le dupliquer ici.
- **Tests** : Go unitaires + intégration gardés par l'environnement
  (`t.Skip` explicite) ; suite Playwright versionnée dans `front/e2e/`.
- **CI GitHub Actions** (`.github/workflows/`, un fichier par
  préoccupation, `docs/ci.md`) : `verification.yml` (lint, build, Go,
  généré sqlc à jour) et `e2e.yml` (la suite complète — 91 tests, dont les
  24 captures de référence — contre la stack montée par
  `make start-local-reset` sur l'exécuteur, `infra/env/config-ci.env`, dans
  le conteneur de référence, voir « Suite e2e »).
- Trois modes de lancement : `makefile.local` / `makefile.prod`, fichiers
  d'environnement dans `infra/env/` (`config-*.env`, secrets jamais
  committés). `config-ci.env` est le jumeau de `config-local.env` pour
  l'exécuteur GitHub (même espace de travail `local`, autres chemins) ; la
  CI vérifie que les deux déclarent les mêmes variables, et les scripts
  reçoivent leurs fichiers par `CONFIG_FILE_LOCAL` / `SECRETS_FILE_LOCAL`
  sur la ligne de commande de `make` — plus aucun script ne dérive ces
  chemins de son côté. **L'espace de travail local exige `mkcert`** :
  `start-scolarite.sh` s'arrête sans lui (sinon le backend ne validerait
  aucun jeton et chaque appel d'API répondrait 503), génère le certificat
  nginx dans `${SCOLARITE_CONF_DIR}/ssl/` quand il manque ou n'est plus signé
  par la CA du poste, puis dépose la racine pour le backend — la CI n'a plus
  d'étape de certificat, c'est elle qui prouve qu'un poste neuf démarre
  (12 septembre 2026). Le contexte de build des images est protégé par le
  `.dockerignore` racine (`front/node_modules/` surtout : sans lui, celui du
  poste écrasait le `npm ci` de l'image).
- **Les images applicatives sont neutres vis-à-vis de l'environnement**
  (12 septembre 2026, `docs/deployements.md` « Images et déploiement ») : ni
  certificat (monté depuis `${SCOLARITE_CONF_DIR}/ssl`, clé lisible par
  l'UID 10001 de nginx — mkcert la pose en 0600, le script la passe en
  0644 en local), ni URL du front (le bundle s'adresse à
  `window.location.origin` ; `front/.env` ne porte que realm et client,
  plus aucun `.env.<mode>` ni `FRONT_MODE`), ni configuration (rendue et
  montée). `compose.yaml` porte `image:` **et** `build:` ; `IMAGES_MODE`
  (`build`/`pull`), `IMAGES_REGISTRE`, `IMAGES_TAG` viennent des
  `config-*.env` et sont les seules variables surchargeables sur la ligne de
  `make`. `make publier-images` construit et pousse (arbre propre exigé),
  `make kit-deploiement` archive ce qu'un hôte sans sources exécute
  (makefiles, `infra/`, gabarit `config.yaml`) ; la prod ne construit ni ne
  génère rien (`gen_sql` retiré de ses chaînes). Ne réintroduire aucune
  valeur d'environnement dans le Dockerfile.

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
    `mode-couleur` — renommée le 5 septembre 2026 depuis `mui-mode`, avec
    reprise de l'ancienne valeur au chargement du module ;
    `light`/`dark`/`system`) et, en cas de `system`, la
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
    de connexion restent toujours clairs, quel que soit le mode. La seule
    bascule est `services/BasculeModeCouleur.tsx`, dans l'en-tête (rôle
    `switch` « Mode sombre », deux positions : elle écrit `light` ou `dark`,
    jamais `system` — cet état est celui d'un navigateur sans préférence) ;
    elle n'appelle que `setMode`, elle ne résout rien.

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
  `infra/gen_sql.sh` (pg_dump → `back/schema.sql` → `sqlc generate`), ou
  par `sqlc generate` seul dans `back/` quand le schéma n'a pas bougé.
  **Le généré (`back/pkg/**/gen/`) fait partie du dépôt** : à régénérer et
  à committer à chaque changement de schéma ou de requête, dans le même
  commit que la requête ou le changeset — tranché le 4 septembre 2026
  (jusque-là `.gitignore` l'excluait et un clone neuf ne compilait pas, lot
  CI). La CI (`verification.yml`) régénère hors ligne depuis `schema.sql`
  et **échoue si le résultat diffère du commit**. Changesets Liquibase avec
  `id`, `author`, `comment` **et `rollback`**. **Tant qu'aucun déploiement
  n'existe, un changeset se réécrit en place** (précédent : `003-create-bloc-
  competence`, `formation_id` → `promotion_id` le 16 septembre 2026, bases
  locales recréées par `start-local-reset`, `scolarite_tu` refaite depuis
  `schema.sql`) ; **au premier déploiement réel, les changesets deviennent
  immuables** et toute évolution passe par de nouveaux changesets.
- Pas de nouvelle dépendance sans validation explicite de l'utilisateur.
- `npm run build`, `npm run lint`, build Go et `go test` au vert avant de
  conclure.
- Tests Go : package externe `_test`, style de
  `pkg/registre/registre_integration_test.go` (fixture partagée, pool réel,
  handlers en direct, `sub` injecté au contexte) ; comptes Keycloak de test
  en `@test.invalid`, purgés en `t.Cleanup` **et** en préalable ;
  `pkg/user/` documente la stratégie double-système (base ↔ Keycloak).
  **Les fixtures de `testdata/` sont suivies** par git, quel que soit leur
  format (`.gitignore` : `!**/testdata/**`, tranché le 4 septembre 2026) —
  `pkg/structure/exchange/testdata/programme.xlsx`, que le test
  d'intégration d'import exige, en est le précédent ; un test ne doit jamais
  dépendre d'un fichier que le dépôt ne porte pas (les CSV manquants de
  `programme-import` restent le contre-exemple, voir « Dette »).

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
- Quatre comptes provisionnés par le seed Terraform local (mêmes variables
  `KC_*` que le bootstrap) : ADMIN / CONSULTATION / NOTES_ECRITURE /
  SYLLABUS_ECRITURE (le quatrième depuis le lot 2 syllabus, 14 septembre
  2026 : `pageSyllabus` — un compte de test entre dans douze endroits à la
  fois, `keycloak.tf`, `variables.tf`, `deploy.sh`, les deux `config-*.env`,
  `secrets.env.example`, `README.md` d'`infra/env`, la liste des secrets
  jetables d'`e2e.yml`, `env.ts`, `auth.setup.ts`, `roles.ts`, plus le
  secret du poste) ;
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
  une suite qui ne re-sème pas ne prouve rien. La CI (`e2e.yml`) rejoue la
  suite complète sur chaque push par la même cible (`make test-ihm`, 91
  tests, captures comprises), `retries: 0` inchangé, et publie à chaque run
  `test-results/`, le rapport HTML et les journaux des conteneurs — **un
  échec intermittent en CI se diagnostique dans l'artefact, jamais par une
  relance** (consigne `registre.spec.ts`).
- **Les captures se comparent et se régénèrent dans le conteneur de
  référence, nulle part ailleurs** (`front/e2e/conteneur/`, arbitrage du
  4 septembre 2026, `docs/ci.md` §10). `make test-ihm` y lance toute la
  suite — image officielle Playwright à la version de `@playwright/test`,
  **épinglée par empreinte**, Ubuntu 24.04 comme l'exécuteur GitHub — et la
  CI fait exactement de même : **les références font foi dans cet
  environnement**, et la comparaison est stricte (aucun seuil de tolérance,
  et aucun ne sera ajouté pour absorber un écart de rendu — un écart de
  rendu est un écart d'environnement, et l'environnement est fixé par
  l'empreinte). Hors du conteneur (`npx playwright test` depuis `front/`),
  les deux specs de captures **se sautent d'elles-mêmes**
  (`e2e/aide/conteneur.ts`, marqueur posé par l'image, jamais par
  l'appelant) : un poste rend d'autres glyphes — 20 échecs sur 20 mesurés
  au lot CI — et un `--update-snapshots` y produirait des références que la
  CI refuserait. Trois règles : **ne jamais committer une référence
  produite hors du conteneur** ; régénérer par `make captures-reference`,
  **contre une base réduite au seed** (une donnée du poste hors seed, telle
  la formation « FIA », entrerait dans l'image — `start-local-reset`, ou la
  base du poste écartée le temps de la régénération, `docs/ci.md` §10) ; et
  **regarder chaque image** avant de committer. Corollaire assumé : sur un
  poste dont la base porte plus que le seed, `formation-liste` échoue en
  local — c'est un écart d'état, pas de code ; la CI, base semée, tranche.
  L'image et `@playwright/test` montent ensemble, jamais l'un sans l'autre,
  et toute montée régénère les 24 références.
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
  l'apparence régénère avec `make captures-reference` (dans le conteneur de
  référence, contre une base réduite au seed — jamais un
  `--update-snapshots` sur le poste), puis **regarde chaque image avant de
  committer** —
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

## Syllabus — domaine à l'état stable (chantier clos le 15 septembre 2026, référentiel rattaché à la promotion le 16)

Cadré le 14 septembre 2026 à partir de l'analyse de la base d'une application
tierce, livré en cinq lots (schéma et module, écrans, référentiel de
compétences, import du legacy, fiche PDF) sur la branche `syllabus`. Le
syllabus n'est **pas un sous-arbre structurel** : c'est du contenu
pédagogique attaché aux entités existantes (matière, UE), plus un référentiel
de compétences par formation. Le versionnement annuel du tiers (tables
`*_annee`, `anneescolaire`) n'est pas repris : la duplication de la
structure par promotion en tient lieu — et le livret PDF se génère par
promotion pour la même raison.

**Principe du nom stable** (16 septembre 2026, dit par l'utilisateur) : *le
nom d'une UE ou d'une matière ne change pas d'une année à l'autre — un
changement de nom signifie un nouveau cours.* Le nom est l'identité stable à
travers les promotions ; c'est ce qui fonde l'appariement par nom de l'import
et la comparabilité entre promotions, et ce que la création par gabarit
recopie tel quel.

**Principe directeur, valable pour tout le domaine** : les données de
structure font référence — noms, `matiere.heure`, `matiere.coeff`,
`unite_enseignement.ects`, la hiérarchie. Le syllabus se construit à partir
d'elles et ne les duplique jamais dans ses tables ; il n'ajoute que du
contenu (rubriques, ventilation, responsable, description, liaisons). Toute
incohérence entre le syllabus et la structure — au premier chef un écart
entre `matiere.heure` et la somme des heures encadrées de la ventilation —
est **signalée à l'affichage, jamais bloquante** : aucune contrainte
inter-domaines en base, aucune jointure vers la structure dans les requêtes
syllabus (les lectures de structure passent par les repositories de
structure), aucune écriture refusée pour ce motif. Le signalement vit à
l'écran de saisie (ligne `role="status"` vivante) et sur la fiche PDF (ligne
d'écart sous les volumes horaires, même formulation). Ne pas rouvrir.

### Architecture

1. **`syllabus_matiere`**, 1-1 avec `matiere` (FK unique, `ON DELETE
   CASCADE`) : huit rubriques TEXT nommées sur les sections de la maquette
   (`contexte`, `objectifs`, `prerequis`, `activites`, `evaluation`,
   `plan_cours`, `ressources`, `dimension_socio_env`), ventilation horaire
   en huit colonnes `NUMERIC(5,2)` nullables (`heures_cours`,
   `heures_cours_td` = cours intégré, `heures_td`, `heures_tp`,
   `heures_projet`, `heures_autonomie` = autonomie encadrée,
   `heures_controle`, `heures_perso` = travail personnel ; le volume encadré
   est la somme des sept premières, `heures_perso` reste hors total ; le
   champ « autre » du tiers n'a pas de colonne — 76 lignes sur 1 798 le
   portaient en fourre-tout, il se signale au rapport d'import et ne
   s'importe pas), `responsable_id` FK vers `public."user"` (AGENT) en
   **`ON DELETE SET NULL`** — la fiche survit au départ de l'agent, là où
   les six FK existantes vers `"user"` cascadent parce que la ligne
   appartient à l'élève. Rien en base n'impose `type_personne = AGENT` :
   c'est le sélecteur qui filtre. Côté Go la ventilation est en `*float64`
   par une surcharge sqlc propre au package (`pg_catalog.numeric`,
   `back/sqlc.yaml`) ; une valeur au-delà de 999,99 est refusée **avant**
   l'écriture (motif `valeur_hors_plage`), PostgreSQL ne nommant pas la
   colonne d'un 22003. Migrations dans
   `infra/liquibase/releases/v0.01/007-syllabus/` (dossier numéroté par
   domaine dans l'unique release, sans jalon `tagDatabase`).
2. **`unite_enseignement`** : deux colonnes nullables `description` et
   `responsable_id` (FK `fk_ue_responsable`, `SET NULL`), écrites par la
   route syllabus de l'UE seulement : `UpdateUniteEnseignement` (domaine
   STRUCTURE) ne les nomme pas, la requête syllabus ne touche ni `name`, ni
   `ects`, ni `academique`. Le GET de l'UE (structure, `SELECT *`) porte les
   deux champs : pas de GET syllabus pour l'UE (invariant 2, l'écran lit le
   repository UE).
3. **Référentiel de compétences par promotion** — tranché le 16 septembre
   2026, **remplace la décision du lot 0 « par formation »** (la déclaration
   France Compétences se fait par fiche RNCP, mais les compétences varient
   d'une promotion à l'autre, INFRES18 ≠ INFRES19 ; c'est l'alignement sur le
   reste du modèle — structure dupliquée par promotion, livret par promotion,
   versionnement annuel du tiers — et la garantie de périmètre en sort
   renforcée : une UE ne se lie qu'aux compétences de SA promotion). Voir
   « Compétences par promotion et création par gabarit » ci-dessous.
   `bloc_competence` porte `promotion_id` ; champs calqués sur le
   document France Compétences — bloc : libellé, code nullable (les blocs du
   document sont numérotés, pas codés), activités, modalités d'évaluation ;
   compétence : action observable (verbe), contexte (« en… »), finalités
   (« afin de… »). Rattachement **au niveau UE** : `ue_competence (ue_id,
   competence_id, enseignee, mise_en_oeuvre, evaluee)`, trois booléens et
   pas de table d'états (la légende à sept états du tiers n'était que la
   combinatoire de ces trois axes) ; une ligne aux trois axes faux n'existe
   pas (`chk_ue_competence_au_moins_un`) — la ligne absente EST l'état
   « non adressée ». La contribution d'une UE à un bloc est **dérivée,
   jamais stockée** (au moins une compétence du bloc marquée). L'ordre est
   une position saisie, unique par parent (`uk_bloc_competence_ordre` sur
   `(promotion_id, ordre)`, `uk_competence_ordre`) ; le code affiché « C{ordre} » se calcule à
   l'affichage, `bloc_competence.code` reste réservé à un code RNCP
   officiel. Matrice écrite par **remplacement intégral sans verrou**
   (`PUT /ue/{ueID}/competences`, DELETE + INSERT … SELECT en une
   transaction, dernier écrit gagne ; la version de l'UE n'est pas
   touchée). Une UE ne se lie qu'aux compétences de sa propre promotion,
   garanti côté serveur par la jointure UE → période → option → promotion
   (vues actives) : une ligne non insérée annule tout (motif
   `hors_promotion` ; `reference_inconnue` si l'identifiant n'existe pas).
   `RemplacerMatrice` est appelable hors HTTP (l'import s'en sert). Blocs et
   compétences suivent leur promotion par cascade (la purge de la corbeille
   les emporte ; `PromotionDeleteImpact` les annonce, `FormationDeleteImpact`
   les agrège par ses promotions actives). La saisie du référentiel se fait
   à la main par l'écran, ou par copie du gabarit à la création d'une
   promotion — aucun outil d'import de référentiel, la source est le
   document France Compétences (Excel), pas la base tierce.
4. **Rôle Keycloak `SYLLABUS_ECRITURE`**, neuvième rôle de domaine (lecture
   globale, écritures ciblées : fiches, description d'UE, matrices,
   référentiel — une seule population). Population rédactrice — tranchée :
   responsables de formation et enseignants, comptes AGENT déjà connus,
   attribués par l'écran utilisateurs. **Corollaire assumé** : rôle de
   domaine, son porteur écrit n'importe quelle fiche ; le cloisonnement fin
   (« sa formation », « ses matières ») est une évolution possible, les
   données nécessaires existent (`responsable_id` sur l'UE et la fiche).
   Le rôle vit dans **cinq endroits synchrones** : `infra/keycloak/keycloak.tf`
   (composite de CONSULTATION, ajouté au composite ADMIN),
   `RolesFonctionnels` **et** `AssignableRoles` de
   `back/pkg/services/roles.go`, l'énumération `Role` de
   `front/src/pages/user/def.tsx`, les libellés de `user.json` fr et en.
   Jamais en partie : `RolesFonctionnels` exprime le composite ADMIN par
   `RequireAllRoles` sur les routes de la corbeille — un rôle ajouté en Go
   avant Terraform fermerait la corbeille à tout porteur d'ADMIN.
5. **Module `back/pkg/syllabus/`**, domaine propre monté sous
   `/api/v0/syllabus` (aucun cycle avec `structure`, un préfixe par rôle
   d'écriture). Contrat : `GET /matiere/{id}` (CONSULTATION) renvoie la
   fiche ou, jamais écrite, une fiche vide `{matiere_id, version: 0}` en
   200 — la fiche « existe » toujours, pas d'acte de création ;
   `PUT /matiere/{id}` (SYLLABUS_ECRITURE) est un **upsert** sous verrou
   optimiste (409 `OPTIMISTIC_LOCKING_FAILURE` ; l'identifiant du chemin
   fait foi) ; `PUT /ue/{id}` écrit `description` et `responsable_id` sous
   verrou et renvoie l'UE complète (reposée sous la clé du repository UE) ;
   `GET/POST /bloc` (`?promotion_id=`), `GET/PUT/DELETE /bloc/{id}`,
   `POST /bloc/delete-impact`, idem `/competence` (`?bloc_id=`, ou
   `?promotion_id=` pour le référentiel à plat) ; `GET/PUT
   /ue/{id}/competences` ; **`GET /ue/{id}/fiche?lang=fr|en`** et
   **`GET /promotion/{id}/livret?lang=fr|en`** (CONSULTATION, PDF).
   Entité introuvable ou branche en corbeille : `NOT_FOUND` sur l'enveloppe
   400 du projet. Erreurs de champ : 400 `VALIDATION_ERROR`, motifs
   `valeur_negative`, `valeur_hors_plage`, `reference_inconnue`,
   `hors_promotion`, `valeur_deja_utilisee` (position prise).
6. **Front, `pages/syllabus/`** : pas de workflow propre, des greffes sous
   le workflow Structure (`catalog/routes.tsx`, `GreffeEcran`) — segment
   `syllabus` sous la matière et sous l'UE (`…/matiere/:id/syllabus`,
   `…/ue/:id/syllabus`, action déclarative `ACTION_SYLLABUS`, en fermeture),
   segments `bloc` et `competence` sous la promotion
   (`…/promotion/:promotionId/bloc`, `ACTION_REFERENTIEL` sur la ligne
   promotion à côté d'`ACTION_LIVRET`, dans `CrudPromotion` et
   `niveaux.ts` ; deux Crud imbriqués, actions créées au rendu). L'arbre ne
   change pas, `etatArbre` s'arrête au segment étranger. `FormulaireSyllabus.tsx` : cadre 1-1 qui reste sur
   place après enregistrement (`Form.tsx` renvoie vers une liste que la
   fiche n'a pas), avec un emplacement `actions` à droite du titre (le
   bouton de la fiche PDF). La matrice (`MatriceCompetences.tsx`) a son
   **bouton d'enregistrement propre** mais une **garde de saisie unique**
   (react-router ne tient qu'un `useBlocker` par routeur : elle remonte son
   état modifié par `modificationsExternes`). Écriture par `possedeRole`,
   lecture seule sinon. `matiere.heure` vient de la liste des matières de
   l'UE sous la clé du repository (`select`) — aucune requête ajoutée ; la
   seule requête ajoutée est le détail du responsable (clé `[USER, id]`).
   `UserSelector` généralisé (`name`, `champsNom`, `libelles`, `filtrer`
   optionnels ; filtre AGENT côté client sur les 20 résultats du serveur).
   Namespace `syllabus.json` fr/en.
7. **Import du legacy** : outil d'exploitation `back/cmd/syllabus-import`
   (`make importer-syllabus`, mode d'emploi `docs/syllabus-import.md`,
   paquet `pkg/syllabus/legacy`). CLI, pas d'écran ; appariement **par nom**
   dans le périmètre d'une correspondance de période (année, période,
   préfixe du code d'UE → formation, promotion, option, période) ; le bloc
   par (bloc tiers, promotion de l'UE) — gabarit à colonne
   `promotion_name_scolarite`, une ligne par promotion pour un bloc du
   tiers utilisé par plusieurs, unicité par couple ; un bloc mappé pour
   d'autres promotions seulement rejette la matrice (« bloc d'une autre
   promotion que l'UE », promotions mappées à l'appui), un bloc sans ligne
   remplie reste hors périmètre —, l'UE par
   exception puis code puis libellé unique, la matière par exception puis
   libellé unique, **égalité après normalisation** (espaces réduits, casse
   ignorée), jamais de rapprochement flou ; non apparié ou ambigu → rejet,
   jamais de création. **Refus d'écraser** (existant et différent = conflit
   rapporté, `--force` remplace ; identique = inchangé) ; simulation par
   défaut, `--apply` écrit ; chaque fiche, description et matrice est une
   écriture indépendante par les requêtes du domaine ; rapport texte
   horodaté à côté de l'entrée. Fixture réduite et anonymisée committée
   dans `pkg/syllabus/legacy/testdata/` ; l'export réel déposé dans
   `testdata/` à la racine est ignoré par git (ce dossier seulement).
8. **Fiche et livret PDF** (`fiche.go`, `fiche_gabarit.go`,
   `fiche_gabarit.html` embarqué ; `docs/syllabus.md`). Cible visuelle
   contractuelle : `docs/syllabus/fiche-maquette.html` (lot 0, intouchée).
   Page de l'UE (bandeau, chiffres clés, « Pourquoi cette UE ? », éléments
   constitutifs, matrice) puis une page par matière. **Décisions du lot 5,
   toutes tranchées par l'utilisateur** : (1) **Gotenberg** en service
   conteneurisé (voir « Stack ») et client mutualisé dans
   `services/pdf.go` — les bulletins de jury s'en serviront ; (2) fiche
   **bilingue par ses libellés seulement** (deux jeux Go, `libellesFr` /
   `libellesEn`), le contenu saisi rendu tel quel, `?lang=` validé, défaut
   fr, langue dans le nom de fichier ; (3) la fiche d'une UE **et** le
   livret d'une promotion (page de titre avec sommaire, puis les fiches
   dans l'ordre options par nom → périodes par date de début → UE par
   identifiant, c'est-à-dire l'ordre de saisie : aucune colonne d'ordre
   n'existe) ; (4) une UE sans liaison affiche « Aucune compétence n'est
   encore déclarée pour cette UE. », et par le même principe une matière
   sans fiche « Aucune fiche syllabus n'est encore rédigée pour cet
   enseignement. » — jamais d'absence silencieuse sur un document qui
   circule ; (5) assertions sur le HTML du gabarit (tests Go sans base ni
   service), PDF smoke-testé en intégration contre le service réel
   (`%PDF`, taille plancher, type), pas de golden-file binaire, specs e2e
   sur l'événement de téléchargement seul (`fiche-pdf.spec.ts`).
   Rendu : la structure fait référence (heures des éléments constitutifs
   et volume encadré = somme des `matiere.heure` ; travail personnel =
   somme des `heures_perso`, 0 par défaut) ; rien de vide ne s'imprime ;
   blocs mobilisés rendus entiers, pastilles sur trois colonnes, codes
   dérivés, les autres blocs en une phrase ; responsable non rendu ; nom
   d'établissement dans `pdf.etablissement` du `config.yaml` (la seule
   chaîne propre à l'établissement, un endroit). Les rubriques (textarea)
   se découpent en paragraphes (ligne vide) et listes (lignes à tiret ou
   puce — 762 plans de cours sur 1 798 dans l'export). Le pied de page est
   **hors du flux** (`position: absolute`) et les marges de section sont
   resserrées d'un cran par rapport à la maquette : une page pleine à une
   ligne près basculait sinon sur une page presque vide. **Limite
   constatée** : « une matière = une page » tient tant que le contenu
   tient ; au-delà, la suite coule sur la page suivante, pied compris, et
   la numérotation « page n/N » reste logique, pas physique — sur le
   livret INFRES de démonstration (8 UE, 20 matières, 29 pages logiques),
   7 matières aux rubriques longues font 36 pages physiques. Volumes
   mesurés le 15 septembre 2026 : fiche de 4 pages ≈ 65 ko en 150 ms
   côté serveur (230 ms au clic), livret de 36 pages ≈ 266 ko en 280 ms
   (480 ms au clic) ; le délai client de 25 s laisse deux ordres de
   grandeur. Nom de fichier : `syllabus-ue-<slug>-<lang>.pdf`,
   `syllabus-livret-<slug>-<lang>.pdf` (ASCII, tirets). À l'écran :
   bouton « Télécharger la fiche PDF » à droite du titre de l'écran
   syllabus de l'UE ; action « Télécharger le livret PDF »
   (`ACTION_LIVRET`, un `ActionRappel`, libellé en fermeture) dans le menu
   du bandeau du nœud promotion (`arbre/niveaux.ts`, comme
   `ACTION_SYLLABUS`) et parmi les actions par défaut de `CrudPromotion`,
   créées au rendu — elle apparaît donc aussi sur la liste des promotions
   de tout workflow qui ne surcharge pas `actionsLigne` (Structure, Notes,
   Jury, Programme ; Certification les surcharge). Sous CONSULTATION le
   bandeau n'a que l'action directe et ce menu : sans la déclaration dans
   `niveaux.ts`, le livret y était invisible (constaté par la spec).
   Visibles en CONSULTATION : des lectures. Une réponse `blob` relit son
   enveloppe d'erreur par `erreurDeTelechargement` (`telechargement.ts`),
   sinon un 503 s'afficherait en message générique.

### Compétences par promotion et création par gabarit (16 septembre 2026)

Lot `competences-promotion`, deux changements tranchés par l'utilisateur :

- **Le référentiel est rattaché à la promotion** (voir point 3). Le
  changeset 003 de `007-syllabus` a été réécrit en place (aucun déploiement
  n'existait) : `promotion_id`, `fk_bloc_competence_promotion`,
  `idx_bloc_competence_promotion`, `uk_bloc_competence_ordre (promotion_id,
  ordre)`. Le motif de périmètre de la matrice est **`hors_promotion`** ;
  `hors_formation` subsiste avec un autre sens (ci-dessous).
- **La promotion précédente sert de gabarit à la suivante.** Le formulaire de
  création de promotion porte un sélecteur optionnel « Créer à partir de la
  promotion » (`ChampSelection`, options lues sous la clé du repository des
  promotions de la formation — aucune requête ajoutée ; rendu en création
  seule grâce à la prop optionnelle **`mode`** ajoutée à `RenderProps`, la
  seule adaptation du socle Crud). Le corps du POST porte
  `source_promotion_id` (`CreationPromotion` côté Go, `PromotionActive`
  embarquée) ; le serveur (`structure/promotion/copie.go`, requêtes
  `promotion_copie.sql`) vérifie la source **avant toute écriture** — active,
  et de la même formation : `reference_inconnue` (inconnue ou en corbeille),
  **`hors_formation`** (autre formation ; la copie entre formations n'existe
  pas) sur le champ `source_promotion_id` — puis crée la promotion et copie
  dans **une seule transaction**, ligne à ligne par `INSERT … SELECT … WHERE
  id = @source RETURNING id` (colonnes listées une fois en SQL, re-mappage
  des identifiants en Go, référentiel d'abord parce que les liaisons en ont
  besoin, lectures par les vues actives). Sans source : promotion vide, comme
  avant.
- **Périmètre exact de la copie, tranché** : `option` (nom) ; `periode`
  (nom, **dates telles quelles** — à corriger à l'écran, un décalage
  automatique serait faux une année sur deux) ; `unite_enseignement` (nom,
  ECTS, académique, **description et responsable**) ; `matiere` (nom, heure,
  coeff, couleur) ; `syllabus_matiere` (huit rubriques, huit heures,
  **responsable**, version remise à 1) ; `bloc_competence`, `competence`
  (tout, ordres compris) ; `ue_competence` (les trois axes, re-mappés).
  **Jamais** : groupes, contrôles, notes, jurys, réservations,
  certifications — tout ce qui appartient aux élèves ou à l'année. Le
  responsable est copié (décision 4 : l'enseignant reconduit est le cas
  majoritaire, la colonne reste en `SET NULL`).
- **Rôle : l'opération entière sous STRUCTURE_ECRITURE**, exception assumée
  au rôle SYLLABUS_ECRITURE (décision 5) : l'acte est « créer une
  promotion », le contenu syllabus copié a déjà été rédigé sur le gabarit par
  un porteur du rôle ; scinder en deux gestes sous deux rôles laisserait un
  état intermédiaire (structure sans référentiel) que rien ne signalerait.
- **Ce que la copie n'est pas** : un lien vivant. Aucune synchronisation
  entre promotions ; modifier l'une ne touche pas l'autre (prouvé par le
  test d'intégration `copie_integration_test.go`, photo table à table de la
  source avant et après).

**Périmètre négatif, contraignant** : pas de registre (l'invariant 5 couvre
notes et jurys, les écritures syllabus n'ancrent rien) ; pas de corbeille
(`syllabus_matiere` suit `matiere` par cascade, le référentiel suit sa
formation) ; pas de versionnement annuel ; pas d'éditeur riche (des
`textarea`) ; aucune langue au-delà de fr/en ; les tables `utilisateur`,
`role`, `session_config` et le schéma `syllabus2` de la base tierce ne
sont jamais repris ; les dimensions ODD/ONU sont abandonnées (la rubrique
socio-environnementale porte l'intention rédigée) ; pas de niveau
`groupematiereenseignee` (un ordre d'affichage serait une colonne `ordre`
sur `matiere`, domaine STRUCTURE). UE et matière s'identifient par leur
`name` : les codes que la maquette montre (`INFRES_9_3_DL`, `DL-1`) n'ont
pas de colonne et n'en auront pas.

**Seed e2e du domaine** : `E2E Agent1` (AGENT), fiche de « E2E Matiere » à
15 + 4 + 1 = 20 h (conforme), description de « E2E UE1 », blocs « E2E Bloc
Securiser » (C1, C2) et « E2E Bloc Concevoir » (C1) sur « E2E Promotion »,
« E2E Promo Autre » (autre promotion de « E2E Formation », sans descendance,
un bloc, une compétence — le cas fort ; pas « E2E Promotion Autre », dont
« E2E Promotion » serait le préfixe ; pas « E2E Promo Vide », qui doit rester
sans aucune donnée liée pour le dialogue de suppression avec saisie),
« E2E Autre Formation » conservée sans bloc (capture `formation-liste`),
liaison pré-cochée C1 enseignée + évaluée sur « E2E UE1 ». Specs :
`syllabus.spec.ts` (sept tests, ordre intra-fichier documenté),
`referentiel-competences.spec.ts`, `matrice-competences.spec.ts`,
`fiche-pdf.spec.ts` (trois tests), `promotion-gabarit.spec.ts` (avec et sans
gabarit, CONSULTATION ; chaque test crée sa promotion puis la met en
corbeille) ; captures `syllabus-matiere-*` et `syllabus-ue-*`. Tests Go :
cinq d'intégration sur fiche et UE, quatre sur référentiel et matrice, un
sur la création par gabarit (copie table à table, indépendance, refus,
promotion vide), trois sur l'import, quatre sur les documents PDF (dont le
503 sur un port fermé et le NOT_FOUND d'une période en corbeille), plus le
gabarit et le client PDF en unitaire.

**Évolutions possibles, hors chantier** (aucune n'est engagée) : livret par
période ; cloisonnement fin du rôle d'écriture ; responsable sur la fiche
(la colonne existe) ; numérotation physique des pages du livret (en-tête ou
pied Gotenberg, globaux au document) ; colonne `ordre` sur `matiere` ; copie
entre formations différentes ; synchronisation entre promotions (la copie
est un acte de création, pas un lien vivant).

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
  champ de `value` (`inputValue` non contrôlé) — lot 14. Depuis le lot 2
  syllabus il prend `name`, `champsNom`, `libelles` et `filtrer`, tous
  optionnels aux défauts historiques (`user_id`, `firstName`/`lastName`,
  libellés élève, aucun filtre) : un formulaire dont l'API ne livre que
  l'identifiant fournit lui-même les deux champs de nom, résolus par la
  requête de détail utilisateur avant le montage du formulaire. Deux états locaux
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
- **Le nom accessible d'un bouton d'axe des notes est contextuel**
  (`BarreAxes.tsx`, 5 septembre 2026) : un axe dont l'identifiant manque à
  l'URL — celui qui dépose sur une liste intermédiaire — porte le suffixe
  `barreAxes.axeIndirect` de `note.json` (« Matière… » depuis l'axe UE,
  « Matière » depuis l'axe Contrôle), résolu par `axeDirect`, le premier des
  deux cas de `cheminVersAxe`. Ni couleur ni état désactivé : ces axes
  fonctionnent, ils demandent un choix de plus. Une spec ne cible jamais le
  libellé en clair : `boutonAxe`/`cliquerAxe` de `hierarchieE2E.ts` prennent
  la clé de l'axe (`'ue'`, `'matiere'`…) et admettent les deux noms, entiers ;
  `nomAxeDirect`/`nomAxeIndirect` servent à affirmer le suffixe lui-même.
  Le suffixe ne vient jamais d'une concaténation : la typographie des points
  diffère d'une langue à l'autre. Une seule limite, mesurée au navigateur :
  la barre (`flex-wrap`) garde ses 44,8 px à 448 px CSS de large en
  français quelle que soit la position, mais en anglais, à cette largeur,
  la position Période (cinq libellés, quatre suffixes, 402 px) passe sous le
  libellé « View » quand la position Contrôle (363 px) reste sur sa ligne —
  la hauteur y dépend donc de l'axe. Sous toute largeur d'usage de
  l'application ; pas de réservation de largeur pour l'absorber.
- **Un `SidebarGroupLabel` fait déclencheur reste un bouton fantôme en mode
  icône** (`layouts/dashboard.tsx`, `GroupeMenu`, 14 septembre 2026). shadcn
  masque l'intitulé de groupe par `-mt-8 opacity-0` : invisible, mais un
  bouton de 32 px remonté de 32 px, posé sur l'entrée qui le précède — un
  clic sur « Scolarité » repliait « Admin », dont les icônes disparaissaient
  sans rien pour les ramener. Le déclencheur est réellement masqué en mode
  icône (`group-data-[collapsible=icon]:hidden`) et le groupe y est tenu
  ouvert (`useSidebar`, exporté par `components/ui/sidebar-context`, pas par
  `sidebar`) ; l'état choisi en mode large revient au retour. Playwright
  tient un élément à `opacity: 0` pour visible : `menu-lateral.spec.ts`
  affirme `toBeHidden()` sur le déclencheur, ce qui ne passe qu'avec
  `hidden`. Le rail et le bouton d'en-tête portent le même nom accessible :
  une spec vise le bouton dans `main`.
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
- **La page de connexion Keycloak suit les préférences de l'application
  par `localStorage`, une clé par préférence, et le thème ne résout rien**
  (`infra/keycloak/themes/scolarite/login/resources/js/`, 5 septembre
  2026). Possible parce que Keycloak est servi sous l'origine du front en
  `/auth` dans les deux modes ; servi ailleurs, les scripts se tairaient.
  `mode-couleur.js` relit `mode-couleur` (invariant 12) ; `langue.js` relit
  et écrit `i18nextLng`, la clé du détecteur i18next du front — aucune
  seconde variable, aucun `ui_locales`, aucune lecture du jeton. La langue
  étant rendue côté serveur, le script fait rerendre la page par
  `kc_locale` — **honoré uniquement sur les URL `login-actions/…`** (celles
  du sélecteur de langue de la page, avec `tab_id`/`execution`), **ignoré
  sur le point d'entrée `/protocol/openid-connect/auth`** où la page
  s'affiche d'abord (constaté sur Keycloak 26.7.1) : le script suit le
  lien du sélecteur, jamais une URL fabriquée, et attend que le sélecteur
  soit analysé. Ordre des règles gelé : `kc_locale` dans l'URL → écrire le
  magasin et s'arrêter ; sinon magasin connu ≠ `<html lang>` → un seul
  rechargement. C'est cet ordre qui interdit toute boucle. Les libellés du
  sélecteur sont dans la langue rendue (« Français » / « French
  (Français) ») : une spec le cible par le paramètre de l'option
  (`langue-login.spec.ts`). Keycloak mémorise de son côté la langue
  demandée à la connexion dans l'attribut `locale` du compte et la repose
  en cookie à chaque connexion suivante : la page peut donc déjà être dans
  la bonne langue sans rechargement — une spec affirme la langue rendue et
  « au plus un rechargement », jamais « exactement un ». Limite assumée,
  comme pour le mode couleur : la préférence est par navigateur, pas par
  compte. Une spec qui se connecte elle-même le fait dans un **contexte
  neuf** (`locale: 'fr'` nu, voir « Défauts constatés ») : une déconnexion
  depuis un contexte monté sur `e2e/.auth/` clôturerait la session que
  toute la suite partage.
- Un popup Base UI peut planter **au montage du popup**, donc rester
  invisible de tout test qui ne l'ouvre pas et de toute capture fermée —
  précédent : `Menu.GroupLabel` hors `Menu.Group` faisait tomber tout
  l'écran à l'ouverture du menu de compte, avec 45 tests verts (lot 3 §5).
  Tout nouveau menu/dialogue shadcn se vérifie ouvert, au navigateur ;
  aucun test e2e n'ouvre le menu de compte à ce jour.
- **Graphiques recharts : les couleurs sont des références `var(--chart-N)`
  en props, jamais des valeurs résolues** (lot chart-shadcn,
  `docs/chart-shadcn.md`). recharts recopie `stroke`/`fill` en attributs
  SVG, que la cascade résout sur `.dark` — modale ouverte comprise. Ne pas
  réintroduire une lecture par `getComputedStyle` ni un observateur de la
  classe de `<html>` (le mécanisme du lot 4bis, retiré). `components/ui/chart.tsx`
  entre sans `ChartStyle` ni `config.color`/`theme` : le registre shadcn y
  injecte un `<style>` à l'exécution, ce que l'invariant 11 interdit —
  arbitré le 4 septembre 2026 : le fichier amputé fait foi, l'invariant
  n'est pas amendé, et **toute mise à jour du composant depuis le registre
  ré-applique les adaptations listées en tête de `chart.tsx`**
  (`docs/chart-shadcn.md` §2). Piège du conteneur :
  ses règles de classe (`[&_.recharts-…]`) **priment sur les attributs**
  recharts — le curseur d'un `BarChart` virerait en `fill-muted` malgré son
  `cursor={{ fill }}` ; `NoteChartModal` le rétablit par une classe
  `fill-chart-1` sur le conteneur. `--chart-4` et `--chart-5` n'ont aucun
  consommateur (trois séries seulement) ; laissés au système de design.
- **Icônes : lucide-react partout dans `src/`, et la taille dépend du
  porteur** (lot 6, `docs/migration-shadcn/06-icones.md` §2). Dans un
  composant shadcn (`Button`, `DropdownMenuItem`, `Alert`, sidebar), l'icône
  se pose **nue** : le CSS `[&_svg:not([class*='size-'])]:size-4` du
  composant gouverne (16 px). Ne pas « corriger » une icône nue dans un
  bouton shadcn en lui posant une taille : elle créerait un écart avec
  toutes les autres. Hors composant shadcn (un `span` nu), la taille se
  pose en attribut (`size={20}` pour l'ancien « small » MUI).

## Dette et chantiers connus

- **Typographie : une décision de design, pas de migration.** Le corps de
  page garde la pile Roboto et l'interlettrage `body1` de MUI (`index.css`,
  `@theme` et couche `base`) ; passer à une typographie shadcn (Geist, sans
  interlettrage) régénérerait toutes les captures.
- **Versions épinglées à réévaluer** — la migration est terminée, la
  promesse « zéro montée parasite » peut être levée. `react-day-picker` est
  épinglé **9.14.0** (la v10 est sortie pendant le lot 12, API non
  éprouvée) et `@tanstack/react-table` en **8.20.6 exact** (le caret
  résolvait en 8.21.3, réépinglé au lot 7). À rouvrir dans un lot de mise à
  jour dédié, avec `npm audit`.
- **Intégration continue : réduite, pas fermée** (lot CI, `docs/ci.md`).
  Couvert sur chaque push et pull request : lint + build du front, versions
  épinglées vérifiées, généré sqlc à jour, build + tests Go (hors
  intégration : ils se sautent sans base), et la suite e2e complète (91
  tests, les 24 captures de référence comprises, dans le conteneur de
  référence) contre la stack complète. **Non couvert** : les tests Go
  d'intégration (`t.Skip` sans PostgreSQL,
  Keycloak, Mailpit — la stack du job e2e existe pourtant, à réutiliser) ;
  `govulncheck`, `npm audit --omit=dev`, Dependabot, protection de branche.
  `programme-import/pkg/extraction` échoue sur fixture absente : rejoué en
  étape non bloquante, annotation d'avertissement à chaque run.
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
- **Un navigateur qui n'annonce que `fr-FR` fait démarrer l'application en
  anglais** (5 septembre 2026, constaté dans le conteneur de référence
  avec `locale: 'fr-FR'`) : `fr-FR` n'est pas dans `supportedLngs`, et le
  détecteur i18next retombe sur le `lang="en"` de `front/index.html`
  (source `htmlTag`) avant d'essayer la langue seule. Les navigateurs
  réels envoient `fr-FR,fr` et n'y tombent pas ; à corriger côté
  `i18n/config.ts` ou `index.html` dans un lot front.
- **Les actions de ligne créées au chargement des `routes.tsx` sans `t`
  gardent la langue de démarrage** (14 septembre 2026, lot 2 syllabus,
  constaté au navigateur) : `catalog/routes.tsx` appelle `ACTION_GROUPES()`
  et `ACTION_PERIODES()`, `note/routes.tsx` `ACTION_UES()` et
  `ACTION_MATIERES()` — or ces fabriques de `structure/entites/` renvoient
  un `libelle` **chaîne** (résolue à l'appel), pas une fermeture. Preuve :
  interface basculée en anglais, le menu de la ligne « E2E Option » du
  catalogue affiche « Gérer les groupes » et « Gérer les périodes ». Le lot 2
  a évité d'étendre le défaut à l'UE (ses actions par défaut restent
  créées au rendu dans `CrudUe`, avec `t`) ; `ACTION_SYLLABUS` est une
  fermeture. Correction attendue : `libelle: () => …` dans les fabriques
  `ACTION_*` de `structure/entites/`, comme `actionProgramme`.
- **Les analyses d'impact de structure ne comptent pas `syllabus_matiere`**
  (15 septembre 2026, lot 3 syllabus, constaté à la lecture :
  `grep syllabus_matiere back/pkg/structure` est vide). Supprimer une
  formation, une promotion, une option ou une période qui porte des fiches
  syllabus ne l'annonce pas dans la modale ; la cascade, elle, les emporte.
  Reliquat du lot 1. Le lot 3 a fait l'inverse pour son référentiel
  (`FormationDeleteImpact` compte blocs, compétences et liaisons) ; les
  fiches restent à ajouter aux quatre requêtes `*DeleteImpact`.
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
Le quatrième — les libellés et annonces des axes de notes en français en
dur (`axes.ts`, lot 16) — est **fermé** le 5 septembre 2026 : fermetures
`() => traduire(...)` sur `note.json` (bloc `axes`), vérifié au navigateur
dans les deux langues, bascule en place comprise.

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