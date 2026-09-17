import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, allerAuReferentielViaStructure, boutonActionsLigne } from './aide/hierarchieE2E';
import { app, crud, errors, interpoler, syllabus } from './aide/i18n';
import syllabusEn from '../src/i18n/locales/en/syllabus.json' with { type: 'json' };
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

/**
 * L'administration du référentiel de compétences (lot 3, porté par la
 * promotion depuis le 16 septembre 2026) : deux Crud imbriqués sous la
 * promotion — blocs, puis compétences d'un bloc.
 *
 * Famille indépendante de la matrice de l'UE : elle ne consomme rien du seed
 * (les deux blocs semés servent la famille « matrice », `matrice-competences.spec.ts`,
 * et restent intouchés ici). Elle crée ses blocs et compétences par
 * l'interface, à des positions que le seed n'occupe pas, vérifie (ordre, codes
 * dérivés, refus d'une position déjà prise, modale d'impact), puis supprime :
 * la base ressort comme elle est entrée.
 */

const BLOC_A = 'E2E Bloc Admin A';
const BLOC_B = 'E2E Bloc Admin B';
const COMPETENCE_1 = 'E2E Admin Analyser';
const COMPETENCE_2 = 'E2E Admin Concevoir';
const CREER_BLOC = interpoler(crud.creationInvite, { nom: syllabus.competences.bloc.nom });
const CREER_COMPETENCE = interpoler(crud.creationInvite_f, { nom: syllabus.competences.competence.nom });

