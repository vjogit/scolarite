/**
 * Routes du workflow Notes.
 *
 * Le cas limite du lot : au-delà de la descente hiérarchique décrite par
 * `WORKFLOW_NOTE`, le workflow prolonge la structure (UE, matière, contrôle)
 * puis greffe un écran de notes sous chacun de ces quatre derniers niveaux.
 * Ce sont quatre greffes de même segment `note` sur quatre parents distincts.
 */

import { useCallback, type ReactNode } from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';
import GradingIcon from '@mui/icons-material/Grading';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useNavigate } from 'react-router';
import type { MRT_Row } from 'material-react-table';
import type { FieldValues } from 'react-hook-form';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import type { CrudComponentProps } from '../../services/crud/routes';
import { useRootPath } from '../../services/crud/useRootPath';

import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode, PeriodeDefaultAction, type Periode } from '../structure/Periode';
import { CrudUe, UeDefaultAction, type Ue } from '../structure/Ue';
import { CrudMatiere, type Matiere } from '../structure/Matiere';

import { CONTROLE, NOTE, NOTE_WORKFLOW } from './def';
import { CrudControle, type Controle } from './Controle';
import { CrudNotePeriode } from './NotePeriode';
import { CrudNoteUniteEnseignement } from './NoteUniteEnseignement';
import { CrudNoteMatiere } from './NoteMatiere';
import { CrudNoteControle } from './NoteControle';

/**
 * On consulte la structure depuis les notes, on ne la modifie pas.
 * `isReadOnly` est ici la propriété critique : le mode édition est mémorisé
 * pour tout le workflow, et l'écran des contrôles permet de l'activer.
 */
const TRAVERSEE: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: true,
    isReadOnly: true,
    isTopToolbar: false,
};

/** Écrans de notes en consultation : aucune action de ligne. */
const NOTES_CONSULTEES: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: false,
    isTopToolbar: true,
};

/** Seul l'écran des notes d'un contrôle expose les actions de ligne. */
const NOTES_SAISIES: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

export function createNoteHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_NOTE, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: CustomCrudPeriode,
        },
        greffes: [
            { segment: UES, parent: PERIODE, composant: CustomCrudUe },
            { segment: MATIERE, parent: UES, composant: CustomCrudMatiere },
            { segment: CONTROLE, parent: MATIERE, composant: CustomCrudControle },

            { segment: NOTE, parent: PERIODE, composant: enrober(CrudNotePeriode, NOTES_CONSULTEES) },
            { segment: NOTE, parent: UES, composant: enrober(CrudNoteUniteEnseignement, NOTES_CONSULTEES) },
            { segment: NOTE, parent: MATIERE, composant: enrober(CrudNoteMatiere, NOTES_CONSULTEES) },
            { segment: NOTE, parent: CONTROLE, composant: enrober(CrudNoteControle, NOTES_SAISIES) },
        ],
    });
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Periode>, defaultActions: ReactNode, peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <NoteDefaultAction row={row} />
            <PeriodeDefaultAction periodeId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);

    return <CrudPeriode workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={true} renderRowActions={renderRowActions} />;
}

function CustomCrudUe({ mode }: CrudComponentProps) {
    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Ue>, defaultActions: ReactNode, peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <NoteDefaultAction row={row} />
            <UeDefaultAction ueId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);
    return <CrudUe workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} renderRowActions={renderRowActions} />;
}



function CustomCrudMatiere({ mode }: CrudComponentProps) {

    const navigate = useNavigate();
    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row }: { row: MRT_Row<Matiere> }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <NoteDefaultAction row={row} />
            <Tooltip title="Gérer les controles">
                <IconButton onClick={() => navigate(`/${rootPath}/${row.getValue('id')}/${CONTROLE}`)}>
                    <ListAltIcon />
                </IconButton>
            </Tooltip>
        </Box>
    ), []);

    return <CrudMatiere workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} renderRowActions={renderRowActions} />;
}

function CustomCrudControle({ mode }: CrudComponentProps) {

    const renderRowActions = useCallback(({ row , defaultActions}: { row: MRT_Row<Controle> , defaultActions: ReactNode, }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <NoteDefaultAction row={row} />
        </Box>
    ), []);
    return <CrudControle workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} renderRowActions={renderRowActions} />;
}

function NoteDefaultAction<T extends FieldValues>({ row }: { row: MRT_Row<T> }): ReactNode {
    const navigate = useNavigate()
    return (
        <Tooltip title="Gérer les notes">
            <IconButton onClick={() => navigate(`${location.pathname}/${row.getValue('id')}/${NOTE}`)}>
                <GradingIcon />
            </IconButton>
        </Tooltip>

    )
}
