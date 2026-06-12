import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router';
import { Box } from '@mui/material';
import { SALLE, SALLE_WORKFLOW } from './def';

const STORAGE_KEY = 'salle_last_path';

export function SalleLayout() {
    const location = useLocation();

    useEffect(() => {
        if (!location.pathname.endsWith(`/${SALLE_WORKFLOW}`)) {
            sessionStorage.setItem(STORAGE_KEY, location.pathname);
        }
    }, [location]);

    return (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Outlet />
        </Box>
    );
}

export function SalleIndex() {
    const lastPath = sessionStorage.getItem(STORAGE_KEY);
    const target = lastPath || SALLE;

    return <Navigate to={target} replace />;
}
