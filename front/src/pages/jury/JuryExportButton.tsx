import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { nomDeFichierDepuis } from '../../services/telechargement';
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
            const response = await apiInstance.get(`${ENDPOINT_JURY}/excel/${periodeId}`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            link.setAttribute('download', nomDeFichierDepuis(response, `jury_${periodeId}.xlsx`));
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

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