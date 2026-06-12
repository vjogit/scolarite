import { createCrudRoutes, createRoute, type CrudComponentProps } from "../../services/crud/routes";
import { CrudFormation } from "../structure/Formation";
import { CrudOption } from "../structure/Options";
import { CrudPeriode, type Periode } from "../structure/Periode";
import { CrudPromotion } from "../structure/Promotion";
import { Box, Tooltip, IconButton } from '@mui/material';
import BalanceIcon from '@mui/icons-material/Balance';
import { PROMOTION, OPTION, PERIODE, FORMATION, } from "../structure/def";
import { JURY, JURY_WORKFLOW } from "./def";
import { JuryPeriode } from "./JuryPeriode";
import { useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { MRT_Row } from "material-react-table";
import { useRootPath } from "../../services/crud/useRootPath";


export function createJuryHierarchyRoutes() {
    const formationPath = FORMATION;
    const promotionPath = `${formationPath}/:formationId/${PROMOTION}`;
    const optionPath = `${promotionPath}/:promotionId/${OPTION}`;
    const periodePath = `${optionPath}/:optionId/${PERIODE}`;
    const juryPath = `${periodePath}/:periodeId/${JURY}`;

    return [
        createCrudRoutes(formationPath, CustomCrudFormation),
        createCrudRoutes(promotionPath, CustomCrudPromotion),
        createCrudRoutes(optionPath, CustomCrudOption),
        createCrudRoutes(periodePath, CustomCrudPeriode),
        createRoute(juryPath, JuryPeriode)
    ];
}

function CustomCrudFormation({ mode }: CrudComponentProps) {
    return <CrudFormation workflow={JURY_WORKFLOW} mode={mode} isAction={true} isTopToolbar={false} />;
}

function CustomCrudPromotion({ mode }: CrudComponentProps) {
    return <CrudPromotion workflow={JURY_WORKFLOW} mode={mode} isAction={true} isTopToolbar={false} />;
}

function CustomCrudOption({ mode }: CrudComponentProps) {
    return <CrudOption workflow={JURY_WORKFLOW} mode={mode} isAction={true} isTopToolbar={false} />;
}

function CustomCrudPeriode({ mode }: CrudComponentProps) {
    const navigate = useNavigate();
    const rootPath = useRootPath(mode);

    const renderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Periode>, defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <Tooltip title="Jury">
                <IconButton onClick={() => navigate(`${location.pathname}/${(row.original as any).id}/${JURY}`)}>
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
