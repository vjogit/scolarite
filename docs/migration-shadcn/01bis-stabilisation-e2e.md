# Étape 1bis — stabilisation de la suite e2e

But de ce lot : rendre la suite Playwright (`front/e2e/`) reproductible,
quel que soit son point d'entrée. Périmètre : `front/e2e/`,
`front/playwright.config.ts`, les makefiles. **Aucun fichier de
`front/src` touché** — ce lot corrige les tests, pas l'application.

## Contexte

L'étape 1 a mesuré huit exécutions de la suite sans jamais retomber deux
fois sur le même résultat : 27/4, 27/4, 29/2, 30/1, 27/4 (échecs variables),
puis 31/0 trois fois — dont deux résultats différents sur du code
strictement identique (voir `01-cohabitation.md` §7). Un « vert » ne
prouvait donc rien, ce qui invalide la suite comme filet de régression pour
le reste de la migration.

## Hypothèse de départ, et sa vérification

**Hypothèse** : `playwright.config.ts` déclare `globalSetup:
'./e2e/setup/verifierStack.ts'`, qui vérifie que la stack répond mais ne
sème rien. Seule la cible `test-ihm` de `makefile.local` posait le seed
(`seed.sh` puis `npx playwright test`) ; un `npx playwright test` lancé
directement enchaînait sur l'état laissé par l'exécution précédente. Or
plusieurs specs ont des dépendances d'état explicites — `grille-saisie.spec.ts`
en particulier : le test 1 sauvegarde des notes, le test 3 exige que le
champ de l'élève 4 soit `enabled` en entrée puis le désactive (case « non
évalué »), le test 4 suppose que les tests 1 et 3 ont tourné. Sans re-seed,
le second passage devrait échouer sur l'assertion `toBeEnabled()` du test 3
— exactement l'échec `grille-saisie.spec.ts:51` de la baseline.

**Vérifiée par l'expérience**, comme demandé, pas par le seul raisonnement :

