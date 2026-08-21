import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE } from './def';
import { notifyError, notifyPartialSuccess } from '../../services/notify';

interface ImportResult {
    added: number;
    not_found: string[];
}

interface Props {
    groupeId: string;
}

/** « depuis Excel » seul serait ambigu : c'est l'effectif qu'on importe. */
const LIBELLE = 'Importer des élèves depuis Excel';

export function GroupeImportButton({ groupeId }: Props) {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await apiInstance.post<ImportResult>(
                `${ENDPOINT_GROUPE}/${groupeId}/import`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const { added, not_found } = res.data;
            let message = `${added} élève(s) ajouté(s).`;
            if (not_found?.length > 0) {
                message += ` Emails introuvables : ${not_found.join(', ')}`;
            }

            notifyPartialSuccess(notifications, message, !(not_found?.length > 0));
            queryClient.invalidateQueries({ queryKey: ['groupe-users', groupeId] });
        } catch {
            notifyError(notifications, "Erreur lors de l'import.");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [groupeId, notifications, queryClient]);

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
                onChange={handleFileChange}
                accept=".xlsx"
            />
        </>
    );
}
