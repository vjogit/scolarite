import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { apiInstance } from "../../services/api";
import { ENDPOINT_USER, USER } from "./def";
import { IconButton, Tooltip } from "@mui/material";
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { notifyError, notifySuccess } from '../../services/notify';
import { lignesFor, messageForError, type LignesRefusees } from '../../services/errorMessages';
import { LignesRefuseesDialog } from '../../services/LignesRefuseesDialog';

export function UserImportButton() {

    const queryClient = useQueryClient();
    const { t } = useTranslation('user');
    // Un seul libellé : l'infobulle et le nom accessible ne peuvent pas diverger.
    const libelle = t('import.libelle');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [refus, setRefus] = useState<LignesRefusees | null>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await apiInstance.post(`${ENDPOINT_USER}/import`, formData);
            void queryClient.invalidateQueries({ queryKey: [USER] });
            notifySuccess(t('import.succes'));
        } catch (error) {
            // Un refus qui désigne ses lignes — email manquant, nature ou rôle
            // inconnus — s'affiche en tableau, à corriger fichier ouvert à côté.
            const lignes = lignesFor(error);
            if (lignes !== null) {
                setRefus(lignes);
            } else {
                notifyError(messageForError(error));
            }
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [queryClient, t])

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
            <LignesRefuseesDialog
                refus={refus}
                sousTitre={t('import.sousTitreRefus')}
                onClose={() => { setRefus(null); }}
            />
        </>
    )

}
