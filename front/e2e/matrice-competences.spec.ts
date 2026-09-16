import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, allerAuSyllabusViaStructure } from './aide/hierarchieE2E';
import { crud, interpoler, syllabus } from './aide/i18n';

/**
 * La matrice de compétences de l'UE (lot 3), sur l'écran syllabus de l'UE.
 *
 * Famille indépendante de l'administration du référentiel : elle consomme le
 * référentiel semé (deux blocs sur « E2E Formation », un sur une formation
 * étrangère, une liaison pré-cochée sur « E2E UE1 » — C1 du bloc 1,
 * enseignée + évaluée) sans jamais passer par les écrans d'administration.
 * L'écriture remet l'état semé en assertion, comme la spec syllabus du lot 2.
 */

const M = syllabus.competences.matrice;

function caseDe(page: Page, axe: 'enseignee' | 'mise_en_oeuvre' | 'evaluee', code: string, action: string) {
    return page.getByRole('checkbox', { name: interpoler(M.case, { axe: M[axe], code, action }), exact: true });
}

function boutonEnregistrer(page: Page) {
    return page.getByRole('button', { name: M.enregistrer });
}

test.describe('Matrice de compétences de l\'UE', () => {
    test('CONSULTATION : la liaison semée se lit, regroupée par bloc ; la formation étrangère est absente', async ({ pageConsultation }) => {
        await allerAuSyllabusViaStructure(pageConsultation, 'ue');
        await expect(pageConsultation.getByRole('heading', { name: M.titre })).toBeVisible();

        // Blocs en tête de section, codes officiels compris ; codes C1/C2 dérivés de la position.
        const table = pageConsultation.getByRole('table', { name: M.titre });
        await expect(table.getByRole('cell', { name: `${E2E.bloc1Code} — ${E2E.bloc1}`, exact: true })).toBeVisible();
        await expect(table.getByRole('cell', { name: E2E.bloc2, exact: true })).toBeVisible();
        await expect(table.getByRole('cell', { name: `C1 ${E2E.competence11}`, exact: true })).toBeVisible();
        await expect(table.getByRole('cell', { name: `C2 ${E2E.competence12}`, exact: true })).toBeVisible();
        await expect(table.getByRole('cell', { name: `C1 ${E2E.competence21}`, exact: true })).toBeVisible();
        await expect(table.getByText(E2E.competenceEtrangere)).toHaveCount(0);

        // La liaison semée : enseignée et évaluée, pas mise en œuvre — tout désactivé.
        await expect(caseDe(pageConsultation, 'enseignee', 'C1', E2E.competence11)).toBeChecked();
        await expect(caseDe(pageConsultation, 'evaluee', 'C1', E2E.competence11)).toBeChecked();
        await expect(caseDe(pageConsultation, 'mise_en_oeuvre', 'C1', E2E.competence11)).not.toBeChecked();
        await expect(caseDe(pageConsultation, 'enseignee', 'C1', E2E.competence11)).toBeDisabled();
        await expect(caseDe(pageConsultation, 'enseignee', 'C2', E2E.competence12)).toBeDisabled();
        await expect(boutonEnregistrer(pageConsultation)).toHaveCount(0);
    });

    test('SYLLABUS_ECRITURE : coche, enregistre, relue depuis un autre contexte, puis l\'état semé revient', async ({ pageSyllabus, pageAdmin }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'ue');
        const miseEnOeuvreC2 = caseDe(pageSyllabus, 'mise_en_oeuvre', 'C2', E2E.competence12);
        const enseigneeBloc2 = caseDe(pageSyllabus, 'enseignee', 'C1', E2E.competence21);
        await expect(miseEnOeuvreC2).not.toBeChecked();
        await expect(enseigneeBloc2).not.toBeChecked();

        await miseEnOeuvreC2.check();
        await enseigneeBloc2.check();
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(M.enregistre)).toBeVisible();
        // Une fois enregistrée, la matrice n'est plus « modifiée » : le retour ne demande rien.
        await expect(pageSyllabus.getByRole('dialog')).toHaveCount(0);

        // Relue depuis le serveur, par un autre contexte : la liaison semée et les deux nouvelles.
        await allerAuSyllabusViaStructure(pageAdmin, 'ue');
        await expect(caseDe(pageAdmin, 'enseignee', 'C1', E2E.competence11)).toBeChecked();
        await expect(caseDe(pageAdmin, 'mise_en_oeuvre', 'C2', E2E.competence12)).toBeChecked();
        await expect(caseDe(pageAdmin, 'enseignee', 'C1', E2E.competence21)).toBeChecked();

        // Retour à l'état semé, en assertion : décocher retire la ligne
        // (une ligne aux trois axes faux n'existe pas). Relu par une page
        // neuve du même contexte — la mémoire de navigation d'une page déjà
        // descendue jusqu'au syllabus ferait rebondir la descente par l'arbre.
        await miseEnOeuvreC2.uncheck();
        await enseigneeBloc2.uncheck();
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(M.enregistre)).toHaveCount(2);
        const relecture = await pageAdmin.context().newPage();
        await allerAuSyllabusViaStructure(relecture, 'ue');
        await expect(caseDe(relecture, 'mise_en_oeuvre', 'C2', E2E.competence12)).not.toBeChecked();
        await expect(caseDe(relecture, 'enseignee', 'C1', E2E.competence21)).not.toBeChecked();
        await expect(caseDe(relecture, 'evaluee', 'C1', E2E.competence11)).toBeChecked();
        await relecture.close();
    });

    test('la garde unique s\'interpose sur une case cochée non enregistrée', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'ue');
        const evalueeC2 = caseDe(pageSyllabus, 'evaluee', 'C2', E2E.competence12);
        await evalueeC2.check();

        // Le bouton « Annuler » du syllabus de l'UE porte la garde ; la matrice
        // modifiée suffit à l'armer (un seul bloqueur par routeur).
        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        const garde = pageSyllabus.getByRole('dialog', { name: crud.unsavedDialog.titre });
        await expect(garde).toBeVisible();
        await garde.getByRole('button', { name: crud.unsavedDialog.rester }).click();
        await expect(garde).toHaveCount(0);
        await expect(evalueeC2).toBeChecked();

        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        await garde.getByRole('button', { name: crud.unsavedDialog.quitter }).click();
        await expect(pageSyllabus).toHaveURL(/\/ue\/\d+$/);
        await expect(pageSyllabus.getByRole('heading', { name: crud.form.titreDetails })).toBeVisible();
    });
});
