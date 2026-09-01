import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { ENDPOINT_JURY } from './def';
import { type BulletinParams, JuryBulletinsExportModal } from './JuryBulletinsExportModal';
import { notifyError, notifySuccess } from '../../services/notify';

// ─────────────────────────────────────────────────────────────────────────────
// Bouton d'export des bulletins ZIP
// ─────────────────────────────────────────────────────────────────────────────

interface JuryBulletinsExportButtonProps {
    periodeId: string;
}

export function JuryBulletinsExportButton({ periodeId }: JuryBulletinsExportButtonProps) {
    const { t } = useTranslation('jury');
    // Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger.
    const libelle = t('exportBulletins.libelle');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleExport = useCallback(async (params: BulletinParams) => {
        setLoading(true);
        try {
            const response = await apiInstance.post<Blob>(`${ENDPOINT_JURY}/bulletins/${periodeId}`, params, {
                responseType: 'blob',
            });

            telecharger(response, `bulletins_jury_${periodeId}.zip`);

            notifySuccess(t('exportBulletins.succes'));
            setOpen(false);
        } catch (err) {
            console.error(err);
            notifyError(t('exportBulletins.erreur'));
        } finally {
            setLoading(false);
        }
    }, [periodeId, t]);

    return (
        <>
            <Tooltip title={libelle}>
                <IconButton aria-label={libelle} onClick={() => { setOpen(true); }} size="small" color="secondary">
                    <FileText size={20} />
                </IconButton>
            </Tooltip>

            <JuryBulletinsExportModal
                open={open}
                loading={loading}
                onClose={() => { setOpen(false); }}
                onConfirm={(params) => { void handleExport(params); }}
            />
        </>
    );
}
