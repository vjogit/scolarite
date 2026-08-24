import { IconButton, Tooltip } from '@mui/material';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { useCallback, useState } from 'react';
import { useNotifications } from '@toolpad/core/useNotifications';
import ArticleIcon from '@mui/icons-material/Article';
import { ENDPOINT_JURY } from './def';
import { type BulletinParams, JuryBulletinsExportModal } from './JuryBulletinsExportModal';
import { notifyError, notifySuccess } from '../../services/notify';

// ─────────────────────────────────────────────────────────────────────────────
// Bouton d'export des bulletins ZIP
// ─────────────────────────────────────────────────────────────────────────────

interface JuryBulletinsExportButtonProps {
    periodeId: string;
}

/** Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger. */
const LIBELLE = 'Exporter les bulletins (ZIP)';

export function JuryBulletinsExportButton({ periodeId }: JuryBulletinsExportButtonProps) {
    const notifications = useNotifications();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleExport = useCallback(async (params: BulletinParams) => {
        setLoading(true);
        try {
            const response = await apiInstance.post<Blob>(`${ENDPOINT_JURY}/bulletins/${periodeId}`, params, {
                responseType: 'blob',
            });

            telecharger(response, `bulletins_jury_${periodeId}.zip`);

            notifySuccess(notifications, 'Export des bulletins réussi.');
            setOpen(false);
        } catch (err) {
            console.error(err);
            notifyError(notifications, "Erreur lors de l'export des bulletins.");
        } finally {
            setLoading(false);
        }
    }, [periodeId, notifications]);

    return (
        <>
            <Tooltip title={LIBELLE}>
                <IconButton aria-label={LIBELLE} onClick={() => { setOpen(true); }} size="small" color="secondary">
                    <ArticleIcon fontSize="small" />
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
