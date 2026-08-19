/**
 * Routes du workflow Certifications.
 *
 * Le seul workflow qui ne descend pas toute la hiérarchie : `WORKFLOW_CERTIFICATION`
 * s'arrête à la promotion, sous laquelle deux écrans frères se greffent.
 */

import { useState, type ReactNode, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Box, IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import type { MRT_Row } from 'material-react-table';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CERTIFICATION } from '../../services/context/workflows';
import type { CrudComponentProps } from '../../services/crud/routes';

import { FORMATION, PROMOTION } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion, type Promotion } from '../structure/Promotion';
import { TOEIC, MOBILITE, CERTIFICATION_WORKFLOW } from './def';
import { CrudToeic } from './Toic';
import { CrudMobiliteInternationale } from './MobiliteInternationale';

/** Niveau traversé pour atteindre la promotion : pas de barre d'outils. */
const TRAVERSEE: ReglagesNiveau = {
    workflow: CERTIFICATION_WORKFLOW,
    isAction: true,
    isTopToolbar: false,
};

/** Les deux écrans terminaux, eux, portent leur propre barre d'outils. */
const CERTIFICATION: ReglagesNiveau = {
    workflow: CERTIFICATION_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

export function createCertificationHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CERTIFICATION, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: CustomCrudPromotion,
        },
        greffes: [
            { segment: TOEIC, parent: PROMOTION, composant: enrober(CrudToeic, CERTIFICATION) },
            { segment: MOBILITE, parent: PROMOTION, composant: enrober(CrudMobiliteInternationale, CERTIFICATION) },
        ],
    });
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
