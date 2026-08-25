import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app } from './aide/i18n';
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

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
});