async function creerBloc(page: Page, ordre: string, libelle: string): Promise<void> {
    await page.getByRole('button', { name: CREER_BLOC }).first().click();
    await expect(page.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();
    await page.getByLabel(syllabus.competences.bloc.champOrdre).fill(ordre);
    await page.getByLabel(syllabus.competences.bloc.champLibelle).fill(libelle);
    await page.getByRole('button', { name: crud.form.ajouter }).click();
    await expect(page.getByRole('cell', { name: libelle, exact: true })).toBeVisible();
}

/** Coche la ligne nommée et supprime la sélection ; l'appelant lit la modale. */
async function demanderSuppression(page: Page, nomLigne: string): Promise<void> {
    await page.getByRole('row', { name: nomLigne }).getByRole('checkbox', { name: crud.table.selectionnerLigne }).check();
    await page.getByRole('button', { name: crud.actions.supprimerSelection }).click();
}

test.describe('Référentiel de compétences — administration', () => {
    test('SYLLABUS_ECRITURE : blocs et compétences créés, ordonnés, codés, puis supprimés — la base ressort intacte', async ({ pageSyllabus }) => {
        await allerAuReferentielViaStructure(pageSyllabus);
        // Les blocs semés sont là, par ordre ; on ne les touche pas.
        const lignes = pageSyllabus.getByRole('row');
        await expect(lignes.filter({ hasText: E2E.bloc1 })).toBeVisible();

        // Deux blocs créés dans le désordre des positions libres.
        await creerBloc(pageSyllabus, '12', BLOC_B);
        await creerBloc(pageSyllabus, '11', BLOC_A);

        // Une position déjà prise sur la promotion est refusée par le serveur,
        // sur le champ « Ordre » — zod ne peut pas le savoir.
        await pageSyllabus.getByRole('button', { name: CREER_BLOC }).first().click();
        await pageSyllabus.getByLabel(syllabus.competences.bloc.champOrdre).fill('11');
        await pageSyllabus.getByLabel(syllabus.competences.bloc.champLibelle).fill('E2E Bloc Doublon');
        await pageSyllabus.getByRole('button', { name: crud.form.ajouter }).click();
        await expect(pageSyllabus.getByText(errors.motifChamp.valeur_deja_utilisee)).toBeVisible();
        await expect(pageSyllabus.getByLabel(syllabus.competences.bloc.champOrdre)).toBeFocused();
        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        await pageSyllabus.getByRole('dialog', { name: crud.unsavedDialog.titre }).getByRole('button', { name: crud.unsavedDialog.quitter }).click();
        await expect(pageSyllabus.getByRole('cell', { name: 'E2E Bloc Doublon' })).toHaveCount(0);

        // Les compétences du bloc A, créées dans le désordre : codes dérivés
        // de la position, liste par ordre.
        await boutonActionsLigne(pageSyllabus, BLOC_A).click();
        await pageSyllabus.getByRole('menuitem', { name: syllabus.competences.bloc.gererCompetences }).click();
        await pageSyllabus.waitForURL(/\/bloc\/\d+\/competence$/);
        await expect(pageSyllabus.getByRole('heading', { name: syllabus.competences.competence.title })).toBeVisible();
        for (const [ordre, action] of [['2', COMPETENCE_2], ['1', COMPETENCE_1]] as const) {
            // Liste vide au premier passage : l'invite est portée par la barre et
            // par l'état vide, même route — le premier suffit.
            await pageSyllabus.getByRole('button', { name: CREER_COMPETENCE }).first().click();
            await pageSyllabus.getByLabel(syllabus.competences.competence.champOrdre).fill(ordre);
            await pageSyllabus.getByLabel(syllabus.competences.competence.champAction).fill(action);
            await pageSyllabus.getByRole('button', { name: crud.form.ajouter }).click();
            await expect(pageSyllabus.getByRole('cell', { name: action, exact: true })).toBeVisible();
        }
        const ligneC1 = pageSyllabus.getByRole('row', { name: COMPETENCE_1 });
        await expect(ligneC1.getByRole('cell', { name: 'C1', exact: true })).toBeVisible();
        await expect(pageSyllabus.getByRole('row', { name: COMPETENCE_2 }).getByRole('cell', { name: 'C2', exact: true })).toBeVisible();
        const cellulesAction = pageSyllabus.getByRole('cell', { name: /^E2E Admin/ });
        await expect(cellulesAction).toHaveText([COMPETENCE_1, COMPETENCE_2]);

        // Retour aux blocs : la suppression du bloc A annonce ses deux
        // compétences, définitivement (pas de corbeille pour le référentiel).
        await pageSyllabus.getByRole('button', { name: crud.actions.retour }).click();
        await expect(pageSyllabus.getByRole('heading', { name: syllabus.competences.bloc.title })).toBeVisible();
        await demanderSuppression(pageSyllabus, BLOC_A);
        const dialogue = pageSyllabus.getByRole('dialog', {
            name: interpoler(crud.deleteDialog.titreUn, { libelle: `${syllabus.competences.bloc.nomAvecArticle} `, nom: BLOC_A }),
        });
        await expect(dialogue).toBeVisible();
        await expect(dialogue.getByRole('alert')).toContainText(`2 ${syllabus.competences.competence.nomPluriel}`);
        await expect(dialogue.getByText(crud.deleteDialog.cascadeDefinitive)).toBeVisible();
        await dialogue.getByRole('button', { name: crud.deleteDialog.supprimer }).click();
        await expect(pageSyllabus.getByRole('cell', { name: BLOC_A, exact: true })).toHaveCount(0);

        // Le bloc B, sans compétence : aucune donnée liée.
        await demanderSuppression(pageSyllabus, BLOC_B);
        const dialogueB = pageSyllabus.getByRole('dialog');
        await expect(dialogueB.getByText(crud.deleteDialog.aucuneDonneeLiee)).toBeVisible();
        await dialogueB.getByRole('button', { name: crud.deleteDialog.supprimer }).click();
        await expect(pageSyllabus.getByRole('cell', { name: BLOC_B, exact: true })).toHaveCount(0);

        // Les blocs semés n'ont pas bougé.
        await expect(pageSyllabus.getByRole('cell', { name: E2E.bloc1, exact: true })).toBeVisible();
        await expect(pageSyllabus.getByRole('cell', { name: E2E.bloc2, exact: true })).toBeVisible();
    });

    test('CONSULTATION : le référentiel se lit, rien ne s\'édite', async ({ pageConsultation }) => {
        await allerAuReferentielViaStructure(pageConsultation);
        await expect(pageConsultation.getByRole('cell', { name: E2E.bloc1, exact: true })).toBeVisible();
        await expect(pageConsultation.getByRole('button', { name: CREER_BLOC })).toHaveCount(0);
        await expect(pageConsultation.getByRole('checkbox', { name: crud.table.selectionnerLigne })).toHaveCount(0);

        await boutonActionsLigne(pageConsultation, E2E.bloc1).click();
        await expect(pageConsultation.getByRole('menuitem', { name: crud.actions.editer })).toHaveCount(0);
        await pageConsultation.getByRole('menuitem', { name: syllabus.competences.bloc.gererCompetences }).click();
        await pageConsultation.waitForURL(/\/bloc\/\d+\/competence$/);
        await expect(pageConsultation.getByRole('row', { name: E2E.competence11 }).getByRole('cell', { name: 'C1', exact: true })).toBeVisible();
        await expect(pageConsultation.getByRole('button', { name: CREER_COMPETENCE })).toHaveCount(0);
    });

    test('bascule fr/en : les actions de ligne du référentiel suivent la langue', async ({ pageAdmin }) => {
        await allerAuReferentielViaStructure(pageAdmin);

        await pageAdmin.getByRole('button', { name: app.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'English' }).click();
        await expect(pageAdmin.getByRole('heading', { name: syllabusEn.competences.bloc.title })).toBeVisible();
        // L'action de ligne est créée au rendu : elle suit la bascule (le
        // défaut consigné des actions figées ne se reproduit pas ici).
        await pageAdmin.getByRole('button', { name: `Actions — ${E2E.bloc1}` }).click();
        await expect(pageAdmin.getByRole('menuitem', { name: syllabusEn.competences.bloc.gererCompetences })).toBeVisible();
        await expect(pageAdmin.getByRole('menuitem', { name: syllabus.competences.bloc.gererCompetences })).toHaveCount(0);
        await pageAdmin.keyboard.press('Escape');

        await pageAdmin.getByRole('button', { name: appEn.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Français' }).click();
        await expect(pageAdmin.getByRole('heading', { name: syllabus.competences.bloc.title })).toBeVisible();
    });
});
