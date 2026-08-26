import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler } from './aide/i18n';
import { surveillerErreursConsole } from './aide/console';

/**
 * Fumée sur le workflow Salle, jamais visité par la suite avant ce lot.
 * `seed.sql` ne pose aucune salle : l'écran attendu est son état vide
 * explicite, pas une ligne.
 */
test.describe('Salle — fumée', () => {
    test('la liste se charge, table vide, aucune erreur console', async ({ pageAdmin }) => {
        const erreursConsole = surveillerErreursConsole(pageAdmin);

        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('link', { name: app.nav.salle }).click();
        await pageAdmin.waitForLoadState('networkidle');

        await expect(pageAdmin.getByRole('heading', { name: crud.entites.salle.title })).toBeVisible();
        await expect(
            pageAdmin.getByText(interpoler(crud.listeVide_f, { nom: 'salle' })),
        ).toBeVisible();

        expect(erreursConsole).toEqual([]);
    });
});
