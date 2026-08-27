import { test, expect } from './fixtures/roles';
import { E2E, allerJusquaPromotionCertification, attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler } from './aide/i18n';
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };
import crudEn from '../src/i18n/locales/en/crud.json' with { type: 'json' };
import certificationFr from '../src/i18n/locales/fr/certification.json' with { type: 'json' };
import certificationEn from '../src/i18n/locales/en/certification.json' with { type: 'json' };

test.describe('Fumée i18n', () => {
    test('bascule en anglais puis retour en français : le chrome suit', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await expect(pageAdmin.getByRole('tab', { name: app.workflows.notes })).toBeVisible();

        await pageAdmin.getByRole('button', { name: app.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'English' }).click();

        await expect(pageAdmin.getByRole('tab', { name: appEn.workflows.notes })).toBeVisible();
        await expect(pageAdmin.getByRole('tab', { name: app.workflows.notes })).toHaveCount(0);

        await pageAdmin.getByRole('button', { name: appEn.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Français' }).click();

        await expect(pageAdmin.getByRole('tab', { name: app.workflows.notes })).toBeVisible();
        await expect(pageAdmin.getByRole('tab', { name: appEn.workflows.notes })).toHaveCount(0);
    });

    /**
     * Verrou du défaut corrigé au lot 4bis : les actions déclarées au
     * chargement d'un module (`actionsLigne` des `routes.tsx`) sortaient leur
     * clé brute (`i18n.t` lié à `errors`, le namespace par défaut), et une
     * chaîne résolue à la création aurait figé la langue de démarrage. On
     * affirme donc les deux : le mot traduit — jamais la clé — et son
     * remplacement effectif à la bascule de langue, sur le libellé Mobilité
     * internationale du menu d'actions d'une ligne de promotion.
     */
    test("une action déclarée au chargement du module affiche un mot, et suit la langue", async ({ pageAdmin }) => {
        await allerJusquaPromotionCertification(pageAdmin);
        const boutonMenu = pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.promotion }) });
        await boutonMenu.click();
        await expect(pageAdmin.getByRole('menuitem', { name: certificationFr.actionMobiliteLibelle })).toBeVisible();
        await expect(pageAdmin.getByText('actionMobiliteLibelle')).toHaveCount(0);
        await pageAdmin.keyboard.press('Escape');

        await pageAdmin.getByRole('button', { name: app.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'English' }).click();
        await expect(pageAdmin.getByRole('tab', { name: appEn.workflows.certifications })).toBeVisible();

        await pageAdmin.getByRole('button', { name: interpoler(crudEn.actions.menuLigne, { nom: E2E.promotion }) }).click();
        await expect(pageAdmin.getByRole('menuitem', { name: certificationEn.actionMobiliteLibelle })).toBeVisible();
        await expect(pageAdmin.getByRole('menuitem', { name: certificationFr.actionMobiliteLibelle })).toHaveCount(0);
    });
});
