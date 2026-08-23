import { useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useParams } from 'react-router';
import { useNotifications } from '@toolpad/core/useNotifications';
import DownloadIcon from '@mui/icons-material/Download';
import { apiInstance } from '../../services/api';
import { notifyError } from '../../services/notify';

/** Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger. */
const LIBELLE = 'Exporter le programme en Excel';

export function PeriodeExportButton() {
    const { optionId } = useParams();
    const notifications = useNotifications();

    const handleExport = useCallback(async () => {
        if (!optionId) return;

        try {
            const response = await apiInstance.get(`/api/v0/structure/option/${optionId}/export`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            const disposition = response.headers['content-disposition'] as string | undefined;
            const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? 'programme.xlsx';
            link.setAttribute('download', filename);

            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            notifyError(notifications, "Erreur lors de l'export.");
        }
    }, [optionId, notifications]);

    return (
        <Tooltip title={LIBELLE}>
            <IconButton aria-label={LIBELLE} onClick={() => { void handleExport(); }}>
                <DownloadIcon />
            </IconButton>
        </Tooltip>
    );
}
