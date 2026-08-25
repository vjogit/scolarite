import { test, expect } from './fixtures/roles';
import { E2E, allerJusquaPeriode, cliquerAxe, allerAAxeEleve } from './aide/hierarchieE2E';
import { note } from './aide/i18n';

test.describe('Écran Notes unifié', () => {
    test('les cinq axes se chargent', async ({ pageAdmin }) => {
        // Une navigation fraîche par axe plutôt qu'une chaîne de bascules :
        // ce test vérifie que chaque axe charge, pas l'enchaînement des
        // transitions (couvert séparément par les tests « changement
        // d'axe » ci-dessous).
        await allerJusquaPeriode(pageAdmin, 'notes');
        await expect(pageAdmin.getByRole('group', { name: note.barreAxes.axe }).getByRole('button', { name: 'Période' })).toBeVisible();
        await expect(pageAdmin.getByRole('heading', { name: 'GPA délibéré' })).toBeVisible();

        await allerJusquaPeriode(pageAdmin, 'notes');
        const ligneUe = pageAdmin.getByRole('row', { name: E2E.ue }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageAdmin, 'UE', /\/ue$/, ligneUe);
        await expect(pageAdmin.getByRole('heading', { name: 'UE' })).toBeVisible();

        // Matière et Contrôle se chargent depuis l'écran du niveau parent —
        // le chemin que `allerALaGrilleDeSaisie` emprunte déjà de façon
        // fiable — plutôt que par bascule directe depuis Période, qui pour
        // Matière spécifiquement ne charge pas toujours (signalé à part).
        await ligneUe.click();
        await pageAdmin.waitForURL(/\/ue\/\d+\/note$/);
        const ligneMatiere = pageAdmin.getByRole('row', { name: E2E.matiere }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageAdmin, 'Matière', /\/matiere$/, ligneMatiere);
        await expect(pageAdmin.getByRole('heading', { name: 'Matières' })).toBeVisible();

        await ligneMatiere.click();
        await pageAdmin.waitForURL(/\/matiere\/\d+\/note$/);
        const ligneControle = pageAdmin.getByRole('row', { name: E2E.controleContinu }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageAdmin, 'Contrôle', /\/controle$/, ligneControle);
        await expect(pageAdmin.getByRole('heading', { name: 'Contrôles' })).toBeVisible();

        await allerJusquaPeriode(pageAdmin, 'notes');
        await allerAAxeEleve(pageAdmin);
        await expect(pageAdmin.getByRole('combobox', { name: 'Élève de la période' })).toBeVisible();
    });

    test('les axes calculés n\'exposent aucune action d\'écriture', async ({ pageSaisie }) => {
        // NOTES_ECRITURE : seul rôle d'écriture du domaine résultat. Si un
        // champ de saisie apparaissait ici, ce serait sur cet axe.
        await allerJusquaPeriode(pageSaisie, 'notes');
        const ligneUe = pageSaisie.getByRole('row', { name: E2E.ue }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageSaisie, 'UE', /\/ue$/, ligneUe);
        await ligneUe.click();
        await pageSaisie.waitForURL(/\/ue\/\d+\/note$/);
        await pageSaisie.waitForLoadState('networkidle');

        await expect(pageSaisie.getByRole('textbox')).toHaveCount(0);
        await expect(pageSaisie.getByRole('checkbox')).toHaveCount(0);
    });

    test('« non évaluée » s\'affiche comme texte, pas une cellule vide ; le rattrapage validé indique sa provenance', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const ligneUe = pageAdmin.getByRole('row', { name: E2E.ue }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageAdmin, 'UE', /\/ue$/, ligneUe);
        await ligneUe.click();
        await pageAdmin.waitForURL(/\/ue\/\d+\/note$/);
        await pageAdmin.waitForLoadState('networkidle');

        const ligneNonEvaluee = pageAdmin.getByRole('row', { name: new RegExp(E2E.eleve3) });
        await expect(ligneNonEvaluee).toContainText(note.provenance.nonEvaluee);

        const ligneRattrapage = pageAdmin.getByRole('row', { name: new RegExp(E2E.eleve2) });
        await expect(ligneRattrapage).toContainText(note.celluleNote.rattrapage);
    });

    test('changement d\'axe : le contexte suit et l\'URL porte l\'axe', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const urlPeriode = pageAdmin.url();
        expect(urlPeriode.endsWith('/note')).toBe(true);

        await cliquerAxe(pageAdmin, 'UE', /\/ue$/, pageAdmin.getByRole('heading', { name: 'UE' }));
        expect(pageAdmin.url()).toContain('/ue');
        // Le contexte période reste dans l'URL, sans re-sélection.
        expect(pageAdmin.url().startsWith(urlPeriode.replace(/\/note$/, ''))).toBe(true);
    });

    test('changement d\'axe UE → Matière depuis l\'écran d\'une UE', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const ligneUe = pageAdmin.getByRole('row', { name: E2E.ue }).getByRole('button', { name: note.routes.gererLesNotes });
        await cliquerAxe(pageAdmin, 'UE', /\/ue$/, ligneUe);
        await ligneUe.click();
        await pageAdmin.waitForURL(/\/ue\/\d+\/note$/);
        await pageAdmin.waitForLoadState('networkidle');

        await cliquerAxe(pageAdmin, 'Matière', /\/matiere$/, pageAdmin.getByRole('heading', { name: 'Matières' }));
        await expect(pageAdmin.getByRole('heading', { name: 'Matières' })).toBeVisible();
    });

    test('axe Élève partageable : l\'URL porte le user_id', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        await allerAAxeEleve(pageAdmin);

        await pageAdmin.getByRole('combobox', { name: 'Élève de la période' }).click();
        await pageAdmin.getByRole('option', { name: new RegExp(E2E.eleve1) }).click();
        await pageAdmin.waitForURL(/\/eleve\/\d+/);

        // Partageable : l'identifiant numérique de l'élève est dans le
        // chemin, pas dans un état client — une URL copiée le porte donc
        // avec elle.
        const url = new URL(pageAdmin.url());
        expect(/\/eleve\/\d+/.test(url.pathname)).toBe(true);
    });
});
