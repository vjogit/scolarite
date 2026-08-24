import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { useCallback } from 'react';
import { useNotifications } from '@toolpad/core/useNotifications';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { ENDPOINT_JURY } from './def';
import { notifyError, notifySuccess } from '../../services/notify';

// ─────────────────────────────────────────────────────────────────────────────
// Bouton d'export Excel
// ─────────────────────────────────────────────────────────────────────────────

interface JuryExportButtonProps {
    periodeId: string;
}

/** Deux exports voisinent dans la barre : le nom doit dire lequel. */
const LIBELLE = 'Exporter le jury en Excel';

export function JuryExportButton({ periodeId }: JuryExportButtonProps) {
    const notifications = useNotifications();

    const handleExport = useCallback(async () => {
        try {
            const response = await apiInstance.get<Blob>(`${ENDPOINT_JURY}/excel/${periodeId}`, {
                responseType: 'blob',
            });

            telecharger(response, `jury_${periodeId}.xlsx`);

            notifySuccess(notifications, 'Export réussi.');
        } catch (err) {
            console.error(err);
            notifyError(notifications, "Erreur lors de l'export.");
        }
    }, [periodeId, notifications]);

    return (
        <Tooltip title={LIBELLE}>
            <IconButton aria-label={LIBELLE} onClick={() => { void handleExport(); }} size="small" color="primary">
                <FileDownloadIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}