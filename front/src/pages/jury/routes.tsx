/**
 * Routes du workflow Jury : la descente hiérarchique de `WORKFLOW_JURY`,
 * puis l'écran de délibération greffé sous la période.
 */

import { useCallback, type ReactNode } from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';
import BalanceIcon from '@mui/icons-material/Balance';
import { useNavigate } from 'react-router';
import type { MRT_Row } from 'material-react-table';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_JURY } from '../../services/context/workflows';
import type { CrudComponentProps } from '../../services/crud/routes';
import { useRootPath } from '../../services/crud/useRootPath';

import { FORMATION, PROMOTION, OPTION, PERIODE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode, type Periode } from '../structure/Periode';
import { JURY, JURY_WORKFLOW } from './def';
import { JuryPeriode } from './JuryPeriode';

/** Niveaux traversés pour atteindre la période : pas de barre d'outils. */
const TRAVERSEE: ReglagesNiveau = {
    workflow: JURY_WORKFLOW,
    isAction: true,
    isTopToolbar: false,
};

export function createJuryHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_JURY, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: CustomCrudPeriode,
        },
        greffes: [
            { segment: JURY, parent: PERIODE, ecran: JuryPeriode },
        ],
    });
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {
    const navigate = useNavigate();
    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Periode>, defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <Tooltip title="Jury">
                <IconButton onClick={() => navigate(`${location.pathname}/${row.getValue('id')}/${JURY}`)}>
                    <BalanceIcon />
                </IconButton>
            </Tooltip>
        </Box>
    ), [rootPath]);


    return <CrudPeriode workflow={JURY_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        renderRowActions={renderRowActions}
    />;
}
