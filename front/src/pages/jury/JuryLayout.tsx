import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';

import { CommonBreadcrumbs, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { FORMATION, PROMOTION, OPTION, PERIODE, ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION } from '../structure/def';
import {  JURY, JURY_WORKFLOW } from './def';

const STORAGE_KEY = 'jury_last_path';

// ─── Contexte du Jury pour le Breadcrumb ──────────────────────────────────────
// Le breadcrumb du jury expose uniquement FORMATION → PROMOTION → OPTION → PERIODE.

const JURY_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: `${ENDPOINT_FORMATION}`, nameResolver: (data: any) => data.name },
    [PROMOTION]: { apiEntity: PROMOTION, path: `${ENDPOINT_PROMOTION}`, nameResolver: (data: any) => data.name },
    [OPTION]: { apiEntity: OPTION, path: `${ENDPOINT_OPTION}`, nameResolver: (data: any) => data.name },
    [PERIODE]: { apiEntity: PERIODE, path: `${ENDPOINT_PERIODE}`, nameResolver: (data: any) => data.name },

    [JURY]: { apiEntity: JURY, path: '/a_faire', nameResolver: (data: any) => data.name },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function JuryLayout() {
    const location = useLocation();

    useEffect(() => {
        // On ne sauvegarde que les chemins valides, pas la racine du layout
        if (!location.pathname.endsWith(`/${JURY_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonBreadcrumbs
                context={JURY_WORKFLOW}
                label='Jury'
                entityMap={JURY_ENTITY_MAP}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

export function JuryIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || FORMATION;

    return <Navigate to={target} replace />;
}