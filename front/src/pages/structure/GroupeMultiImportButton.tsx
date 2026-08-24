import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from './def';
import { notifyError, notifyPartialSuccess } from '../../services/notify';
import { messageForError } from '../../services/errorMessages';

interface ImportGroupeResult {
    nom: string;
    groupe_id: number;
    added: number;
    // Absent quand tout le monde a été trouvé : le serveur ne sérialise pas
    // une liste vide. Même remarque que dans `GroupeImportButton`.
    not_found?: string[];
}

interface ImportMultiGroupesResult {
    groupes?: ImportGroupeResult[];
}

interface Props {
    optionId: string;
}

/** Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger. */
const LIBELLE = 'Importer plusieurs groupes depuis Excel';

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

            notifyPartialSuccess(notifications, message, allNotFound.length === 0);
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, GROUPE, optionId] });
        } catch (error) {
            notifyError(notifications, messageForError(error));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [optionId, notifications, queryClient]);

    return (
        <>
            <Tooltip title={LIBELLE}>
                <IconButton aria-label={LIBELLE} onClick={() => fileInputRef.current?.click()}>
                    <DriveFolderUploadIcon />
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
