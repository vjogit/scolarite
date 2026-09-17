import { test, expect } from './fixtures/roles';
import { E2E, allerALaGrilleDeSaisie } from './aide/hierarchieE2E';
import { note } from './aide/i18n';

/**
 * La grille de saisie se verrouille sous jury délibéré (17 septembre 2026) :
 * `jury_result` est le relevé figé et les bulletins se régénèrent depuis les
 * notes — une note modifiée après délibération changerait un document remis.
 * Le serveur refuse toute écriture (409 saisie_apres_deliberation) ; l'écran
 * le dit et n'offre aucune saisie, même au porteur du rôle d'écriture — c'est
 * ce que le compte NOTES_ECRITURE prouve ici. Le geste légitime est
 * l'annulation de la délibération, qui rouvre la grille.
 *
 * État semé : « E2E Controle Deliberee » sous « E2E Periode Deliberee »,
 * effectif « E2E Groupe Deliberee » (un élève). Aucune écriture.
 */
test.describe('Grille de saisie — jury délibéré', () => {
    test('NOTES_ECRITURE : la grille est verrouillée, aucune saisie ni import', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(
            pageSaisie, 'E2E Groupe Deliberee', 'E2E Controle Deliberee',
            E2E.optionDeliberee, 'E2E Periode Deliberee', 'E2E UE Deliberee', 'E2E Matiere Deliberee',
        );

        await expect(pageSaisie.getByRole('status').filter({ hasText: note.grilleNotes.juryDelibere })).toBeVisible();
        const grille = pageSaisie.getByRole('table', { name: 'Grille de saisie des notes' });
        await expect(grille.getByRole('row')).toHaveCount(2); // en-tête + un élève
        for (const champ of await grille.getByRole('textbox').all()) await expect(champ).toBeDisabled();
        for (const champ of await grille.getByRole('checkbox').all()) await expect(champ).toBeDisabled();
        await expect(pageSaisie.getByRole('button', { name: note.grilleNotes.exporterLaFiche })).toBeVisible();
        await expect(pageSaisie.getByRole('button', { name: note.ficheImport.importerDepuisExcel })).toHaveCount(0);
    });

    test('la grille du contrôle non délibéré reste saisissable', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);
        await expect(pageSaisie.getByRole('status').filter({ hasText: note.grilleNotes.raccourciSaisie })).toBeVisible();
        await expect(pageSaisie.getByRole('table', { name: 'Grille de saisie des notes' }).getByRole('textbox').first()).toBeEnabled();
    });
});
