
import { createCrudRoutes, type CrudComponentProps } from "../../services/crud/routes";
import { CrudPromotion, type Promotion } from "../structure/Promotion";

import { useState, type ReactNode, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Box, IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import type { MRT_Row } from 'material-react-table';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { TOEIC, MOBILITE, CERTIFICATION_WORKFLOW } from "./def";
import { FORMATION, PROMOTION } from "../structure/def";
import { CrudMobiliteInternationale } from "./MobiliteInternationale";
import { CrudFormation } from "../structure/Formation";
import { CrudToeic } from "./Toic";

export function createCertificationHierarchyRoutes() {
    const formationPath = FORMATION;
    const promotionPath = `${formationPath}/:formationId/${PROMOTION}`;
    const toeicPath = `${promotionPath}/:promotionId/${TOEIC}`;
    const voyagePath = `${promotionPath}/:promotionId/${MOBILITE}`;

    return [
        createCrudRoutes(formationPath, CustomCrudFormation),
        createCrudRoutes(promotionPath, CustomCrudPromotion,),

        createCrudRoutes(toeicPath, CustomCrudToeic),
        createCrudRoutes(voyagePath, CustomMobiliteInternationale),

    ];
}

function CustomCrudFormation({ mode }: CrudComponentProps) {
    return <CrudFormation workflow={CERTIFICATION_WORKFLOW} mode={mode} isAction={true} isTopToolbar={false} />;
}

function CustomCrudPromotion({ mode }: CrudComponentProps) {
    const renderAction = ({
        defaultActions,
        row
    }: {
        defaultActions: ReactNode;
        row: MRT_Row<Promotion>
    }) => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <CertificationMenu row={row} />
        </Box>
    )
    return <CrudPromotion workflow={CERTIFICATION_WORKFLOW} mode={mode} isAction={true} isTopToolbar={false} renderRowActions={renderAction} />;
}

function CertificationMenu({ row }: { row: MRT_Row<Promotion> }) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const location = useLocation();
    const navigate = useNavigate();

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleNavigate = (type: string) => {
        const path = `${location.pathname}/${row.original.id}/${type}`;
        navigate(path);
        handleClose();
    };

    return (
        <>
            <Tooltip title="Gérer les certifications">
                <IconButton onClick={handleClick}>
                    <WorkspacePremiumIcon />
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
                <MenuItem onClick={() => handleNavigate(TOEIC)}>Toeic</MenuItem>
                <MenuItem onClick={() => handleNavigate(MOBILITE)}>Mobilite</MenuItem>
            </Menu>
        </>
    );
}


function CustomCrudToeic({ mode }: CrudComponentProps) {
    return <CrudToeic workflow={CERTIFICATION_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true} />;
}

function CustomMobiliteInternationale({ mode }: CrudComponentProps) {
    return <CrudMobiliteInternationale workflow={CERTIFICATION_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true} />;
}


