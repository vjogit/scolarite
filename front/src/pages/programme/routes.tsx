/**
 * Routes du workflow Programme : la descente hiérarchique de
 * `WORKFLOW_PROGRAMME`, puis le planning greffé sous la période.
 */

import { useCallback, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useNavigate } from 'react-router';
import type { MRT_Row } from 'material-react-table';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_PROGRAMME } from '../../services/context/workflows';
import type { CrudComponentProps } from '../../services/crud/routes';
import { useRootPath } from '../../services/crud/useRootPath';

import { FORMATION, PROMOTION, OPTION, PERIODE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode, type Periode } from '../structure/Periode';
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

export function createProgrammeHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_PROGRAMME, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: CustomCrudPeriode,
        },
        greffes: [
            { segment: PROGRAMME, parent: PERIODE, ecran: Planning },
        ],
    });
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const rootPath = useRootPath(mode);
    const navigate = useNavigate();


    const renderRowActions = useCallback(({ row}: { row: MRT_Row<Periode>, defaultActions: ReactNode, peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Tooltip title="Programme">
                <IconButton onClick={() => navigate(`${location.pathname}/${row.getValue('id')}/${PROGRAMME}`)}>
                    <CalendarMonthIcon />
                </IconButton>
            </Tooltip>

        </Box>
    ), [rootPath]);

    return <CrudPeriode workflow={PROGRAMME_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={true} renderRowActions={renderRowActions} />;
}
