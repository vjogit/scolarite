import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE, STRUCTURE } from './def';
import { notifyError, notifyPartialSuccess } from '../../services/notify';
import { messageForError } from '../../services/errorMessages';

interface ImportResult {
    added: number;
    // Absent de la réponse quand tout le monde a été trouvé : le serveur ne
    // sérialise pas une liste vide.
    not_found?: string[];
}

interface Props {
    groupeId: string;
}

export function GroupeImportButton({ groupeId }: Props) {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const { t } = useTranslation('structure');
    // « depuis Excel » seul serait ambigu : c'est l'effectif qu'on importe.
    const libelle = t('groupe.importer.libelle');
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

            const { added, not_found = [] } = res.data;
            let message = t('groupe.importer.elevesAjoutes', { count: added });
            if (not_found.length > 0) {
                message += t('groupe.importer.emailsIntrouvables', { liste: not_found.join(', ') });
            }

            notifyPartialSuccess(notifications, message, not_found.length === 0);
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, 'groupe-users', groupeId] });
        } catch (error) {
            notifyError(notifications, messageForError(error));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [groupeId, notifications, queryClient, t]);

    return (
        <>
            <Tooltip title={libelle}>
                <IconButton aria-label={libelle} onClick={() => fileInputRef.current?.click()}>
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
    );
}
