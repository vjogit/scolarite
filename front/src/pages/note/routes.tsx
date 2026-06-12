// Helper pour générer toute la hiérarchie pour un contexte donné

import { createCrudRoutes, type CrudComponentProps } from "../../services/crud/routes";

import { CrudNoteMatiere } from "../note/NoteMatiere";
import { CrudNoteUniteEnseignement } from "../note/NoteUniteEnseignement";
import { CrudFormation } from "../structure/Formation";
import { CrudMatiere, type Matiere } from "../structure/Matiere";
import { CrudOption } from "../structure/Options";
import { CrudPeriode, PeriodeDefaultAction, type Periode } from "../structure/Periode";
import { CrudPromotion } from "../structure/Promotion";
import { CrudUe, UeDefaultAction, type Ue } from "../structure/Ue";

import { useCallback, type ReactNode } from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';

import { CONTROLE, NOTE, NOTE_WORKFLOW } from "./def";
import { CrudControle, type Controle } from "./Controle";
import { CrudNoteControle } from "./NoteControle";


import type { MRT_Row } from 'material-react-table';
import GradingIcon from '@mui/icons-material/Grading';
import { useNavigate } from 'react-router';

import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE } from "../structure/def";
import type { FieldValues } from "react-hook-form";
import { CrudNotePeriode } from "./NotePeriode";
import { useRootPath } from "../../services/crud/useRootPath";
import ListAltIcon from '@mui/icons-material/ListAlt';



export function createNoteHierarchyRoutes() {
    const formationPath = FORMATION;
    const promotionPath = `${formationPath}/:formationId/${PROMOTION}`;
    const optionPath = `${promotionPath}/:promotionId/${OPTION}`;
    const periodePath = `${optionPath}/:optionId/${PERIODE}`;
    const uePath = `${periodePath}/:periodeId/${UES}`;
    const matierePath = `${uePath}/:ueId/${MATIERE}`;
    const controlePath = `${matierePath}/:matiereId/${CONTROLE}`;

    const periodeNotePath = `${periodePath}/:periodeId/${NOTE}`;
    const ueNotePath = `${uePath}/:ueId/${NOTE}`;
    const matiereNotePath = `${matierePath}/:matiereId/${NOTE}`;
    const controleNotePath = `${controlePath}/:controleId/${NOTE}`;


    return [
        createCrudRoutes(formationPath, CustomCrudFormation),
        createCrudRoutes(promotionPath, CustomCrudPromotion),
        createCrudRoutes(optionPath, CustomCrudOption),
        createCrudRoutes(periodePath, CustomCrudPeriode),
        createCrudRoutes(uePath, CustomCrudUe),
        createCrudRoutes(matierePath, CustomCrudMatiere),
        createCrudRoutes(controlePath, CustomCrudControle),

        createCrudRoutes(periodeNotePath, CustomCrudNotePeriode),
        createCrudRoutes(ueNotePath, CustomCrudNoteUniteEnseignement),
        createCrudRoutes(matiereNotePath, CustomCrudNoteMatiere),
        createCrudRoutes(controleNotePath, CustomCrudNoteControle),
    ];
}

function CustomCrudFormation({ mode }: CrudComponentProps) {
    return <CrudFormation workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudPromotion({ mode }: CrudComponentProps) {
    return <CrudPromotion workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudOption({ mode }: CrudComponentProps) {
    return <CrudOption workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Periode>, defaultActions: ReactNode, isEditMode: boolean }): ReactNode => (
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

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Ue>, defaultActions: ReactNode, isEditMode: boolean }): ReactNode => (
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

function CustomCrudNotePeriode({ mode }: CrudComponentProps) {
    return <CrudNotePeriode workflow={NOTE_WORKFLOW} mode={mode} isAction={false} isTopToolbar={true} />;
}

function CustomCrudNoteUniteEnseignement({ mode }: CrudComponentProps) {
    return <CrudNoteUniteEnseignement workflow={NOTE_WORKFLOW} mode={mode} isAction={false} isTopToolbar={true} />;
}

function CustomCrudNoteMatiere({ mode }: CrudComponentProps) {
    return <CrudNoteMatiere workflow={NOTE_WORKFLOW} mode={mode} isAction={false} isTopToolbar={true} />;
}

function CustomCrudNoteControle({ mode }: CrudComponentProps) {
    return <CrudNoteControle workflow={NOTE_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}

