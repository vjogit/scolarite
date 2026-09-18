import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { allerAuSyllabusViaStructure } from './aide/hierarchieE2E';
import { interpoler, syllabus } from './aide/i18n';

/**
 * Le panneau de relecture de la traduction anglaise (lot 6), sous la fiche de
 * la matière et sous le syllabus de l'UE.
 *
 * Le traducteur de la stack e2e est le connecteur FACTICE (`IA_PROVIDER` de
 * config-local.env / config-ci.env) : aucun appel réseau, le texte revient
 * préfixé de « [en] ». La suite n'appelle jamais un modèle réel.
 *
 * État semé : aucune traduction (la hiérarchie E2E est recréée à chaque pose,
 * les traductions partent en cascade). Dépendances d'état À L'INTÉRIEUR de ce
 * fichier, dans l'ordre d'écriture : la lecture seule voit « pas encore
 * traduite » ; la traduction automatique puis la relecture laissent une
 * traduction relue ; la péremption modifie le contexte français et retraduit.
 * Ce fichier vient alphabétiquement après `captures*.spec.ts` et
 * `syllabus.spec.ts`, qui voient donc l'état du seed sans traduction.
 */

const T = syllabus.traduction;
/** Le début d'un libellé interpolé, jusqu'à sa première variable. */
const debut = (libelle: string) => libelle.split('{{')[0] ?? libelle;

const champContexte = (page: Page) => page.getByLabel(T.champs.contexte);
const boutonTraduire = (page: Page) => page.getByRole('button', { name: T.traduire });
const boutonRelue = (page: Page) => page.getByRole('button', { name: T.marquerRelue });
// `exact` : « Enregistrer comme relue » et « Enregistrer les compétences » commencent pareil.
const boutonEnregistrerSource = (page: Page) => page.getByRole('button', { name: syllabus.enregistrer, exact: true });
const panneau = (page: Page) => page.getByRole('region', { name: T.titre });

test.describe('Syllabus — traduction anglaise du contenu', () => {
    test('CONSULTATION seul : le panneau se lit, rien ne s\'édite ni ne se traduit', async ({ pageConsultation }) => {
        await allerAuSyllabusViaStructure(pageConsultation, 'matiere');
        await expect(pageConsultation.getByRole('heading', { name: T.titre })).toBeVisible();
        await expect(panneau(pageConsultation).getByText(T.statut.absente)).toBeVisible();
        await expect(panneau(pageConsultation).getByText(/Les systèmes logiciels évoluent vite/)).toBeVisible();
        await expect(champContexte(pageConsultation)).toBeDisabled();
        await expect(champContexte(pageConsultation)).toHaveValue('');
        await expect(boutonTraduire(pageConsultation)).toHaveCount(0);
        await expect(boutonRelue(pageConsultation)).toHaveCount(0);
    });

    test('SYLLABUS_ECRITURE : la machine propose, le rédacteur dispose', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'matiere');
        await expect(panneau(pageSyllabus).getByText(T.statut.absente)).toBeVisible();

        // Première traduction : pas de confirmation, tout s'enregistre en « automatique ».
        await boutonTraduire(pageSyllabus).click();
        await expect(pageSyllabus.getByText(T.traduit)).toBeVisible();
        await expect(pageSyllabus.getByRole('dialog')).toHaveCount(0);
        await expect(champContexte(pageSyllabus)).toHaveValue(/^\[en\] Les systèmes logiciels évoluent vite/);
        await expect(pageSyllabus.getByLabel(T.champs.objectifs)).toHaveValue(/^\[en\] /);
        await expect(panneau(pageSyllabus).getByText(debut(T.statut.automatique))).toContainText('factice/test');
        // Une rubrique sans texte français n'a pas de ligne dans le panneau.
        await expect(pageSyllabus.getByLabel(T.champs.plan_cours)).toHaveCount(0);

        // Relecture : le rédacteur corrige et marque relue ; l'état survit au rechargement.
        await champContexte(pageSyllabus).fill('Software systems evolve quickly and rely on many libraries.');
        await boutonRelue(pageSyllabus).click();
        await expect(pageSyllabus.getByText(T.enregistre)).toBeVisible();
        await expect(panneau(pageSyllabus).getByText(debut(T.statut.relue))).toBeVisible();

        await pageSyllabus.reload();
        await expect(champContexte(pageSyllabus)).toHaveValue('Software systems evolve quickly and rely on many libraries.');
        await expect(panneau(pageSyllabus).getByText(debut(T.statut.relue))).toBeVisible();
        await expect(panneau(pageSyllabus).getByText(T.statut.perimee)).toHaveCount(0);
    });

    test('le français change : périmée, signalée, jamais bloquante — retraduire se confirme et fait perdre « relue »', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'matiere');
        await expect(panneau(pageSyllabus).getByText(debut(T.statut.relue))).toBeVisible();

        // Saisie française en cours : la traduction part du texte ENREGISTRÉ, le bouton attend.
        await pageSyllabus.getByLabel(syllabus.matiere.rubriques.contexte).fill('Les systèmes logiciels évoluent vite ; leurs dépendances aussi.');
        await expect(boutonTraduire(pageSyllabus)).toBeDisabled();
        await expect(pageSyllabus.getByText(T.traduireSourceModifiee)).toBeVisible();

        await boutonEnregistrerSource(pageSyllabus).click();
        await expect(pageSyllabus.getByText(syllabus.matiere.enregistre)).toBeVisible();
        await expect(panneau(pageSyllabus).getByRole('status')).toContainText(T.statut.perimee);
        await expect(panneau(pageSyllabus).getByText(/leurs dépendances aussi/)).toBeVisible();
        await expect(boutonTraduire(pageSyllabus)).toBeEnabled();

        // Retraduire une traduction relue : confirmation, et « Garder » ne change rien.
        await boutonTraduire(pageSyllabus).click();
        const dialogue = pageSyllabus.getByRole('dialog', { name: T.confirmation.titre });
        await expect(dialogue.getByText(T.confirmation.corpsRelue)).toBeVisible();
        await dialogue.getByRole('button', { name: T.confirmation.garder }).click();
        await expect(dialogue).toHaveCount(0);
        await expect(champContexte(pageSyllabus)).toHaveValue('Software systems evolve quickly and rely on many libraries.');

        await boutonTraduire(pageSyllabus).click();
        await dialogue.getByRole('button', { name: T.confirmation.remplacer }).click();
        await expect(pageSyllabus.getByText(T.traduit)).toBeVisible();
        await expect(champContexte(pageSyllabus)).toHaveValue(/^\[en\] .*leurs dépendances aussi/);
        await expect(panneau(pageSyllabus).getByText(debut(T.statut.automatique))).toBeVisible();
        await expect(panneau(pageSyllabus).getByText(T.statut.perimee)).toHaveCount(0);
    });

    test('la description de l\'UE se traduit par le même panneau', async ({ pageSyllabus }) => {
        await allerAuSyllabusViaStructure(pageSyllabus, 'ue');
        await expect(panneau(pageSyllabus).getByText(T.statut.absente)).toBeVisible();
        await boutonTraduire(pageSyllabus).click();
        await expect(pageSyllabus.getByText(T.traduit)).toBeVisible();
        await expect(pageSyllabus.getByLabel(T.champs.description)).toHaveValue('[en] Concevoir et maintenir un logiciel dans la durée.');
        await expect(panneau(pageSyllabus).getByText(interpoler(T.traduireEnCours, { fait: '1', total: '1' }))).toHaveCount(0);
    });
});
