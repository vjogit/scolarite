import { test as setup } from '@playwright/test';
import { chargerEnvLocal } from './env';

const env = chargerEnvLocal();

const ROLES = [
    { nom: 'admin', compte: env.admin },
    { nom: 'consultation', compte: env.consultation },
    { nom: 'notesEcriture', compte: env.notesEcriture },
] as const;

for (const { nom, compte } of ROLES) {
    setup(`connexion ${nom}`, async ({ page, baseURL }) => {
        await page.goto('/');
        await page.locator('#username').fill(compte.username);
        await page.locator('#password').fill(compte.password);
        await page.locator('#kc-login').click();

        // Le rebond Keycloak ramène sur l'origine de l'application : on ne
        // sait pas sur quel écran (RetourScolarite reprend la tâche en cours),
        // seulement qu'on n'est plus sur le realm Keycloak.
        await page.waitForURL((url) => baseURL !== undefined && url.href.startsWith(baseURL));

        // Langue épinglée avant la capture : voir décision (e).
        await page.evaluate(() => { localStorage.setItem('i18nextLng', 'fr'); });

        await page.context().storageState({ path: `e2e/.auth/${nom}.json` });
    });
}