| Exécution | Seed avant | Résultat | Échecs |
|---|---|---|---|
| 1 | Oui (fraîchement posé) | ✅ 31 passed / 0 failed | — |
| 2 | **Non** (aucun re-seed depuis l'exécution 1) | ❌ 27 passed / 4 failed | `corbeille.spec.ts:18`, `corbeille.spec.ts:45`, `grille-saisie.spec.ts:5`, `grille-saisie.spec.ts:51` |
| 3 | Oui (reseedé) | ✅ 31 passed / 0 failed | — |
| 4 | Oui (reseedé entre 3 et 4) | ✅ 31 passed / 0 failed | — |

L'exécution 2 reproduit **exactement** les quatre échecs de
`00-baseline.md` — même ensemble, mêmes noms. C'est la preuve que la
baseline de l'étape 0 avait elle-même été mesurée sans re-seed entre deux
passages : l'hypothèse est confirmée sans ambiguïté, et les exécutions 3-4
montrent qu'un seed avant chaque passage suffit à retrouver un résultat
stable. **Cause racine démontrée : l'absence de seed inconditionnel est la
source de l'irreproductibilité, pas un défaut de rendu ou une course
applicative.**

## Correction apportée, et pourquoi celle-là

Option 1 de la commande (rendre le semis automatique et inconditionnel au
`globalSetup`) — la cause racine, pas un contournement par test. Option 2
(rendre les tests indépendants de ce qu'un autre a laissé) n'a pas été
nécessaire : les cinq exécutions de vérification (§ suivante) sont toutes
vertes après la seule correction (1), donc aucune instabilité résiduelle à
traiter test par test.

### `front/e2e/setup/globalSetup.ts` (nouveau)

Remplace `verifierStack.ts` comme `globalSetup` de `playwright.config.ts`.
Compose les deux étapes désormais nécessaires, dans l'ordre :

```ts
export default async function globalSetup(): Promise<void> {
    await verifierStack();

    execFileSync(
        resolve(RACINE_DEPOT, 'front/e2e/setup/seed.sh'),
        [
            resolve(RACINE_DEPOT, 'infra/env/config-local.env'),
            resolve(RACINE_DEPOT, 'infra/env/secrets-local.env'),
        ],
        { stdio: 'inherit' },
    );
}
```

`verifierStack.ts` n'a pas été réécrit : `globalSetup.ts` l'importe et
l'appelle en premier, garde-fou inchangé (fail fast si la stack ne répond
pas, avant même de tenter le seed). La résolution de `infra/env/*.env`
depuis `front/e2e/setup/` réutilise le motif déjà en place dans
`e2e/setup/env.ts` (`fileURLToPath(import.meta.url)` + `resolve('../../..')`)
plutôt que d'en inventer un autre. Le seed lui-même reste `seed.sh` —
invoqué tel quel via `execFileSync`, pas réimplémenté en TypeScript : le
script bash existant (lecture des fichiers d'environnement, garde `docker
inspect`, `psql` idempotent) est la bonne unité de réutilisation, pas ses
détails d'implémentation.

Effet : `verifierStack()` puis `seed.sh` s'exécutent désormais avant
**toute** exécution de la suite — `make test-ihm` et `npx playwright test`
en direct passent par le même chemin, un seul point d'entrée réel.

### `front/playwright.config.ts`

`globalSetup: './e2e/setup/verifierStack.ts'` → `'./e2e/setup/globalSetup.ts'`.
Seul changement dans ce fichier.

### `makefile.local` — cible `test-ihm` simplifiée

`globalSetup.ts` posant désormais le seed sans condition, l'appel explicite
à `seed.sh` dans la cible `test-ihm` devenait redondant (le seed aurait été
posé deux fois de suite — inoffensif car idempotent, mais contraire à
l'objectif d'un point d'entrée unique et univoque). Retiré :

```make
test-ihm:
	@echo "--- 🎭 Suite Playwright ---"
	cd front && npx playwright test
```

### `front/e2e/setup/seed.sql` — commentaire de tête corrigé

Le commentaire affirmait « deux exécutions consécutives laissent l'état
final identique », vrai du *script* mais lisible comme vrai de la *suite* —
exactement la confusion à l'origine de ce lot. Précisé : l'idempotence est
celle du script ; la suite, elle, mute cet état et certains tests en
dépendent d'un test à l'autre ; la reproductibilité de la suite tient au
fait que `globalSetup.ts` repose ce script avant chaque exécution, pas à
une propriété de la suite elle-même.

## Vérification — cinq exécutions consécutives, deux modes d'invocation

Critère du lot : cinq exécutions consécutives strictement identiques, en
alternant les deux points d'entrée.

| # | Invocation | Résultat |
|---|---|---|
| 1 | `make test-ihm` | ✅ 31 passed / 0 failed |
| 2 | `npx playwright test` (direct, `front/`) | ✅ 31 passed / 0 failed |
| 3 | `make test-ihm` | ✅ 31 passed / 0 failed |
| 4 | `npx playwright test` (direct, `front/`) | ✅ 31 passed / 0 failed |
| 5 | `make test-ihm` | ✅ 31 passed / 0 failed |

**Critère d'acceptation atteint** : cinq résultats identiques (31/0),
alternant les deux modes d'invocation, sans seed manuel entre les
exécutions — chacune l'a posé elle-même via `globalSetup.ts`. Vérifié dans
les journaux que le seed s'exécute bien à chaque passage (sortie `🌱 Seed
Playwright` en tête de chaque log, y compris pour `npx playwright test`
direct, qui ne l'affichait jamais avant ce lot).

## Les deux suspects distincts — non corrigés, non nécessaires ici

Aucune des cinq exécutions de vérification n'a échoué : ni le défaut de
rendu figé de `BarreAxes` (masqué par le `timeout: 60_000` de
`playwright.config.ts`, censé toucher les écrans de `notes-unifie.spec.ts`)
ni le ✘ transitoire de `navigation.spec.ts:20` (rebond Keycloak sur lien
profond froid, `KeycloakContext.tsx:67`, cf. `01-cohabitation.md` §8) ne se
sont manifestés en échec sur ces cinq passages. **Rien à diagnostiquer
davantage dans ce lot** : les deux restent des défauts applicatifs
pré-existants, connus, non corrigés (hors périmètre — `front/src` non
touché), à surveiller si une régression future les fait réapparaître.

## Ce qui n'a pas été traité

- Aucun test individuel modifié, affaibli, retiré ou skip — l'option 2
  (indépendance test à test) n'a pas été nécessaire.
- `retries` toujours à `0`, inchangé.
- Aucun `waitForTimeout` ajouté, aucun timeout rallongé.
- Le défaut `BarreAxes` et le rebond Keycloak sur lien profond froid :
  signalés (§ ci-dessus), non corrigés, non reproduits dans ce lot.
- La dépendance d'état interne à `grille-saisie.spec.ts` (tests 1, 3 et 4
  du même fichier) n'a pas été retirée : elle est admise et documentée en
  commentaire dans le fichier lui-même, et la correction de la cause
  racine (seed systématique) suffit à la rendre inoffensive sans avoir à y
  toucher.
