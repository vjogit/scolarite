import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RACINE_DEPOT, fichiersEnv } from './env';
import verifierStack from './verifierStack';

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
 *
 * Les fichiers d'environnement viennent de `fichiersEnv()` (env.ts) : ceux
 * du makefile quand il invoque la suite, ceux du poste sinon.
 */
export default async function globalSetup(): Promise<void> {
    await verifierStack();

    const { config, secrets } = fichiersEnv();
    execFileSync(
        resolve(RACINE_DEPOT, 'front/e2e/setup/seed.sh'),
        [config, secrets],
        { stdio: 'inherit' },
    );
}
