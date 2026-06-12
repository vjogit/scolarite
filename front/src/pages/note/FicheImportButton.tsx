import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { apiInstance } from '../../services/api';
import { ENDPOINT_BASE, NOTE } from './def';

interface ImportFicheResult {
    controle_id: number;
    created: number;
    updated: number;
}

interface Props {
    controleId: number;
}

export function FicheImportButton({ controleId }: Props) {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await apiInstance.post<ImportFicheResult>(
                `${ENDPOINT_BASE}/note/fiche/import?controle_id=${controleId}`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const { created, updated } = res.data;
            notifications.show(
                `${created} note(s) créée(s), ${updated} note(s) mise(s) à jour.`,
                { severity: 'success', autoHideDuration: 6000 },
            );
            queryClient.invalidateQueries({ queryKey: [NOTE, 'controle', String(controleId)] });
        } catch {
            notifications.show("Erreur lors de l'import de la fiche", { severity: 'error', autoHideDuration: 5000 });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [controleId, notifications, queryClient]);

    return (
        <>
            <Tooltip title="Importer les notes depuis Excel">
                <IconButton onClick={() => fileInputRef.current?.click()}>
                    <FileUploadIcon />
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
