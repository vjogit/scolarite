import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';

import { CommonBreadcrumbs, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { FORMATION, PROMOTION, OPTION, PERIODE, ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION } from '../structure/def';


const STORAGE_KEY = 'programme_last_path';
export const PROGRAMME_WORKFLOW = 'programme_context'


// ─── Contexte du programmeue ────────────────────────────────────────────────────

const PROGRAMME_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: `${ENDPOINT_FORMATION}`, nameResolver: (data: any) => data.name },
    [PROMOTION]: { apiEntity: PROMOTION, path: `${ENDPOINT_PROMOTION}`, nameResolver: (data: any) => data.name },
    [OPTION]: { apiEntity: OPTION, path: `${ENDPOINT_OPTION}`, nameResolver: (data: any) => data.name },
    [PERIODE]: { apiEntity: PERIODE, path: `${ENDPOINT_PERIODE}`, nameResolver: (data: any) => data.name,filteredSegments: ['programme'] },
}

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function ProgrammeLayout() {
    const location = useLocation();

    useEffect(() => {
        if (!location.pathname.endsWith(`/${PROGRAMME_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonBreadcrumbs
                context={PROGRAMME_WORKFLOW}
                label='Programme'
                entityMap={PROGRAMME_ENTITY_MAP}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

export function ProgrammeIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || FORMATION;

    return <Navigate to={target} replace />;
}
