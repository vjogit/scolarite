# CLAUDE.md — projet scolarite

Gestion de scolarité (formations → promotions → options → périodes → UE →
matières → contrôles ; notes, jurys, certifications, planning, salles).
Application réservée au personnel administratif. Pas encore en production.

## Stack

- **Back** : Go (chi, pgx, sqlc), PostgreSQL, migrations Liquibase
  (`infra/liquibase/releases/`), Keycloak (Terraform `infra/keycloak/`),
  Docker Compose + nginx (`infra/run/`), Mailpit en local.
- **Front** : React 19, TypeScript durci (`noUncheckedIndexedAccess`, zéro
  `any`), MUI v7 + material-react-table + x-tree-view + x-date-pickers,
  Toolpad (**en sortie** : non maintenu, épingle MUI v7 — ne pas étendre son
  usage), TanStack Query, react-router 7 (`createBrowserRouter`),
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

## Conventions

- **Français accentué partout**, via i18next — jamais de chaîne d'interface
  en dur. Genre/élision : `entityMessages.ts`. Version anglaise entretenue
  en miroir.
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

- **`make -f makefile.local test-ihm`** : pose le seed idempotent
  (`front/e2e/setup/seed.sql` — hiérarchie canonique : période complète,
  rattrapage validé, note non évaluée, groupe avec élèves, option
  sacrificielle pour la corbeille), puis lance la suite. La stack doit déjà
  tourner (`start-local-keep`) : `verifierStack.ts` échoue immédiatement
  sinon.
- Trois comptes provisionnés par le seed Terraform local (mêmes variables
  `KC_*` que le bootstrap) : ADMIN / CONSULTATION / NOTES_ECRITURE ;
  `storageState` par rôle capturé en setup (`fixtures/roles.ts`), **langue
  épinglée `fr`** avant capture (`i18nextLng`) — le détecteur de langue
  rendrait la suite dépendante du navigateur sinon.
- Règles d'écriture des specs : ciblage par rôle et nom accessible, **les
  libellés s'importent des JSON `locales/`** (jamais recopiés) ; aucun
  `waitForTimeout` ; absence affirmée explicitement ; tests indépendants de
  l'ordre ; `workers: 1` (base partagée) ; `BASE_URL` par variable
  d'environnement ; artefacts gitignorés.
- **Critère permanent : deux exécutions consécutives vertes.** Toute
  modification d'interface se conclut par `make test-ihm` ; un scénario
  nouveau validé au navigateur a vocation à rejoindre la suite.

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

- `isDirty` de react-hook-form se parasite avec les `DatePicker`/dayjs —
  normaliser les valeurs par défaut (précédent traité dans `Form.tsx`).
- Le nom accessible d'un `IconButton` peut venir du `Tooltip`, mais
  l'`aria-label` explicite est la convention.
- `chainons.ts` modélise la chaîne entité/identifiant des URL : toute
  nouvelle représentation d'URL s'y greffe, on n'écrit pas de parallèle.
- L'état de table est persisté par parent (`usePersistentTableState`) ; ne
  pas y introduire de logique supposant « toutes les lignes chargées »
  (pagination serveur possible plus tard).
- Le hash canonique du registre dépend d'une troncature à la microseconde :
  reprendre les tests de stabilité existants pour toute évolution.
- Le seed e2e est **idempotent par pose, pas par cumul** : toute donnée
  ajoutée au seed doit survivre à deux exécutions consécutives.

## Dette et chantiers connus

- **Sortie de Toolpad** (surface : `App.tsx`, `layouts/dashboard.tsx`,
  `notify.ts`) puis montée MUI v9 — MUI déconseille officiellement Toolpad ;
  absorbée par une éventuelle migration d'UI si elle est décidée.
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