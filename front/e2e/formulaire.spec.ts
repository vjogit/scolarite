import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, errors, structure } from './aide/i18n';

/**
 * Comportement du cadre de formulaire (`services/crud/Form.tsx`) — le bug
 * « Annuler validait le formulaire » du lot 4 (`type="submit"` par défaut des
 * boutons natifs) était fonctionnel, pas visuel : aucune capture ne l'aurait
 * vu. Ces tests fixent le contrat que les lots 5 à 17 devront préserver :
 * Annuler n'écrit jamais, la garde de sortie ne se déclenche que sur
 * modification réelle, un refus serveur s'affiche sur le champ fautif.
 *
 * Terrain : le formulaire de création de formation (workflow Structure) — le
 * plus simple des formulaires réels (un champ), et le seul dont un refus
 * serveur se provoque de façon fiable : créer une formation portant le nom
 * d'une formation active existante viole `uk_formation_name_active`, que le
 * serveur traduit en VALIDATION_ERROR sur le champ `name`
 * (back/pkg/structure/formation/formation.go) — un cas que zod ne peut pas
 * intercepter côté client. AUCUN de ces tests ne crée d'entité : toute
 * soumission tentée est un doublon refusé, toute sortie passe par Annuler.
 */

/** Nom jamais créé : il ne doit exister dans aucune liste, à aucun moment. */
const NOM_JAMAIS_CREE = 'E2E Formulaire Annule';

/**
 * Ouvre le formulaire de création de formation depuis le workflow Structure.
 * Deux boutons portent le libellé « Créer une formation » (l'en-tête de
 * l'arbre et la barre de la liste) : ils visent la même route, le premier
 * suffit.
 */
async function ouvrirCreationFormation(page: Page): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('tab', { name: app.workflows.structure }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Créer une formation' }).first().click();
    await expect(page.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();
}

test.describe('Formulaire crud — Annuler, garde de sortie, refus serveur', () => {
    test('sans modification, Annuler sort sans garde ni écriture', async ({ pageAdmin }) => {
        await ouvrirCreationFormation(pageAdmin);

        await pageAdmin.getByRole('button', { name: crud.form.annuler }).click();

        // Pas de garde : rien n'a été modifié. Absence affirmée explicitement.
        await expect(pageAdmin.getByRole('dialog')).toHaveCount(0);
        await expect(pageAdmin.getByRole('heading', { name: 'Formations' })).toBeVisible();
    });

    test('la garde s\'interpose sur saisie non enregistrée ; Annuler ne crée rien', async ({ pageAdmin }) => {
        await ouvrirCreationFormation(pageAdmin);
        await pageAdmin.getByLabel(structure.formation.champTitre).fill(NOM_JAMAIS_CREE);

        // Premier Annuler : la garde s'interpose, « Rester » préserve la saisie.
        await pageAdmin.getByRole('button', { name: crud.form.annuler }).click();
        const garde = pageAdmin.getByRole('dialog', { name: crud.unsavedDialog.titre });
        await expect(garde).toBeVisible();
        await garde.getByRole('button', { name: crud.unsavedDialog.rester }).click();
        await expect(garde).toHaveCount(0);
        await expect(pageAdmin.getByLabel(structure.formation.champTitre)).toHaveValue(NOM_JAMAIS_CREE);

        // Second Annuler : « Quitter » abandonne — et n'a RIEN soumis. C'est le
        // bug réel du lot 4 : sans `type="button"`, ce clic validait le
        // formulaire et créait l'entité.
        await pageAdmin.getByRole('button', { name: crud.form.annuler }).click();
        await garde.getByRole('button', { name: crud.unsavedDialog.quitter }).click();

        await expect(pageAdmin.getByRole('heading', { name: 'Formations' })).toBeVisible();
        await expect(pageAdmin.getByRole('cell', { name: E2E.formation, exact: true })).toBeVisible();
        await expect(pageAdmin.getByRole('cell', { name: NOM_JAMAIS_CREE })).toHaveCount(0);
    });

    test('un refus serveur s\'affiche sur le champ fautif, qui reprend le focus', async ({ pageAdmin }) => {
        await ouvrirCreationFormation(pageAdmin);

        // Doublon d'une formation active : refusé par le serveur, pas par zod.
        const champ = pageAdmin.getByLabel(structure.formation.champTitre);
        await champ.fill(E2E.formation);
        await pageAdmin.getByRole('button', { name: crud.form.ajouter }).click();

        // Le motif snake_case du serveur est traduit et posé sur le champ…
        await expect(pageAdmin.getByText(errors.motifChamp.valeur_deja_utilisee)).toBeVisible();
        await expect(champ).toHaveAttribute('aria-invalid', 'true');
        // …et le focus y revient (`champsRefuses` → `premierChampEnErreur`,
        // services/crud/focus.ts).
        await expect(champ).toBeFocused();

        // Sortie sans écriture ; le doublon n'existe qu'en un exemplaire.
        await pageAdmin.getByRole('button', { name: crud.form.annuler }).click();
        const garde = pageAdmin.getByRole('dialog', { name: crud.unsavedDialog.titre });
        await garde.getByRole('button', { name: crud.unsavedDialog.quitter }).click();
        await expect(pageAdmin.getByRole('heading', { name: 'Formations' })).toBeVisible();
        await expect(pageAdmin.getByRole('cell', { name: E2E.formation, exact: true })).toHaveCount(1);
    });
});
