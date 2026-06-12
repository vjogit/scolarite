import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';

import { CommonBreadcrumbs, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE, ENDPOINT_FORMATION, ENDPOINT_MATIERE, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION, ENDPOINT_UES, ENDPOINT_GROUPE } from '../structure/def';


const STORAGE_KEY = 'catalog_last_path';
export const CATALOG_WORKFLOW = 'catalog_context'


// ─── Contexte du catalogue ────────────────────────────────────────────────────

const CATALOG_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: `${ENDPOINT_FORMATION}`, nameResolver: (data: any) => data.name },
    [PROMOTION]: { apiEntity: PROMOTION, path: `${ENDPOINT_PROMOTION}`, nameResolver: (data: any) => data.name },
    [OPTION]: { apiEntity: OPTION, path: `${ENDPOINT_OPTION}`, nameResolver: (data: any) => data.name },
    [PERIODE]: { apiEntity: PERIODE, path: `${ENDPOINT_PERIODE}`, nameResolver: (data: any) => data.name },
    [UES]: { apiEntity: UES, path: `${ENDPOINT_UES}`, nameResolver: (data: any) => data.name },
    [MATIERE]: { apiEntity: MATIERE, path: `${ENDPOINT_MATIERE}`, nameResolver: (data: any) => data.name },
    [GROUPE]: { apiEntity: GROUPE, path: `${ENDPOINT_GROUPE}`, nameResolver: (data: any) => data.name, filteredSegments: ['user'] },
}

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function CatalogLayout() {
    const location = useLocation();

    useEffect(() => {
        if (!location.pathname.endsWith(`/${CATALOG_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonBreadcrumbs
                context={CATALOG_WORKFLOW}
                label='Formations'
                entityMap={CATALOG_ENTITY_MAP}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

export function CatalogIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || FORMATION;

    return <Navigate to={target} replace />;
}
