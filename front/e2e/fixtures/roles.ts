import { test as base, type Browser, type Page } from '@playwright/test';

interface FixturesParRole {
    pageAdmin: Page;
    pageConsultation: Page;
    pageSaisie: Page;
}

/**
 * Une page dans un contexte neuf, monté sur le `storageState` du rôle —
 * produit par `e2e/setup/auth.setup.ts`, un par profil de droits.
 */
function fixtureRole(fichierStorageState: string) {
    return async ({ browser }: { browser: Browser }, use: (page: Page) => Promise<void>) => {
        const contexte = await browser.newContext({ storageState: fichierStorageState });
        const page = await contexte.newPage();
        await use(page);
        await contexte.close();
    };
}

export const test = base.extend<FixturesParRole>({
    pageAdmin: fixtureRole('e2e/.auth/admin.json'),
    pageConsultation: fixtureRole('e2e/.auth/consultation.json'),
    pageSaisie: fixtureRole('e2e/.auth/notesEcriture.json'),
});

export { expect } from '@playwright/test';
