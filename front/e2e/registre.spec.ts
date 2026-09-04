import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app, registre } from './aide/i18n';
import { surveillerErreursConsole } from './aide/console';

/**
 * Fumée sur l'écran Registre, jamais visité par la suite avant ce lot. Pas de
 * dépendance au seed : les trois cartes lisent l'état réel de la chaîne
 * (recalcul complet côté serveur) et de l'ancrage — qu'importe ce qui s'y
 * trouve, la suite ne teste ici que le chargement, jamais un contenu précis.
 */
test.describe('Registre — fumée', () => {
    test('les trois cartes se chargent, aucune erreur console', async ({ pageAdmin }) => {
        const erreursConsole = surveillerErreursConsole(pageAdmin);

        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('link', { name: app.nav.registre }).click();

        await expect(pageAdmin.getByRole('heading', { name: registre.titre, level: 5 })).toBeVisible();

        // Chaque carte se résout en une alerte (succès, avertissement ou
        // erreur) — jamais un état de chargement qui reste figé — sans
        // présumer du verdict exact, qui dépend de l'état réel de la chaîne.
        await expect(pageAdmin.getByRole('heading', { name: registre.integrite.titre })).toBeVisible();
        await expect(pageAdmin.getByRole('heading', { name: registre.ancrage.titre })).toBeVisible();
        await expect(pageAdmin.getByRole('heading', { name: registre.temoin.titre })).toBeVisible();
        await expect(pageAdmin.getByRole('alert')).toHaveCount(2);

        expect(erreursConsole).toEqual([]);
    });
});
