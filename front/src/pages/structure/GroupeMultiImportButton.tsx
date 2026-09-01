import { useRef, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FolderUp } from 'lucide-react';
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

export function GroupeMultiImportButton({ optionId }: Props) {
    const queryClient = useQueryClient();
    const { t } = useTranslation('structure');
    // Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger.
    const libelle = t('groupe.importerMulti.libelle');
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

            let message = `${t('groupe.importerMulti.groupesCrees', { count: groupes.length })}, ${t('groupe.importerMulti.elevesAjoutes', { count: totalAdded })}`;
            if (allNotFound.length > 0) {
                message += t('groupe.importerMulti.emailsIntrouvables', { liste: allNotFound.join(', ') });
            }

            notifyPartialSuccess(message, allNotFound.length === 0);
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, GROUPE, optionId] });
        } catch (error) {
            notifyError(messageForError(error));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [optionId, queryClient, t]);

    return (
        <>
            <Tooltip title={libelle}>
                <IconButton aria-label={libelle} onClick={() => fileInputRef.current?.click()}>
                    <FolderUp />
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
