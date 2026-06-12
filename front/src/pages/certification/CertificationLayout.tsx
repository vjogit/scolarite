import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';
import { BREADCRUMB_PATH_NOT_USED, CommonBreadcrumbs, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';

import { CERTIFICATION_WORKFLOW,  TOEIC, MOBILITE } from './def';
import { ENDPOINT_FORMATION, ENDPOINT_PROMOTION, FORMATION, PROMOTION } from '../structure/def';


const STORAGE_KEY = 'certification_last_path';


const CERTIFICATION_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: `${ENDPOINT_FORMATION}`, nameResolver: (data: any) => data.name },
    [PROMOTION]: { apiEntity: PROMOTION, path: `${ENDPOINT_PROMOTION}`, nameResolver: (data: any) => data.name },

    [TOEIC]: { apiEntity: TOEIC, path: BREADCRUMB_PATH_NOT_USED, nameResolver: () => "toeic" },
    [MOBILITE]: { apiEntity: MOBILITE, path: BREADCRUMB_PATH_NOT_USED, nameResolver: () => "mobilite" },

};

export function CertificationLayout() {
    const location = useLocation();

    useEffect(() => {
        if (!location.pathname.endsWith(`/${CERTIFICATION_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonBreadcrumbs
                context={CERTIFICATION_WORKFLOW}
                label='Certification'
                entityMap={CERTIFICATION_ENTITY_MAP}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

export function CertificationIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || FORMATION;

    return <Navigate to={target} replace />;
}
