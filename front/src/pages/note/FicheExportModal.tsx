import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Autocomplete, TextField, CircularProgress, Box,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useTranslation } from 'react-i18next';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { ENDPOINT_GROUPE } from '../structure/def';
import { ENDPOINT_BASE } from './def';
import type { Groupe } from '../structure/Groupe';
import { notifyError } from '../../services/notify';
import { messageForError } from '../../services/errorMessages';

interface Props {
    open: boolean;
    controleId: number | null;
    optionId: string;
    onClose: () => void;
}

export function FicheExportModal({ open, controleId, optionId, onClose }: Props) {
    const notifications = useNotifications();
    const { t } = useTranslation('note');
    const [selectedGroupe, setSelectedGroupe] = useState<Groupe | null>(null);
    const [downloading, setDownloading] = useState(false);

    const { data: groupes = [], isLoading } = useQuery<Groupe[]>({
        queryKey: ['groupe', optionId],
        queryFn: () => apiInstance.get<Groupe[]>(`${ENDPOINT_GROUPE}?option_id=${optionId}`).then(r => r.data),
        enabled: open && !!optionId,
    });

    const handleClose = () => {
        setSelectedGroupe(null);
        onClose();
    };

    const handleDownload = async () => {
        if (!controleId || !selectedGroupe) return;
        setDownloading(true);
        try {
            const response = await apiInstance.get<Blob>(
                `${ENDPOINT_BASE}/note/fiche/export?controle_id=${controleId}&groupe_id=${selectedGroupe.id}`,
                { responseType: 'blob' },
            );
            // Le serveur nomme la fiche ; le repli ne sert que s'il se tait.
            telecharger(response, `fiche_${controleId}.xlsx`);
            handleClose();
        } catch (error) {
            // Sans ce `catch`, l'échec ne se voyait nulle part : la modale
            // restait ouverte, le bouton cessait de tourner, et rien ne
            // distinguait un export refusé d'un export terminé.
            notifyError(notifications, messageForError(error));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('ficheExportModal.titre')}</DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 1 }}>
                    <Autocomplete
                        options={groupes}
                        getOptionLabel={(g) => g.name}
                        value={selectedGroupe}
                        onChange={(_, value) => { setSelectedGroupe(value); }}
                        loading={isLoading}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={t('ficheExportModal.groupeLabel')}
                                placeholder={t('ficheExportModal.groupePlaceholder')}
                                slotProps={{
                                    input: {
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {isLoading && <CircularProgress size={18} />}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    },
                                }}
                            />
                        )}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{t('commun.annuler')}</Button>
                <Button
                    variant="contained"
                    onClick={() => { void handleDownload(); }}
                    disabled={!selectedGroupe || downloading}
                    startIcon={downloading ? <CircularProgress size={16} /> : undefined}
                >
                    {t('ficheExportModal.telecharger')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
