import { test, expect } from './fixtures/roles';
import { allerAuTOEIC } from './aide/hierarchieE2E';
import { crud, interpoler } from './aide/i18n';
import { surveillerErreursConsole } from './aide/console';

/**
 * Fumée sur le workflow Certifications, jamais visité par la suite avant ce
 * lot (voir docs/migration-shadcn/02bis-filet-regression.md). Objectif
 * assumé : attraper « l'écran est blanc » ou « l'écran plante », pas valider
 * le métier. `seed.sql` ne pose aucun résultat TOEIC pour E2E Promotion :
 * l'écran attendu est son état vide explicite, pas une ligne.
 */
test.describe('Certifications — fumée', () => {
    test('TOEIC se charge, table vide, aucune erreur console', async ({ pageAdmin }) => {
        const erreursConsole = surveillerErreursConsole(pageAdmin);

        await allerAuTOEIC(pageAdmin);

        await expect(pageAdmin.getByRole('heading', { name: 'TOEIC' })).toBeVisible();
        await expect(
            pageAdmin.getByText(interpoler(crud.listeVide, { nom: 'résultat TOEIC' })),
        ).toBeVisible();

        expect(erreursConsole).toEqual([]);
    });
});
