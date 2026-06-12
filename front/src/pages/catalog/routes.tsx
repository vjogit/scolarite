// Helper pour générer toute la hiérarchie pour un contexte donné

import { createCrudRoutes, createRoute, type CrudComponentProps } from "../../services/crud/routes";
import { CrudMatiere } from "../structure/Matiere";
import { CrudPromotion } from "../structure/Promotion";
import { CrudUe } from "../structure/Ue";
import { type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { CATALOG_WORKFLOW } from "./CatalogLayout";
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE } from "../structure/def";
import { PeriodeImportButton } from "./PeriodeImportButton";
import { PeriodeExportButton } from "./PeriodeExportButton";
import { CrudFormation } from "../structure/Formation";
import { CrudOption, OptionDefaultAction, type Option } from "../structure/Options";
import { CrudPeriode } from "../structure/Periode";
import { CrudGroupe } from "../structure/Groupe";
import GroupsIcon from '@mui/icons-material/Groups';
import { useNavigate } from "react-router";
import { useCrudContext } from "../../services/crud/CrudContext";
import type { MRT_Row } from "material-react-table";
import { GroupeUserPage } from "../structure/GroupeUserPage";



export function createCatalogHierarchyRoutes() {
    const formationPath = FORMATION;
    const promotionPath = `${formationPath}/:formationId/${PROMOTION}`;
    const optionPath = `${promotionPath}/:promotionId/${OPTION}`;
    const periodePath = `${optionPath}/:optionId/${PERIODE}`;
    const uePath = `${periodePath}/:periodeId/${UES}`;
    const matierePath = `${uePath}/:ueId/${MATIERE}`;
    const groupePath = `${optionPath}/:optionId/${GROUPE}`;
    const groupeUserPath = `${groupePath}/:groupeId/user`;

    return [
        createCrudRoutes(formationPath, CustomCrudFormation),
        createCrudRoutes(promotionPath, CustomCrudPromotion),
        createCrudRoutes(optionPath, CustomCrudOption),
        createCrudRoutes(periodePath, CustomCrudPeriode),
        createCrudRoutes(uePath, CustomCrudUe),
        createCrudRoutes(matierePath, CustomCrudMatiere),
        createCrudRoutes(groupePath, CustomCrudGroupe),
        createRoute(groupeUserPath, GroupeUserPage),
    ];
}

function CustomCrudFormation({ mode }: CrudComponentProps) {
    return <CrudFormation workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}

function CustomCrudPromotion({ mode }: CrudComponentProps) {
    return <CrudPromotion workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}

function CustomCrudOption({ mode }: CrudComponentProps) {
    const renderRowActions = ({
        row,
        defaultActions,
    }: {
        row: MRT_Row<Option>,
        defaultActions: ReactNode;
        isEditMode: boolean;
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
        isEditMode,
    }: {
        defaultActions: ReactNode;
        isEditMode: boolean;
    }) => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {/* Import : composant React autonome avec ses propres hooks */}
            {isEditMode && <PeriodeImportButton />}
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

function CustomCrudUe({ mode }: CrudComponentProps) {
    return <CrudUe workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}

function CustomCrudMatiere({ mode }: CrudComponentProps) {
    return <CrudMatiere workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}

function CustomCrudGroupe({ mode }: CrudComponentProps) {
    return <CrudGroupe workflow={CATALOG_WORKFLOW} mode={mode} isAction={true} isTopToolbar={true} />;
}
