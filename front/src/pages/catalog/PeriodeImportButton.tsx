
import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useParams } from 'react-router';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { apiInstance } from '../../services/api';
import { PERIODE, STRUCTURE } from "../structure/def";
import { notifyError, notifySuccess } from '../../services/notify';

// ─── Composant dédié pour le bouton Import ───────────────────────────────────
// Encapsule les hooks (useRef, useCallback, useParams…) dans un vrai composant
// React afin de pouvoir être rendu depuis renderTopToolbarCustomActions.


/** Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger. */
const LIBELLE = 'Importer le programme depuis Excel';

export function PeriodeImportButton() {
    const { optionId } = useParams();
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !optionId) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await apiInstance.post(`/api/v0/structure/option/${optionId}/import`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            notifySuccess(notifications, 'Import du programme réussi.');
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, PERIODE, optionId] });
        } catch (error) {
            console.error(error);
            notifyError(notifications, "Erreur lors de l'import.");
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [optionId, notifications, queryClient]);

    return (
        <>
            <Tooltip title={LIBELLE}>
                <IconButton aria-label={LIBELLE} onClick={() => fileInputRef.current?.click()}>
                    <UploadFileIcon />
                </IconButton>
            </Tooltip>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(event) => { void handleFileChange(event); }}
                accept=".xlsx"
            />
        </>
    )
}