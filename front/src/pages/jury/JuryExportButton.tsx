import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { useCallback } from 'react';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('jury');
    // Deux exports voisinent dans la barre : le nom doit dire lequel.
    const libelle = t('exportJury.libelle');

    const handleExport = useCallback(async () => {
        try {
            const response = await apiInstance.get<Blob>(`${ENDPOINT_JURY}/excel/${periodeId}`, {
                responseType: 'blob',
            });

            telecharger(response, `jury_${periodeId}.xlsx`);

            notifySuccess(notifications, t('exportJury.succes'));
        } catch (err) {
            console.error(err);
            notifyError(notifications, t('exportJury.erreur'));
        }
    }, [periodeId, notifications, t]);

    return (
        <Tooltip title={libelle}>
            <IconButton aria-label={libelle} onClick={() => { void handleExport(); }} size="small" color="primary">
                <FileDownloadIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}