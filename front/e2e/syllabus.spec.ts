import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, allerAuSyllabusViaStructure, attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, errors, interpoler, structure, syllabus } from './aide/i18n';
import syllabusEn from '../src/i18n/locales/en/syllabus.json' with { type: 'json' };
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

/**
 * Les écrans syllabus du lot 2 : la fiche de la matière et le syllabus de
 * l'UE, greffés sous le workflow Structure.
 *
 * État semé (seed.sql) : la fiche de « E2E Matiere » porte 15 + 4 + 1 = 20 h
 * encadrées, exactement `matiere.heure` — conforme. Dépendances d'état À
 * L'INTÉRIEUR de ce fichier, dans l'ordre d'écriture : la lecture vient
 * d'abord ; l'écart écrit 7 h de TP puis les remet à 4 (la remise est une
 * assertion, pas un nettoyage) ; le conflit de version modifie « Prérequis ».
 * Les captures (captures.spec.ts, alphabétiquement avant) voient toujours
 * l'état du seed.
 */

const TP = syllabus.matiere.heures.heures_tp;

function champTp(page: Page) {
    return page.getByRole('spinbutton', { name: TP, exact: true });
}

function boutonEnregistrer(page: Page) {
    // `exact` : l'écran de l'UE porte aussi « Enregistrer les compétences » (lot 3).
    return page.getByRole('button', { name: syllabus.enregistrer, exact: true });
}

const CONFORME_20 = interpoler(syllabus.matiere.total.conforme, { total: '20' });
const ECART_23_20 = interpoler(syllabus.matiere.total.ecart, { total: '23', heure: '20' });

