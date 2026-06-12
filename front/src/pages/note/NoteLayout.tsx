import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';
import { CommonBreadcrumbs, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { CONTROLE, ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE, NOTE_WORKFLOW } from './def';
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, ENDPOINT_MATIERE, ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION, ENDPOINT_UES } from '../structure/def';

const STORAGE_KEY = 'note_last_path';

// ─── Layout & Index ───────────────────────────────────────────────────────────


const NOTE_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: `${ENDPOINT_FORMATION}`, nameResolver: (data: any) => data.name },
    [PROMOTION]: { apiEntity: PROMOTION, path: `${ENDPOINT_PROMOTION}`, nameResolver: (data: any) => data.name },
    [OPTION]: { apiEntity: OPTION, path: `${ENDPOINT_OPTION}`, nameResolver: (data: any) => data.name },
    [PERIODE]: { apiEntity: PERIODE, path: `${ENDPOINT_PERIODE}`, nameResolver: (data: any) => data.name },
    [UES]: { apiEntity: UES, path: `${ENDPOINT_UES}`, nameResolver: (data: any) => data.name },
    [MATIERE]: { apiEntity: MATIERE, path: `${ENDPOINT_MATIERE}`, nameResolver: (data: any) => data.name },
    [CONTROLE]: { apiEntity: CONTROLE, path: `${ENDPOINT_CONTROLE}`, nameResolver: (data: any) => data.name },
    [NOTE]: { apiEntity: NOTE, path: `${ENDPOINT_NOTE_CONTROLE}`, nameResolver: (data: any) => `${data.firstName} ${data.lastName}` },
};

export function NoteLayout() {
    const location = useLocation();

    useEffect(() => {
        if (!location.pathname.endsWith(`/${NOTE_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonBreadcrumbs
                context={NOTE_WORKFLOW}
                label='Controles'
                entityMap={NOTE_ENTITY_MAP}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

export function NoteIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || FORMATION;

    return <Navigate to={target} replace />;
}
