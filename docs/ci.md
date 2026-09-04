# Intégration continue — donner une exécution automatique au filet

But de ce lot : que le filet construit pendant la migration shadcn (63 tests
Playwright, 20 captures de référence, lint, build, tests Go) s'exécute sans
que personne ne lance `make test-ihm`. `.github/workflows/` n'existait pas ;
le bilan du lot 17 (`docs/migration-shadcn/17-depose-mui.md` §12) nommait
cette absence comme le dernier risque de la migration.

**Pourquoi ce document est ici et non dans `docs/migration-shadcn/`.** La CI
n'est pas une étape de la migration : elle survit à la migration, couvre le
back autant que le front, et sera reprise par des lots qui n'auront rien à
voir avec shadcn (tests d'intégration Go, audit de dépendances). Elle
appartient à la même famille que `docs/deployements.md` — de
l'infrastructure de projet, à lire et relire hors de toute chronologie. La
série `migration-shadcn/` se ferme donc au lot 17 ; son §12 renvoie ici. Le
format, lui, est celui des lots : constaté vs déduit, ce qui est couvert et
surtout ce qui ne l'est pas, tableau des exécutions, ce qui n'a pas été
traité.

Périmètre : `.github/workflows/` et le strict minimum ailleurs. **Aucun
test, aucun composant, aucune migration Liquibase modifiés.** Branche `ci`,
créée depuis `main` (la branche `shadcn` y est fusionnée depuis aa2c335 ;
travailler sur `shadcn` aurait rouvert une branche close).

## 1. Constaté avant toute écriture (vs déduit)

- **Un clone neuf ne compile pas.** Vérifié par un `git clone` du dépôt
  local puis `go build ./...` : dix-sept paquets `gen/` manquants. Le code
  généré par sqlc est ignoré par git (`.gitignore` : `**/gen/`), là où
  CLAUDE.md affirmait « committer le généré ». `sqlc generate` depuis
  `back/schema.sql` (versionné, identique à la sortie de `pg_dump` du poste)
  reproduit le généré **à l'identique** : `diff -r` des deux arborescences
  `back/pkg` vide. La CI régénère ; la contradiction CLAUDE.md ↔ `.gitignore`
  est signalée, pas tranchée (§9).
- **Un second fichier manquait au clone** : `back/pkg/resultat/jury/
  template_bulletin.docx`, embarqué par `go:embed`, ignoré par `**/*.docx`.
  `Template_note.xlsx`, dans la même situation (`**/*.xlsx`), était lui
  versionné par un ajout forcé. Le gabarit ne contient que des champs de
  fusion (`${ENTETE_LIGNE_1}`, `${NOM}`, `${GPA}`…), aucune donnée
  nominative — vérifié en lisant `word/document.xml`. Il entre au dépôt par
  une exception explicite de `.gitignore` (les deux gabarits y sont désormais
  listés), pas par un `git add -f` que personne ne retrouverait.
- **Un troisième fichier ignoré est une fixture de test** :
  `back/pkg/structure/exchange/testdata/programme.xlsx` (360 Ko, un programme
  d'école réel — intitulés d'UE et de matières). Le test qui le lit est un
  test d'intégration (`GetIntegrationDBPool`, `t.Skip` sans base) : il se
  saute en CI et **passe** — constaté au premier run, où l'étape non
  bloquante l'a signalé comme « défaut résorbé » ; il a été retiré de la
  liste des exceptions au second commit. Sur un poste avec base de test, ce
  test exige le fichier. Non ajouté au dépôt : c'est un document réel, la
  décision revient à l'utilisateur (§9).
- **`go test ./...` échoue sur `cmd/programme-import/pkg/extraction`**, comme
  annoncé : `test_salle.csv` et `test_prof.csv` absents, `log.Fatal` dans le
  test. Reproduit sur le poste (`FAIL 0.003s`) et en CI.
- **`npm ci` n'a rien monté.** Lockfile v3, `react-day-picker` résolu en
  9.14.0 et `@tanstack/react-table` en 8.20.6 (relus dans
  `package-lock.json` avant d'écrire l'assertion) ; en CI, l'étape « Versions
  épinglées — aucune montée » lit les deux `package.json` installés et
  confirme, puis `git diff --exit-code package-lock.json`.
- **Lint et build du front : 27 s et 13 s sur le poste**, zéro erreur. Build
  Go : vert ; `go test` vert hors programme-import.
- **`secrets.env.example` contient dix noms et aucune valeur.** Les valeurs
  du poste (`secrets-local.env`) sont des mots de passe de bases et de
  comptes Keycloak locaux ; celui du compte `foo` est même documenté en
  clair dans `docs/deployements.md`. Aucune n'a de valeur hors du poste —
  mais la CI n'en a besoin d'aucune non plus (§3).
- **`config-local.env` porte deux chemins du poste** (`/home/vjo/.scolarite/…`
  pour `SCOLARITE_CONF_DIR` et `REGISTRE_TSA_CA_CERT`), et `KC_HOSTNAME`
  désigne le serveur Vite. Tout le reste (réseau Docker 10.20.2.0/24, IP
  statiques, comptes) est reproductible sur n'importe quel hôte Linux —
  l'exécuteur GitHub compris, où le bridge Docker est joignable depuis l'hôte.
- **`globalSetup.ts` et `env.ts` codaient les deux fichiers d'environnement
  en dur**, chacun de son côté, là où `makefile.local` les nomme par
  `CONFIG_FILE_LOCAL` / `SECRETS_FILE_LOCAL` et **exporte déjà toutes ses
  variables** (`export` sans argument) vers la recette de `test-ihm`. La
  divergence du lot 5 se referme donc sans nouvelle variable : la suite lit
  celles du makefile, avec les fichiers du poste en repli.
- **`start-scolarite.sh` dérivait aussi les noms de fichiers** de son seul
  argument `<local|prod>` — troisième copie de la même convention.
- **`keycloak.tf` n'accepte que `local` ou `prod`** pour `environnement`
  (validation de `variables.tf`) : la CI est un espace de travail `local`
  sur une autre machine, pas un troisième environnement — ce qui est aussi
  ce que `start-scolarite.sh local` (cible Docker avec Delve, mode Vite
  `conteneurs`, CA mkcert) reproduit.
- **Les captures de référence portent le suffixe `-chromium-linux.png`** et
  le poste n'a pas Roboto (`fc-list` vide) : elles ont été rendues avec la
  police de repli du poste. Déduit, puis mesuré (§5).
- **Le dépôt est public** (`vjogit/scolarite`, Actions activées, aucun
  workflow ni run préalable) : minutes illimitées, exécuteurs standard.
- **Outils du poste** : Go 1.26.5 (go.mod 1.26.1), Node 24 (le Dockerfile
  construit avec node:22), sqlc v1.31.1 (snap — aveugle hors du projet, ce
  qui a coûté trois essais de clone), Terraform 1.14.2, Liquibase 5.0.1,
  mkcert 1.4.4 (paquet Ubuntu 24.04, disponible sur l'exécuteur).

## 2. Deux workflows, un par préoccupation

### `verification.yml` — sans infrastructure

Sur `push` et `pull_request`. Deux jobs indépendants, ~1 min chacun.

| Job | Étapes | Ce qui décide |
|---|---|---|
| Front — lint et build | Node 22, `npm ci`, versions épinglées, `npm run lint`, `npm run build` | tout |
| Back — build et tests Go | Go (go.mod), sqlc 1.31.1, `sqlc generate`, `go build ./...`, `go test` hors programme-import, puis programme-import seul | tout sauf la dernière étape |

**Le défaut `programme-import`, visible sans bloquer.** L'étape « Tests des
paquets en défaut connu » est `continue-on-error` : elle rejoue le paquet
écarté de l'étape décisive et pose une **annotation d'avertissement** sur la
page du run à chaque échec (« Défaut connu, non bloquant : … fixture absente
du dépôt »), plus une ligne dans le résumé. Le jour où il passe, elle pose
une annotation de **notification** demandant de retirer l'exception. Le job
reste vert, l'échec reste lisible en tête de run — ni ignoré, ni bloquant.
Constaté au premier run : une annotation warning pour programme-import, une
notice pour exchange (qui a donc quitté la liste).

### `e2e.yml` — la suite contre la stack complète

Sur `push`, `pull_request` et `workflow_dispatch` (entrée `captures`,
faux par défaut). Un job, un exécuteur `ubuntu-24.04`, 45 min de plafond.

1. Outils aux versions du poste : Go, Node 22, sqlc 1.31.1, Terraform 1.14.2
   **sans wrapper** (le wrapper de `setup-terraform` parasite
   `terraform output -raw`, que `deploy.sh` lit), mkcert par apt, Liquibase
   5.0.1 par l'archive GitHub. 11 s.
2. Certificat nginx par `mkcert` pour 10.20.2.5 — la même commande que
   `build-scolarite.sh`. La CA créée au passage est celle que
   `start-scolarite.sh` dépose pour le backend (vérification TLS de l'issuer
   intacte, jamais d'`InsecureSkipVerify`).
3. `secrets-ci.env` fabriqué depuis `secrets.env.example` (§3).
4. Garde : `config-ci.env` et `config-local.env` déclarent le même jeu de
   variables (`diff` des noms). Une variable ajoutée à l'un sans l'autre
   arrête le job avant la stack — sans cette garde, `envsubst` la
   remplacerait par une chaîne vide, en silence.
5. **`make CONFIG_FILE_LOCAL=infra/env/config-ci.env
   SECRETS_FILE_LOCAL=infra/env/secrets-ci.env start-local-reset`** — la
   chaîne du projet, pas une reconstitution : purge, PostgreSQL, Mailpit,
   Keycloak (attente de l'admin, `terraform apply` : 21 ressources),
   Liquibase, `gen_sql` (pg_dump + sqlc), build des images backend et nginx
   depuis le commit, lancement. 2 min 29 s au premier run.
6. L'application répond (boucle `curl` jusqu'au 200), puis **preuve du build
   testé** dans le résumé du run : commit, hash du script servi
   (`assets/index-DGmtiuXV.js` au premier run), date de construction des
   deux images. C'est la parade du lot 12 (le lot 11 avait validé deux runs
   contre un nginx vieux de trois heures) — ici l'exécuteur part vide, une
   image figée est impossible par construction, et le hash le montre.
7. `npm ci` + `npx playwright install --with-deps chromium` (25 s).
8. **`make … test-ihm PLAYWRIGHT_ARGS="--grep-invert captures"`** : la cible
   du makefile, comme sur le poste ; le motif est confronté au chemin du
   fichier et écarte exactement `captures.spec.ts` et
   `captures-ouvertes.spec.ts` (43 tests sur 63, vérifié par `--list`).
   `retries: 0` est celui de `playwright.config.ts`, la CI n'y touche pas.
9. Captures, seulement si `captures=true` au lancement manuel, jamais
   décisives (§5).
10. **À chaque run, réussi ou non** : journaux des cinq conteneurs
    (`docker logs`), `front/test-results/`, `front/playwright-report/` publiés
    en artefact (14 jours). Vérifié en téléchargeant l'artefact du premier
    run : les cinq journaux (backend 490 lignes en `debug`), le rapport HTML,
    et un `test-results/` contenant déjà le contexte du `test.fail` de
    `navigation.spec.ts` — l'échec attendu est archivé comme le serait un
    échec inattendu.

**Concurrence.** Un nouveau push sur une branche annule le run précédent de
cette branche (chaque run a son exécuteur et sa base : ce n'est pas la règle
« jamais deux suites en parallèle », qui vise une base partagée). Les
lancements manuels ont chacun leur groupe — la première version les mettait
dans le groupe de la branche, et le second lancement a annulé le premier en
quatre secondes (run 33871245144). Corrigé au second commit ; c'est ce qui
permet trois runs sur un même commit (§6).

## 3. Les secrets : aucun

`secrets-ci.env` n'est ni versionné (`.gitignore` : `secrets-*.env`) ni
stocké dans les secrets GitHub. Le job copie `secrets.env.example` et
remplit les sept valeurs que les préconditions Terraform et les scripts
exigent (`POSTGRES_PASSWORD`, `SCOLARITE_PASSWORD`, `KC_DB_PASSWORD`,
`KEYCLOAK_ADMIN_PASSWORD`, `KC_BOOTSTRAP_USER_PASSWORD`, les deux
`TEST_*_PASSWORD`) avec `openssl rand -hex 16` ; `KC_BACKEND_CLIENT_SECRET`
reste vide et `deploy.sh` l'écrit après l'apply, comme sur le poste ; les
deux mots de passe SMTP restent vides (Mailpit).

Pourquoi c'est plus honnête que des secrets GitHub : ces valeurs protègent
une base et un Keycloak qui vivent le temps du job sur un exécuteur sans
port ouvert, et qui disparaissent avec lui. Un secret GitHub aurait donné à
un mot de passe jetable l'apparence d'une valeur à protéger et à faire
tourner ; recopier les valeurs du poste en clair dans le workflow aurait
exposé pour rien des mots de passe qui, eux, ouvrent une machine réelle. Rien
du poste ne transite : la suite lit les valeurs dans le fichier fabriqué,
par `env.ts`, exactement comme elle lit `secrets-local.env` sur le poste.
Décision prise sans s'arrêter, parce que la condition d'arrêt (« les secrets
de test ont une valeur réelle ») ne s'est pas présentée : il n'y a pas de
secret de test en CI.

## 4. Keycloak : monté par la chaîne du projet, pas « en service Docker »

Keycloak en CI demande plus qu'un `services:` GitHub : le realm est appliqué
par Terraform (`deploy.sh`), le backend vérifie l'issuer TLS de nginx contre
une CA mkcert, et le tout suppose le réseau Docker à IP statiques. Ce
« plus » est intégralement porté par `make start-local-reset` — aucune
ligne propre à la CI ne monte Keycloak, ni ne configure un realm à la main.
La question posée (« si le monter proprement demande plus qu'un service
Docker, dis-le ») a donc reçu cette réponse : il demande la chaîne complète
du projet, qui tourne telle quelle sur l'exécuteur en 2 min 30. Le choix de
continuer plutôt que de s'arrêter tient à ce que rien n'a été inventé pour
la CI : le jour où `make start-local-reset` change, la CI suit ; le jour où
il casse, la CI casse au même endroit qu'un poste.

Le rebond Keycloak sur lien profond (`navigation.spec.ts`, `test.fail`) et
le rendu figé de `BarreAxes` ne se sont pas manifestés sur les runs de ce
lot (§6) ; ils restent ce qu'ils sont, non corrigés, avec leurs artefacts
publiés si un jour ils tombent.

## 5. Le sort des captures

**Décision : exclues de la suite bloquante, exécutables à la demande,
jamais régénérées depuis la CI.** Les références ont été rendues sur le
poste, avec sa police de repli (pas de Roboto installée) et son Chromium ;
l'exécuteur a d'autres polices et un autre Chromium. Plutôt que de le
déduire, le lot l'a mesuré : un lancement manuel avec `captures=true`
(run 33871340675) a rejoué les 20 captures contre leurs références, sans
en régénérer aucune.

**Mesuré : 20 échecs sur 20**, chacun à `ratio 0.01` (de 249 à 2 396 pixels
sur 1280×720), les 3 tests de connexion verts, 1,5 min. L'artefact
`e2e-5-tentative-1` (55 Mo : `*-expected.png`, `*-actual.png`,
`*-diff.png`, trace et contexte par capture) a été téléchargé et lu. Deux
causes, pas une :

- **le rendu** — sur `formation-liste-light-diff.png`, les pixels différents
  dessinent le contour de chaque glyphe et de chaque icône, rien d'autre :
  même mise en page, mêmes couleurs, même dimension ; c'est l'antialiasing
  et la police de repli, comme annoncé ;
- **l'état de la base du poste** — la référence `formation-liste-light.png`
  montre **deux** formations, « FIA » et « E2E Formation » ; l'exécuteur, qui
  ne connaît que le seed, n'en montre qu'une. « FIA » est la hiérarchie
  vérifiée à la main du poste, pas une donnée du seed. Les références ne
  figent donc pas seulement l'apparence : elles figent aussi ce que la base
  locale contenait le jour de leur capture, au-delà de `seed.sql`.

La seconde cause n'était ni annoncée ni déduite : elle sort de la mesure.
Elle change la marche à suivre pour rendre les captures portables (ci-
dessous) — régénérer dans le conteneur ne suffit pas, il faut régénérer
**contre une base réduite au seed** (`make start-local-reset` puis la suite),
sinon les nouvelles références embarqueront de nouveau l'état d'un poste.

Pourquoi pas l'autre option (générer et comparer dans le conteneur officiel
Playwright, régénérer une fois les 20 références depuis ce conteneur) : elle
change les 20 images d'un coup, et la consigne classe ce point parmi ceux
qui exigent une décision. Elle reste la voie — et elle est réversible en
quatre gestes : partir d'une base réduite au seed (`make
start-local-reset`, sans « FIA ») ; régénérer les références dans
`mcr.microsoft.com/playwright:v1.62.1-noble` (la version de
`@playwright/test` du lockfile) en local ; faire tourner la suite dans ce
même conteneur sur l'exécuteur (`docker run --network host` avec le socket
Docker monté pour `seed.sh`, ou un `container:` de job) ; et retirer
`--grep-invert captures` de `e2e.yml`. Tant que ce n'est pas fait,
l'invariant de CLAUDE.md tient : aucune référence ne se régénère depuis un
artefact de CI.

## 6. Tableau des exécutions

Deux commits sur la branche `ci` : 7a9c2f3 (le lot) et 84e3bc0 (concurrence
des lancements manuels, exception `exchange` retirée). Critère : trois
passages identiques de la suite e2e sur le même commit, sans modification.

| # | Run | Commit | Déclencheur | Stack | Suite fonctionnelle | Captures | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | 33870780834 | 7a9c2f3 | push | 2 min 29 s | ✅ 43 passed (1,7 min) | — | ✅ vert |
| — | 33871245144 | 7a9c2f3 | manuel | — | annulé après 4 s par le second lancement manuel (groupe de concurrence partagé, corrigé en 84e3bc0) | — | ⚠️ annulé |
| 2 | 33871321069 | 84e3bc0 | push | 2 min 29 s | ✅ 43 passed (2,0 min) | — | ✅ vert |
| 3 | 33871343683 | 84e3bc0 | manuel | 2 min 16 s | ✅ 43 passed (1,7 min) | — | ✅ vert |
| 4 | 33871340675 | 84e3bc0 | manuel, `captures=true` | 2 min 54 s | ✅ 43 passed (2,1 min) | ❌ 20 failed / 3 passed (§5), non bloquant | ✅ vert |

Trois runs identiques sur 84e3bc0 (runs 2, 3, 4 — le 4 ajoute les
captures, sans toucher à la suite fonctionnelle), quatre au total en
comptant le premier commit ; les runs 2 à 4 ont tourné **en parallèle**, sur
trois exécuteurs, sans se voir. Aucun des trois aléas connus (`BarreAxes`,
rebond Keycloak, `registre.spec.ts`) ne s'est manifesté sur ces quatre
passages ; `navigation.spec.ts` a son `test.fail` attendu, compté comme
passé, contexte archivé dans l'artefact. `Vérification` : vert sur les deux
commits (2 runs).

**Le test de l'artefact d'échec** n'a pas demandé d'échec fabriqué : le run
4 en a fourni un réel (les captures) — les 20 diffs, les 20 traces, les
journaux des conteneurs, le rapport HTML et, à côté, le rapport et les
résultats de la suite fonctionnelle mis de côté avant les captures
(`playwright-report-fonctionnel/`, `test-results-fonctionnel/`) sont dans
l'artefact, téléchargé par l'API et ouvert. Rien à annuler : aucun fichier
du dépôt n'a été touché pour l'obtenir.

## 7. Temps d'exécution

Sur un exécuteur `ubuntu-24.04` standard, mesuré sur les quatre runs :

| Étape | Durée |
|---|---|
| Outils (Go, Node, sqlc, Terraform, mkcert, Liquibase) | 25 à 30 s |
| `make start-local-reset` (purge, PostgreSQL, Mailpit, Keycloak + Terraform, Liquibase, sqlc, build des deux images, lancement) | 2 min 16 s à 2 min 54 s |
| Navigateur Playwright (`npm ci` + Chromium) | 22 à 31 s |
| Suite fonctionnelle, 43 tests | 1,7 à 2,1 min |
| Captures, 20 tests (à la demande) | 1,5 min |
| **Job e2e complet, sans captures** | **5 min 0 s à 5 min 46 s** |
| Job e2e avec captures | 7 min 45 s |
| `Vérification`, chaque job | ~1 min |

En local, la suite complète (63 tests) prend 2,9 min (mesuré au début de ce
lot, `make test-ihm`) ; la suite fonctionnelle seule y prendrait moins. La
CI n'est donc pas plus lente que le poste sur la suite elle-même — c'est la
stack (2 min 30) qui coûte, et elle se paie à chaque run parce que
l'exécuteur part vide, ce qui est précisément la garantie « contre le build
du commit ». Un cache des couches Docker (backend Go, `npm ci` du
Dockerfile) ramènerait la stack sous la minute ; non fait ici, à peser
contre la simplicité.

## 8. Ce que la CI couvre, et surtout ce qu'elle ne couvre pas

Couvert, sur chaque push et chaque pull request :

- lint et build du front (mode production), versions épinglées ;
- build Go complet (après `sqlc generate`) et tests Go **unitaires** ;
- les 43 tests fonctionnels de la suite Playwright contre la stack complète,
  bâtie depuis le commit, seed posé par `globalSetup.ts` ;
- les artefacts de diagnostic de chaque run e2e.

**Non couvert :**

- **Les 20 captures de référence.** Le filet visuel — celui qui a attrapé au
  lot 2bis ce que 31 tests de rôles ne voyaient pas — ne tourne que sur le
  poste (`make test-ihm` complet). Une régression d'apparence passe la CI.
- **Les tests Go d'intégration** (`pkg/resultat/note`, `jury`, `user`,
  `structure/exchange`, `registre` intégration…) : ils se sautent sans base,
  Keycloak et Mailpit. La stack du job e2e les rendrait possibles — c'est le
  prochain pas naturel, non fait ici (il faut la base `scolarite_tu` et
  `-p 1`, voir la mémoire du projet).
- **`programme-import/pkg/extraction`** : rejoué, jamais décisif.
- **`govulncheck`, `npm audit --omit=dev`, Dependabot, protection de
  branche** : listés dans la dette de CLAUDE.md, hors de ce lot.
- **Le build du front en mode `conteneurs`** n'est vérifié que par le job
  e2e (dans l'image nginx) ; `verification.yml` construit en `production`.
- **La production** : `makefile.prod`, `config-prod.env`, cible Docker
  `prod` — rien n'est construit ni testé sous cette forme.
- **Firefox, WebKit, mobile** : Chromium seul, comme la suite.

## 9. Ce qui n'a pas été traité, et ce qui est signalé

- **CLAUDE.md ↔ `.gitignore` sur `gen/`** : « committer le généré » était
  faux. Corrigé dans CLAUDE.md pour dire ce qui est ; la décision (versionner
  ou non) reste à prendre. En attendant, la CI régénère.
- **`testdata/programme.xlsx`** (test d'intégration `exchange`) : ignoré par
  git, réel, non ajouté. À ajouter (si le document peut l'être) ou à
  remplacer par une fixture synthétique — à décider avant d'ouvrir les tests
  d'intégration en CI.
- **`test_salle.csv` / `test_prof.csv`** (programme-import) : absents
  partout, défaut signalé depuis le lot 5, intact.
- **`makefile.prod`** n'a pas reçu le passage explicite de `CONFIG_FILE` /
  `SECRETS_FILE` à `start-scolarite.sh` : le script garde son repli par nom
  d'espace de travail, la prod fonctionne comme avant. À aligner le jour où
  `makefile.prod` est dissocié.
- **`Application version` vide dans les journaux du backend en CI** : la
  cible Docker `local` ne passe pas les `-ldflags` de version (seule `prod`
  le fait). Pré-existant, identique sur le poste.
- **Cache Docker entre runs** : aucun ; chaque run reconstruit les deux
  images (~1 min 30). C'est aussi ce qui garantit le build du commit.
- Défauts pré-existants intacts : `BarreAxes`, rebond Keycloak,
  `registre.spec.ts`, `UpdateToeic`, colonne « Rôles », message zod,
  `axes.ts` en français.
