import { test, expect, type Page } from '@playwright/test';
import { chargerEnvLocal } from './setup/env';
import { app } from './aide/i18n';
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

/**
 * La langue de la page de connexion Keycloak suit celle de l'application, et
 * réciproquement, par la clé `i18nextLng` de localStorage que les deux
 * partagent (Keycloak est servi sous l'origine du front, en /auth) — le
 * script `langue.js` du thème `scolarite`
 * (infra/keycloak/themes/scolarite/login/resources/js/langue.js).
 *
 * Un contexte NEUF, sans `storageState` : la spec se connecte elle-même, et
 * se déconnecte — une déconnexion dans un contexte monté sur `e2e/.auth/`
 * clôturerait la session Keycloak que tous les autres tests partagent. La
 * locale du contexte est épinglée `fr` : sans elle, Chromium annonce
 * `en-US`, Keycloak rendrait la page en anglais de lui-même et l'aller
 * (application en anglais → page en anglais) ne prouverait rien. Avec elle,
 * la résolution propre de Keycloak (Accept-Language) donne le français, et
 * seul le script peut produire une page en anglais. `fr` nu, pas `fr-FR` :
 * un navigateur qui n'annonce QUE `fr-FR` fait démarrer l'application en
 * anglais — `fr-FR` n'est pas dans `supportedLngs`, et le détecteur i18next
 * retombe sur le `lang="en"` de index.html avant d'essayer la langue seule
 * (constaté dans le conteneur de référence ; les navigateurs réels envoient
 * `fr-FR,fr`, qui ne tombe pas dans ce cas).
 */
test.describe('Langue de la page de connexion', () => {
    const env = chargerEnvLocal();

    /** Les navigations du cadre principal vers une URL portant `kc_locale`. */
    function compterRechargementsKcLocale(page: Page): { readonly valeur: () => number; readonly remettre: () => void } {
        let compte = 0;
        page.on('framenavigated', (cadre) => {
            if (cadre === page.mainFrame() && cadre.url().includes('kc_locale=')) compte += 1;
        });
        return { valeur: () => compte, remettre: () => { compte = 0; } };
    }

    /**
     * Choisit une langue au sélecteur de la page de connexion, par le
     * paramètre `kc_locale` de l'option — jamais par son libellé, qui est
     * écrit dans la langue rendue (« Français » sur la page française,
     * « French (Français) » sur l'anglaise).
     */
    async function choisirAuSelecteur(page: Page, langue: 'fr' | 'en'): Promise<void> {
        const valeur = await page.locator(`#login-select-toggle option[value*="kc_locale=${langue}"]`).getAttribute('value');
        expect(valeur).not.toBeNull();
        await page.locator('#login-select-toggle').selectOption(valeur ?? '');
    }

    async function seConnecter(page: Page): Promise<void> {
        await page.locator('#username').fill(env.admin.username);
        await page.locator('#password').fill(env.admin.password);
        await page.locator('#kc-login').click();
        await page.waitForFunction(() => !location.href.includes('/auth/realms/'), null, { timeout: 15_000 });
    }

    test("l'application et la page de connexion partagent leur langue, dans les deux sens", async ({ browser }) => {
        const contexte = await browser.newContext({ locale: 'fr' });
        const page = await contexte.newPage();
        const rechargements = compterRechargementsKcLocale(page);
        try {
            // Neutre : rien d'enregistré, Keycloak décide seul (fr par
            // Accept-Language), aucun rechargement.
            await page.goto('/');
            await expect(page.locator('#kc-login')).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
            expect(page.url()).not.toContain('kc_locale=');
            expect(rechargements.valeur()).toBe(0);

            await seConnecter(page);
            await expect(page.getByRole('tab', { name: app.workflows.notes })).toBeVisible();

            // Aller : l'application passe en anglais, la déconnexion ramène
            // sur une page de connexion en anglais — par AU PLUS un
            // rechargement, celui du script, sur le lien du sélecteur de
            // langue de la page. « Au plus » : Keycloak mémorise la langue
            // demandée à la connexion dans l'attribut `locale` du compte et
            // la repose en cookie à chaque connexion suivante ; si une
            // exécution précédente a laissé « en » sur le compte de test,
            // la page se rend déjà en anglais et le script n'a rien à faire.
            // Ce que le test garantit, c'est la langue de la page et
            // l'absence de boucle, pas le mécanisme qui l'a produite.
            await page.getByRole('button', { name: app.langueAriaLabel }).click();
            await page.getByRole('menuitem', { name: 'English' }).click();
            await expect(page.getByRole('tab', { name: appEn.workflows.notes })).toBeVisible();
            expect(await page.evaluate(() => localStorage.getItem('i18nextLng'))).toBe('en');

            rechargements.remettre();
            await page.getByRole('button', { name: appEn.shell.compte }).click();
            await page.getByRole('menuitem', { name: appEn.nav.deconnexion }).click();
            await expect(page.locator('#kc-login')).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('lang', 'en');
            expect(rechargements.valeur()).toBeLessThanOrEqual(1);

            // Retour : le sélecteur de la page remet le français, le magasin
            // suit tout de suite — et aucun rechargement ne vient le contredire.
            rechargements.remettre();
            await choisirAuSelecteur(page, 'fr');
            await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
            expect(await page.evaluate(() => localStorage.getItem('i18nextLng'))).toBe('fr');
            expect(rechargements.valeur()).toBe(1); // la navigation du sélecteur, rien de plus

            // Et l'application redémarre en français, sans autre manipulation.
            await seConnecter(page);
            await expect(page.getByRole('tab', { name: app.workflows.notes })).toBeVisible();
            await expect(page.getByRole('tab', { name: appEn.workflows.notes })).toHaveCount(0);
        } finally {
            await contexte.close();
        }
    });
});
