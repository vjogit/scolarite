import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import verifierStack from './verifierStack';

const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Point d'entrée unique de la suite, quel que soit l'invocateur
 * (`make test-ihm` comme `npx playwright test` seul) : vérifie que la stack
 * répond, PUIS pose le jeu de données — sans condition, à chaque exécution.
 *
 * Avant ce fichier, seule la cible `test-ihm` du makefile posait le seed
 * (`seed.sh` puis `npx playwright test`) ; un `npx playwright test` lancé
 * directement enchaînait sur l'état laissé par l'exécution précédente. Or
 * plusieurs specs ont des dépendances d'état explicites (voir
 * grille-saisie.spec.ts) : sans re-seed, la suite n'est reproductible que
 * par accident. Voir docs/migration-shadcn/01bis-stabilisation-e2e.md pour
 * la démonstration.
 */
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
