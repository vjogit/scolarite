
import { useRef, useCallback, useState } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileUp } from 'lucide-react';
import { apiInstance } from '../../services/api';
import { PERIODE, STRUCTURE } from "../structure/def";
import { notifyError, notifySuccess } from '../../services/notify';
import { fileMessageFor, lignesFor, messageForError, type LignesRefusees } from '../../services/errorMessages';
import { LignesRefuseesDialog } from '../../services/LignesRefuseesDialog';

// ─── Composant dédié pour le bouton Import ───────────────────────────────────
// Encapsule les hooks (useRef, useCallback, useParams…) dans un vrai composant
// React afin de pouvoir être rendu depuis renderTopToolbarCustomActions.

export function PeriodeImportButton() {
    const { optionId } = useParams();
    const queryClient = useQueryClient();
    const { t } = useTranslation('catalog');
    const libelle = t('importProgramme.libelle');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [refus, setRefus] = useState<LignesRefusees | null>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !optionId) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await apiInstance.post(`/api/v0/structure/option/${optionId}/import`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            notifySuccess(t('importProgramme.succes'));
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, PERIODE, optionId] });
        } catch (error) {
            // Un fichier à la structure inattendue est désigné en tableau ;
            // sinon le detail du refus vaut mieux que le libellé générique.
            const lignes = lignesFor(error);
            if (lignes !== null) {
                setRefus(lignes);
            } else {
                notifyError(fileMessageFor(error) ?? messageForError(error));
            }
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [optionId, queryClient, t]);

    return (
        <>
            <Tooltip title={libelle}>
                <IconButton aria-label={libelle} onClick={() => fileInputRef.current?.click()}>
                    <FileUp />
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
                sousTitre={t('importProgramme.sousTitreRefus')}
                onClose={() => { setRefus(null); }}
            />
        </>
    )
}