
import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useParams } from 'react-router';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { apiInstance } from '../../services/api';
import { PERIODE, STRUCTURE } from "../structure/def";

// ─── Composant dédié pour le bouton Import ───────────────────────────────────
// Encapsule les hooks (useRef, useCallback, useParams…) dans un vrai composant
// React afin de pouvoir être rendu depuis renderTopToolbarCustomActions.


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
            notifications.show('Import réussi', { severity: 'success', autoHideDuration: 5000 });
            queryClient.invalidateQueries({ queryKey: [STRUCTURE, PERIODE, optionId] });
        } catch (error) {
            console.error(error);
            notifications.show("Erreur lors de l'import", { severity: 'error', autoHideDuration: 5000 });
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [optionId, notifications, queryClient]);

    return (
        <>
            <Tooltip title="Import">
                <IconButton onClick={() => fileInputRef.current?.click()}>
                    <UploadFileIcon />
                </IconButton>
            </Tooltip>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept=".xlsx"
            />
        </>
    )
}