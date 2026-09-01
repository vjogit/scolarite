import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown } from 'lucide-react';
import { ENDPOINT_JURY } from './def';
import { notifyError, notifySuccess } from '../../services/notify';

// ─────────────────────────────────────────────────────────────────────────────
// Bouton d'export Excel
// ─────────────────────────────────────────────────────────────────────────────

interface JuryExportButtonProps {
    periodeId: string;
}

export function JuryExportButton({ periodeId }: JuryExportButtonProps) {
    const { t } = useTranslation('jury');
    // Deux exports voisinent dans la barre : le nom doit dire lequel.
    const libelle = t('exportJury.libelle');

    const handleExport = useCallback(async () => {
        try {
            const response = await apiInstance.get<Blob>(`${ENDPOINT_JURY}/excel/${periodeId}`, {
                responseType: 'blob',
            });

            telecharger(response, `jury_${periodeId}.xlsx`);

            notifySuccess(t('exportJury.succes'));
        } catch (err) {
            console.error(err);
            notifyError(t('exportJury.erreur'));
        }
    }, [periodeId, t]);

    return (
        <Tooltip title={libelle}>
            <IconButton aria-label={libelle} onClick={() => { void handleExport(); }} size="small" color="primary">
                <FileDown size={20} />
            </IconButton>
        </Tooltip>
    );
}