import { useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { notifyError } from '../../services/notify';

export function PeriodeExportButton() {
    const { optionId } = useParams();
    const { t } = useTranslation('catalog');
    const libelle = t('exportProgramme.libelle');

    const handleExport = useCallback(async () => {
        if (!optionId) return;

        try {
            const response = await apiInstance.get<Blob>(`/api/v0/structure/option/${optionId}/export`, {
                responseType: 'blob',
            });

            telecharger(response, 'programme.xlsx');
        } catch (error) {
            console.error(error);
            notifyError(t('exportProgramme.erreur'));
        }
    }, [optionId, t]);

    return (
        <Tooltip title={libelle}>
            <IconButton aria-label={libelle} onClick={() => { void handleExport(); }}>
                <DownloadIcon />
            </IconButton>
        </Tooltip>
    );
}
