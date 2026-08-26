import type { Page } from '@playwright/test';

/**
 * Erreurs console de niveau `error` accumulées depuis l'appel, pour les
 * tests de fumée qui veulent s'assurer qu'un écran ne plante pas en
 * silence — la classe de régression qu'une migration de bibliothèque
 * graphique produit (voir docs/migration-shadcn/02bis-filet-regression.md).
 * Les avertissements des iframes de vérification Keycloak (SSO) sont de
 * niveau `warning`, jamais `error` : pas de filtrage à faire ici.
 */
export function surveillerErreursConsole(page: Page): string[] {
    const erreurs: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') erreurs.push(message.text());
    });
    return erreurs;
}
