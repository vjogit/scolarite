/**
 * Routes du workflow Programme : la descente hiérarchique de
 * `WORKFLOW_PROGRAMME`, puis le planning greffé sous la période.
 */

import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_PROGRAMME } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';
import i18n from '../../i18n/config';

import { FORMATION, PROMOTION, OPTION, PERIODE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode } from '../structure/Periode';
import { PROGRAMME, PROGRAMME_WORKFLOW } from './def';
import { Planning } from './Planning';

/**
 * On consulte la structure depuis le programme, on ne la modifie pas :
 * `isReadOnly` neutralise le mode édition mémorisé pour le workflow.
 */
const TRAVERSEE: ReglagesNiveau = {
    workflow: PROGRAMME_WORKFLOW,
    isAction: true,
    isReadOnly: true,
    isTopToolbar: false,
};

/**
 * Le planning de la période. Seule action métier de l'écran : depuis le
 * programme, on ne descend pas dans les UE.
 */
function actionProgramme(t?: TFunction<'programme'>): ActionNavigation<FieldValues> {
    const traduire = t ?? (i18n.t as unknown as TFunction<'programme'>);
    return {
        id: 'programme',
        libelle: traduire('actionProgrammeLibelle'),
        icone: CalendarMonthIcon,
        segment: PROGRAMME,
    };
}

export function createProgrammeHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_PROGRAMME, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: enrober(CrudPeriode, {
                ...TRAVERSEE,
                isTopToolbar: true,
                actionsLigne: [actionProgramme()],
            }),
        },
        greffes: [
            { segment: PROGRAMME, parent: PERIODE, ecran: Planning },
        ],
    });
}
