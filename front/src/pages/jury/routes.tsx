/**
 * Routes du workflow Jury : la descente hiérarchique de `WORKFLOW_JURY`,
 * puis l'écran de délibération greffé sous la période.
 */

import type { FieldValues } from 'react-hook-form';
import BalanceIcon from '@mui/icons-material/Balance';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_JURY } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';

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
const ACTION_JURY: ActionNavigation<FieldValues> = {
    id: 'jury',
    libelle: 'Jury',
    icone: BalanceIcon,
    segment: JURY,
};

export function createJuryHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_JURY, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: enrober(CrudPeriode, {
                ...TRAVERSEE,
                isTopToolbar: true,
                actionsLigne: [ACTION_JURY],
            }),
        },
        greffes: [
            { segment: JURY, parent: PERIODE, ecran: JuryPeriode },
        ],
    });
}