test.describe('Syllabus — fiche matière et syllabus de l\'UE', () => {
    test('CONSULTATION seul : la fiche semée se lit, rien ne s\'édite', async ({ pageConsultation }) => {
        await allerAuSyllabusViaStructure(pageConsultation, 'matiere');
        await expect(pageConsultation.getByRole('heading', { name: syllabus.matiere.titre })).toBeVisible();

        const contexte = pageConsultation.getByLabel(syllabus.matiere.rubriques.contexte);
        await expect(contexte).toHaveValue(/Les systèmes logiciels évoluent vite/);
        await expect(contexte).toBeDisabled();
        await expect(champTp(pageConsultation)).toHaveValue('4');
        await expect(champTp(pageConsultation)).toBeDisabled();
        // Le responsable arrive par la requête de détail utilisateur, en lecture seule.
        await expect(pageConsultation.getByLabel(syllabus.responsable.champ)).toHaveValue(E2E.agent1);
        await expect(pageConsultation.getByText(CONFORME_20)).toBeVisible();

        await expect(boutonEnregistrer(pageConsultation)).toHaveCount(0);
        await expect(pageConsultation.getByRole('button', { name: crud.form.retour })).toBeVisible();
    });

    test('NOTES_ECRITURE seul : un autre rôle d\'écriture n\'ouvre pas la fiche', async ({ pageSaisie }) => {
        await allerAuSyllabusViaStructure(pageSaisie, 'matiere');
        await expect(pageSaisie.getByRole('heading', { name: syllabus.matiere.titre })).toBeVisible();
        await expect(pageSaisie.getByLabel(syllabus.matiere.rubriques.contexte)).toBeDisabled();
        await expect(boutonEnregistrer(pageSaisie)).toHaveCount(0);
    });

    test('SYLLABUS_ECRITURE : l\'écart 23/20 se signale, s\'enregistre, puis disparaît à 20/20', async ({ pageSyllabus, pageAdmin }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'matiere');
        await expect(pageSyllabus.getByText(CONFORME_20)).toBeVisible();

        // Vivant sous la frappe, avant tout enregistrement.
        await champTp(pageSyllabus).fill('7');
        await expect(pageSyllabus.getByText(ECART_23_20)).toBeVisible();
        await expect(pageSyllabus.getByText(CONFORME_20)).toHaveCount(0);

        // Jamais bloquant : l'enregistrement passe avec l'écart.
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(syllabus.matiere.enregistre)).toBeVisible();
        await expect(pageSyllabus.getByText(ECART_23_20)).toBeVisible();

        // Relu depuis le serveur par un autre contexte : l'écart est bien enregistré.
        await allerAuSyllabusViaStructure(pageAdmin, 'matiere');
        await expect(champTp(pageAdmin)).toHaveValue('7');
        await expect(pageAdmin.getByText(ECART_23_20)).toBeVisible();

        // Retour à 20 h : l'écart disparaît, en assertion.
        await champTp(pageSyllabus).fill('4');
        await expect(pageSyllabus.getByText(CONFORME_20)).toBeVisible();
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(syllabus.matiere.enregistre)).toBeVisible();
    });

    test('conflit de version entre deux onglets : le message canonique, rien d\'écrasé', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'matiere');
        const prerequis = pageSyllabus.getByLabel(syllabus.matiere.rubriques.prerequis);
        await expect(prerequis).toHaveValue('Savoir concevoir un logiciel.');

        // Second onglet, même session : il enregistre en premier.
        const second = await pageSyllabus.context().newPage();
        await allerAuSyllabusViaStructure(second, 'matiere');
        await second.getByLabel(syllabus.matiere.rubriques.prerequis).fill('Savoir concevoir un logiciel, et le tester.');
        await boutonEnregistrer(second).click();
        await expect(second.getByText(syllabus.matiere.enregistre)).toBeVisible();
        await second.close();

        // Le premier onglet tient une version périmée : 409, message canonique.
        await pageSyllabus.getByLabel(syllabus.matiere.rubriques.objectifs).fill('Objectifs écrits sur une version périmée.');
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(errors.codes.OPTIMISTIC_LOCKING_FAILURE)).toBeVisible();
        await expect(pageSyllabus.getByText(syllabus.matiere.enregistre)).toHaveCount(0);
    });

    test('UE : la description s\'enregistre sans toucher au nom ni aux ECTS', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'ue');
        await expect(pageSyllabus.getByRole('heading', { name: syllabus.ue.titre })).toBeVisible();

        const description = pageSyllabus.getByLabel(syllabus.ue.champDescription);
        await expect(description).toHaveValue('Concevoir et maintenir un logiciel dans la durée.');
        await expect(pageSyllabus.getByLabel(syllabus.responsable.rechercher)).toHaveValue(E2E.agent1);

        await description.fill('Concevoir, maintenir et faire évoluer un logiciel dans la durée.');
        await boutonEnregistrer(pageSyllabus).click();
        await expect(pageSyllabus.getByText(syllabus.ue.enregistre)).toBeVisible();

        // Le formulaire de structure de l'UE, relu sous la clé que le PUT a
        // reposée : nom et ECTS intacts. Sans garde : rien n'est plus modifié.
        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        await expect(pageSyllabus).toHaveURL(/\/ue\/\d+$/);
        await expect(pageSyllabus.getByRole('dialog')).toHaveCount(0);
        await expect(pageSyllabus.getByLabel(structure.ue.champNom)).toHaveValue(E2E.ue);
        await expect(pageSyllabus.getByLabel('ECTS')).toHaveValue('5');
        // Le rôle SYLLABUS_ECRITURE seul ne modifie pas la structure.
        await expect(pageSyllabus.getByRole('button', { name: crud.form.mettreAJour })).toHaveCount(0);
    });

    test('la garde s\'interpose sur une rubrique non enregistrée', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'matiere');
        const activites = pageSyllabus.getByLabel(syllabus.matiere.rubriques.activites);
        await activites.fill('Cours alternant avec des TP.');

        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        const garde = pageSyllabus.getByRole('dialog', { name: crud.unsavedDialog.titre });
        await expect(garde).toBeVisible();
        await garde.getByRole('button', { name: crud.unsavedDialog.rester }).click();
        await expect(garde).toHaveCount(0);
        await expect(activites).toHaveValue('Cours alternant avec des TP.');

        await pageSyllabus.getByRole('button', { name: crud.form.annuler }).click();
        await garde.getByRole('button', { name: crud.unsavedDialog.quitter }).click();
        await expect(pageSyllabus).toHaveURL(/\/matiere\/\d+$/);
        await expect(pageSyllabus.getByRole('heading', { name: crud.form.titreDetails })).toBeVisible();
    });

    test('bascule fr/en : la fiche suit la langue', async ({ pageAdmin }) => {
        await allerAuSyllabusViaStructure(pageAdmin, 'matiere');
        await expect(pageAdmin.getByRole('heading', { name: syllabus.matiere.titre })).toBeVisible();

        await pageAdmin.getByRole('button', { name: app.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'English' }).click();
        await expect(pageAdmin.getByRole('heading', { name: syllabusEn.matiere.titre })).toBeVisible();
        await expect(pageAdmin.getByLabel(syllabusEn.matiere.rubriques.contexte)).toBeVisible();
        await expect(pageAdmin.getByText(interpoler(syllabusEn.matiere.total.conforme, { total: '20' }))).toBeVisible();

        await pageAdmin.getByRole('button', { name: appEn.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Français' }).click();
        await expect(pageAdmin.getByRole('heading', { name: syllabus.matiere.titre })).toBeVisible();
        await attendreChargementInitial(pageAdmin);
    });
});
