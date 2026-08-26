import { test, expect } from './fixtures/roles';
import { allerAuPlanning } from './aide/hierarchieE2E';
import { programme } from './aide/i18n';
import { surveillerErreursConsole } from './aide/console';

/**
 * Fumée sur le planning (workflow Programme), jamais testé au-delà d'un clic
 * d'onglet avant ce lot (navigation.spec.ts:49). `seed.sql` ne pose aucune
 * réservation : le calendrier est attendu vide, mais son chrome (barre
 * d'outils FullCalendar, panneau des heures) ne dépend pas d'une réservation
 * existante — c'est lui qui prouve que l'écran a chargé.
 *
 * « Aujourd'hui » vient du pack de langue française de FullCalendar
 * (`@fullcalendar/core/locales/fr`), pas des JSON `locales/` du projet — rien
 * à y importer.
 */
test.describe('Planning — fumée', () => {
    test('le calendrier et le panneau des heures se chargent, aucune erreur console', async ({ pageAdmin }) => {
        const erreursConsole = surveillerErreursConsole(pageAdmin);

        await allerAuPlanning(pageAdmin);

        await expect(pageAdmin.getByRole('button', { name: 'Aujourd\'hui' })).toBeVisible();
        await expect(pageAdmin.getByRole('heading', { name: programme.heuresPanel.totalPeriode })).toBeVisible();

        expect(erreursConsole).toEqual([]);
    });
});
