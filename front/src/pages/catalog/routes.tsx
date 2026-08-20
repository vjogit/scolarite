/**
 * Routes du workflow Structure.
 *
 * La descente hiérarchique vient de `WORKFLOW_CATALOG` : ni les chemins ni
 * l'ordre des niveaux ne sont écrits ici.
 */

import { type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import { useNavigate } from 'react-router';
import type { MRT_Row } from 'material-react-table';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import type { CrudComponentProps } from '../../services/crud/routes';
import { useCrudContext } from '../../services/crud/CrudContext';

import { CATALOG_WORKFLOW } from './def';
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption, OptionDefaultAction, type Option } from '../structure/Options';
import { CrudPeriode } from '../structure/Periode';
import { CrudUe } from '../structure/Ue';
import { CrudMatiere } from '../structure/Matiere';
import { CrudGroupe } from '../structure/Groupe';
import { GroupeUserPage } from '../structure/GroupeUserPage';
import { PeriodeImportButton } from './PeriodeImportButton';
import { PeriodeExportButton } from './PeriodeExportButton';

/** Le catalogue est le workflow d'édition : rien n'y est en lecture seule. */
const EDITION: ReglagesNiveau = {
    workflow: CATALOG_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

/** Segment des membres d'un groupe, seul écran hors CRUD du workflow. */
const MEMBRES = 'user';

export function createCatalogHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CATALOG, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, EDITION),
            [PROMOTION]: enrober(CrudPromotion, EDITION),
            [OPTION]: CustomCrudOption,
            [PERIODE]: CustomCrudPeriode,
        },
        greffes: [
            { segment: UES, parent: PERIODE, composant: enrober(CrudUe, EDITION) },
            { segment: MATIERE, parent: UES, composant: enrober(CrudMatiere, EDITION) },
            { segment: GROUPE, parent: OPTION, composant: enrober(CrudGroupe, EDITION) },
            { segment: MEMBRES, parent: GROUPE, ecran: GroupeUserPage },
        ],
    });
}

function CustomCrudOption({ mode }: CrudComponentProps) {
    const renderRowActions = ({
        row,
        defaultActions,
    }: {
        row: MRT_Row<Option>,
        defaultActions: ReactNode;
        peutEcrire: boolean;
    }) => {
        const navigate = useNavigate();
        const { rootPath } = useCrudContext();
        return (
            <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {defaultActions}
                <Tooltip title="Gérer les groupes">
                    <IconButton onClick={() => navigate(`/${rootPath}/${row.getValue('id')}/${GROUPE}`)}>
                        <GroupsIcon />
                    </IconButton>
                </Tooltip>
                <OptionDefaultAction optionId={row.getValue('id')} rootPath={rootPath}/>
            </Box>
        )
    }


    return <CrudOption workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} renderRowActions={renderRowActions} />;
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const renderTopToolbar = ({
        defaultActions,
        peutEcrire,
    }: {
        defaultActions: ReactNode;
        peutEcrire: boolean;
    }) => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {/* Import : une écriture de structure ; l'export reste une lecture,
                offerte à tous. */}
            {peutEcrire && <PeriodeImportButton />}
            <PeriodeExportButton />
        </Box>
    )
    return <CrudPeriode workflow={CATALOG_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        renderTopToolbarCustomActions={renderTopToolbar}
    />;
}
