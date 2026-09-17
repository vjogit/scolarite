import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler, validation } from './aide/i18n';
import { surveillerErreursConsole } from './aide/console';
import salle from '../src/i18n/locales/fr/salle.json' with { type: 'json' };

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

    /**
     * Un nombre requis vidé reçoit un message métier, pas le message
     * générique de zod (« nombre attendu, null reçu » — défaut consigné au
     * lot 13, fermé au lot de nettoyage du 17 septembre 2026) : le schéma
     * porte une `error` sur le constructeur, comme `bareme` de la promotion.
     * La salle est le formulaire le plus court qui monte un `ChampNombre`
     * requis ; rien n'est créé, le formulaire est quitté par la garde.
     */
    test('la capacité vidée reçoit son message métier, rien n\'est créé', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('link', { name: app.nav.salle }).click();
        await pageAdmin.getByRole('button', { name: interpoler(crud.creationInvite_f, { nom: 'salle' }) }).first().click();
        await expect(pageAdmin.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();

        await pageAdmin.getByLabel(salle.champs.nom).fill('E2E Salle Jamais Creee');
        await pageAdmin.getByLabel(salle.champs.capacite).fill('');
        await pageAdmin.getByRole('button', { name: crud.form.ajouter }).click();

        await expect(pageAdmin.getByText(validation.capaciteRequise)).toBeVisible();
        await expect(pageAdmin.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();

        await pageAdmin.getByRole('button', { name: crud.form.annuler }).click();
        const garde = pageAdmin.getByRole('dialog', { name: crud.unsavedDialog.titre });
        await expect(garde).toBeVisible();
        await garde.getByRole('button', { name: crud.unsavedDialog.quitter }).click();
        await expect(pageAdmin.getByText(interpoler(crud.listeVide_f, { nom: 'salle' }))).toBeVisible();
    });
});
