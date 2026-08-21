/**
 * Routes du workflow Structure.
 *
 * La descente hiérarchique vient de `WORKFLOW_CATALOG` : ni les chemins ni
 * l'ordre des niveaux ne sont écrits ici.
 */

import { type ReactNode } from 'react';
import { Box } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';

import type { FieldValues } from 'react-hook-form';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';
import type { CrudComponentProps } from '../../services/crud/routes';

import { CATALOG_WORKFLOW, MEMBRES } from './def';
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption, ACTION_PERIODES } from '../structure/Options';
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

/** Descente vers les groupes de l'option, propre au catalogue. */
const ACTION_GROUPES: ActionNavigation<FieldValues> = {
    id: 'groupes',
    libelle: 'Gérer les groupes',
    icone: GroupsIcon,
    segment: GROUPE,
};

/** Segment des membres d'un groupe, seul écran hors CRUD du workflow. */
export function createCatalogHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CATALOG, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, EDITION),
            [PROMOTION]: enrober(CrudPromotion, EDITION),
            [OPTION]: enrober(CrudOption, { ...EDITION, actionsLigne: [ACTION_GROUPES, ACTION_PERIODES] }),
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
