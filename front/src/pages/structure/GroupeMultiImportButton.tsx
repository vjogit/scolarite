import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from './def';

interface ImportGroupeResult {
    nom: string;
    groupe_id: number;
    added: number;
    not_found: string[];
}

interface ImportMultiGroupesResult {
    groupes: ImportGroupeResult[];
}

interface Props {
    optionId: string;
}

export function GroupeMultiImportButton({ optionId }: Props) {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await apiInstance.post<ImportMultiGroupesResult>(
                `${ENDPOINT_GROUPE}/import-multi?option_id=${optionId}`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const groupes = res.data.groupes ?? [];
            const totalAdded = groupes.reduce((sum, g) => sum + g.added, 0);
            const allNotFound = groupes.flatMap(g => g.not_found ?? []);

            let message = `${groupes.length} groupe(s) créé(s), ${totalAdded} élève(s) ajouté(s).`;
            if (allNotFound.length > 0) {
                message += ` Emails introuvables : ${allNotFound.join(', ')}`;
            }

            notifications.show(message, {
                severity: allNotFound.length > 0 ? 'warning' : 'success',
                autoHideDuration: 8000,
            });
            queryClient.invalidateQueries({ queryKey: [STRUCTURE, GROUPE, optionId] });
        } catch {
            notifications.show("Erreur lors de l'import multi-groupes", { severity: 'error', autoHideDuration: 5000 });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [optionId, notifications, queryClient]);

    return (
        <>
            <Tooltip title="Importer plusieurs groupes depuis Excel">
                <IconButton onClick={() => fileInputRef.current?.click()}>
                    <DriveFolderUploadIcon />
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
    );
}
