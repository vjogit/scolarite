/**
 * L'écran des périodes tel que le workflow Structure le monte.
 *
 * Dans son propre module : un composant défini à côté d'exports qui n'en
 * sont pas empêche le remplacement à chaud.
 */

import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import type { CrudComponentProps } from '../../services/crud/routes';
import { CATALOG_WORKFLOW } from './def';
import { CrudPeriode } from '../structure/Periode';
import { PeriodeImportButton } from './PeriodeImportButton';
import { PeriodeExportButton } from './PeriodeExportButton';

export function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const renderTopToolbar = ({
        defaultActions,
        peutEcrire,
    }: {
        defaultActions: ReactNode;
        peutEcrire: boolean;
    }) => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {/* Import : une écriture de structure ; l'export reste une lecture,
                offerte à tous. */}
            {peutEcrire && <PeriodeImportButton />}
            <PeriodeExportButton />
        </Box>
    )
    return <CrudPeriode workflow={CATALOG_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        renderTopToolbarCustomActions={renderTopToolbar}
    />;
}
