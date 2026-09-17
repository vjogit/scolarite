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
        // Une attente PAR CARTE, pas un compte global d'alertes : l'unique
        // échec de ce spec (lot 11, artefact perdu, jamais reproduit en
        // cinquante runs CI) ne disait pas quelle carte manquait. La carte
        // du témoin n'a d'alerte qu'après un dépôt : aucune ici.
        const carte = (titre: string) => pageAdmin.locator('[data-slot="card"]', { has: pageAdmin.getByRole('heading', { name: titre }) });
        await expect(carte(registre.integrite.titre)).toBeVisible();
        await expect(carte(registre.ancrage.titre)).toBeVisible();
        await expect(carte(registre.temoin.titre)).toBeVisible();
        await expect(carte(registre.integrite.titre).getByRole('alert'), 'carte Intégrité résolue').toHaveCount(1);
        await expect(carte(registre.ancrage.titre).getByRole('alert'), 'carte Ancrage résolue').toHaveCount(1);
        await expect(carte(registre.temoin.titre).getByRole('alert'), 'carte Témoin sans dépôt').toHaveCount(0);
        await expect(pageAdmin.getByRole('alert')).toHaveCount(2);

        expect(erreursConsole).toEqual([]);
    });
});
