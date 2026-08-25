import { test, expect } from './fixtures/roles';
import { E2E, allerALaGrilleDeSaisie, allerJusquaPeriode, attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler } from './aide/i18n';

const creerUneFormation = interpoler(crud.creationInvite_f, { nom: 'formation' });

test.describe('Droits par rôle', () => {
    test('ADMIN voit les actions d\'écriture de la Structure', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('tab', { name: app.workflows.structure }).click();
        await pageAdmin.waitForLoadState('networkidle');
        await expect(pageAdmin.getByRole('button', { name: creerUneFormation }).first()).toBeVisible();
    });

    test('CONSULTATION seul : aucune action d\'écriture sur la Structure', async ({ pageConsultation }) => {
        await pageConsultation.goto('/');
        await attendreChargementInitial(pageConsultation);
        await pageConsultation.getByRole('tab', { name: app.workflows.structure }).click();
        await pageConsultation.waitForLoadState('networkidle');
        await expect(pageConsultation.getByRole('heading', { name: app.workflows.structure })).toBeVisible();
        await expect(pageConsultation.getByRole('button', { name: creerUneFormation })).toHaveCount(0);
    });

    test('CONSULTATION seul : /new en URL directe n\'atteint pas le formulaire', async ({ pageConsultation }) => {
        await pageConsultation.goto('/catalog_context/formation');
        await attendreChargementInitial(pageConsultation);

        // Navigation interne (pushState) : isole le garde de rôle de
        // `Crud.tsx` du défaut de rebond Keycloak sur `goto`, déjà prouvé par
        // navigation.spec.ts et sans rapport avec les droits testés ici.
        await pageConsultation.evaluate(() => {
            history.pushState({}, '', '/catalog_context/formation/new');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(pageConsultation).toHaveURL(/\/catalog_context\/formation$/);
        await expect(pageConsultation.getByRole('textbox', { name: 'Titre de la formation' })).toHaveCount(0);
    });

    test('CONSULTATION seul : Corbeille absente du menu et inaccessible en URL directe', async ({ pageConsultation }) => {
        await pageConsultation.goto('/');
        await attendreChargementInitial(pageConsultation);
        await expect(pageConsultation.getByRole('link', { name: app.nav.corbeille })).toHaveCount(0);

        // Navigation interne (pushState), pas un `goto('/corbeille')` : un
        // rechargement plein perdrait le chemin avant même d'atteindre le
        // garde de rôle — défaut distinct, déjà prouvé par navigation.spec.ts.
        await pageConsultation.evaluate(() => {
            history.pushState({}, '', '/corbeille');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(pageConsultation.getByText(app.roleGuard.accesNonAutorise)).toBeVisible();
    });

    test('CONSULTATION seul : la grille de notes est en lecture seule', async ({ pageConsultation }) => {
        await allerALaGrilleDeSaisie(pageConsultation);
        await expect(pageConsultation.getByRole('textbox', { name: `Note de ${E2E.eleve1}` })).toBeDisabled();
    });

    test('NOTES_ECRITURE seul : saisie possible dans la grille', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);
        await expect(pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve1}` })).toBeEnabled();
    });

    test('NOTES_ECRITURE seul : Structure en lecture', async ({ pageSaisie }) => {
        await pageSaisie.goto('/');
        await attendreChargementInitial(pageSaisie);
        await pageSaisie.getByRole('tab', { name: app.workflows.structure }).click();
        await pageSaisie.waitForLoadState('networkidle');
        await expect(pageSaisie.getByRole('button', { name: creerUneFormation })).toHaveCount(0);
    });

    test('NOTES_ECRITURE seul : délibération de jury absente', async ({ pageSaisie }) => {
        await allerJusquaPeriode(pageSaisie, 'jury');
        await expect(pageSaisie.getByRole('button', { name: /^Délibérer/ })).toHaveCount(0);
    });
});
