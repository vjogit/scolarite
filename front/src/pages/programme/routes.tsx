// Helper pour générer toute la hiérarchie pour un contexte donné

import { createCrudRoutes, createRoute, type CrudComponentProps } from "../../services/crud/routes";

import { CrudFormation } from "../structure/Formation";
import { CrudOption } from "../structure/Options";
import { CrudPeriode, type Periode } from "../structure/Periode";
import { CrudPromotion } from "../structure/Promotion";
import { FORMATION, PROMOTION, OPTION, PERIODE } from "../structure/def";
import { useRootPath } from "../../services/crud/useRootPath";
import { PROGRAMME_WORKFLOW } from "./ProgrammeLayout";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useCallback, type ReactNode } from "react";
import type { MRT_Row } from "material-react-table";
import { useNavigate } from "react-router";
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { PROGRAMME } from "./def";
import { Planning } from "./Planning";


export function createProgrammeHierarchyRoutes() {
    const formationPath = FORMATION;
    const promotionPath = `${formationPath}/:formationId/${PROMOTION}`;
    const optionPath = `${promotionPath}/:promotionId/${OPTION}`;
    const periodePath = `${optionPath}/:optionId/${PERIODE}`;
    const progammePath = `${periodePath}/:periodeId/${PROGRAMME}`;

    return [
        createCrudRoutes(formationPath, CustomCrudFormation),
        createCrudRoutes(promotionPath, CustomCrudPromotion),
        createCrudRoutes(optionPath, CustomCrudOption),
        createCrudRoutes(periodePath, CustomCrudPeriode),
        createRoute(progammePath, Planning)
    ];
}

function CustomCrudFormation({ mode }: CrudComponentProps) {
    return <CrudFormation workflow={PROGRAMME_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudPromotion({ mode }: CrudComponentProps) {
    return <CrudPromotion workflow={PROGRAMME_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudOption({ mode }: CrudComponentProps) {
    return <CrudOption workflow={PROGRAMME_WORKFLOW} mode={mode} isAction={true} isReadOnly={true} isTopToolbar={false} />;
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const rootPath = useRootPath(mode);
    const navigate = useNavigate();


    const renderRowActions = useCallback(({ row}: { row: MRT_Row<Periode>, defaultActions: ReactNode, isEditMode: boolean }): ReactNode => (
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


