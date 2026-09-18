import { test, expect } from '@playwright/test';
import { chargerEnvLocal } from './setup/env';
import { app } from './aide/i18n';
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

/**
 * La langue de départ suit celle du navigateur, même quand il n'annonce
 * qu'un code régional. Un navigateur qui ne dit QUE `fr-FR` faisait démarrer
 * l'application en anglais (défaut consigné le 5 septembre 2026, fermé au
 * lot de nettoyage du 17) : le détecteur i18next rendait `['fr-FR', 'en']`
 * — le navigateur, puis le `lang="en"` de index.html — et la passe d'égalité
 * stricte contre `supportedLngs: ['fr', 'en']` retenait `en` avant que la
 * seconde passe ne réduise `fr-FR` à `fr`. `convertDetectedLanguage` ramène
 * chaque langue détectée à son code court avant toute comparaison.
 *
 * Contexte NEUF, sans `storageState` (les fichiers d'`e2e/.auth/` portent
 * déjà `i18nextLng=fr`, ce qui masquerait le défaut), `locale: 'fr-FR'` :
 * Playwright fixe `navigator.languages` à cette seule valeur, quel que soit
 * le poste — la spec n'a pas besoin du conteneur de référence. La connexion
 * se fait dans ce contexte, sans déconnexion (une déconnexion clôturerait la
 * session que toute la suite partage).
 */
test.describe('Langue du navigateur', () => {
    const env = chargerEnvLocal();

    test("un navigateur qui n'annonce que fr-FR démarre l'application en français", async ({ browser }) => {
        const contexte = await browser.newContext({ locale: 'fr-FR' });
        const page = await contexte.newPage();
        try {
            await page.goto('/');
            await expect(page.locator('#kc-login')).toBeVisible();
            expect(await page.evaluate(() => navigator.languages)).toEqual(['fr-FR']);

            await page.locator('#username').fill(env.admin.username);
            await page.locator('#password').fill(env.admin.password);
            await page.locator('#kc-login').click();
            await page.waitForFunction(() => !location.href.includes('/auth/realms/'), null, { timeout: 15_000 });

            await expect(page.getByRole('tab', { name: app.workflows.notes })).toBeVisible();
            await expect(page.getByRole('tab', { name: appEn.workflows.notes })).toHaveCount(0);
            // Le code enregistré est le code court : ce que le thème Keycloak
            // (`langue.js`) et le pont zod lisent.
            expect(await page.evaluate(() => localStorage.getItem('i18nextLng'))).toBe('fr');
        } finally {
            await contexte.close();
        }
    });
});
