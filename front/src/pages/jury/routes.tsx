/**
 * Routes du workflow Jury : la descente hiérarchique de `WORKFLOW_JURY`,
 * puis l'écran de délibération greffé sous la période.
 */

import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { Scale } from 'lucide-react';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_JURY } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';
import i18n from '../../i18n/config';

import { FORMATION, PROMOTION, OPTION, PERIODE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode } from '../structure/Periode';
import { JURY, JURY_WORKFLOW } from './def';
import { JuryPeriode } from './JuryPeriode';

/** Niveaux traversés pour atteindre la période : pas de barre d'outils. */
const TRAVERSEE: ReglagesNiveau = {
    workflow: JURY_WORKFLOW,
    isAction: true,
    isTopToolbar: false,
};

/**
 * La délibération de la période. Seule action métier de l'écran : depuis le
 * jury, on ne descend pas dans les UE.
 */
function actionJury(t?: TFunction<'jury'>): ActionNavigation<FieldValues> {
    const traduire = t ?? i18n.getFixedT(null, 'jury');
    return {
        id: 'jury',
        // Fermeture et non chaîne : cette action est créée une seule fois, au
        // chargement du module — une chaîne figerait la langue de démarrage.
        libelle: () => traduire('actionJuryLibelle'),
        icone: Scale,
        segment: JURY,
    };
}

export function createJuryHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_JURY, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: enrober(CrudPeriode, {
                ...TRAVERSEE,
                isTopToolbar: true,
                actionsLigne: [actionJury()],
            }),
        },
        greffes: [
            { segment: JURY, parent: PERIODE, ecran: JuryPeriode },
        ],
    });
}
