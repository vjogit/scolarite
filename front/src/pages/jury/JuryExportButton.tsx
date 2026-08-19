import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
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

            const contentDisposition = response.headers['content-disposition'];
            let filename = `jury_${periodeId}.xlsx`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = match[1];
            }

            link.setAttribute('download', filename);
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
        <Tooltip title="Exporter en Excel">
            <IconButton onClick={handleExport} size="small" color="primary">
                <FileDownloadIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}