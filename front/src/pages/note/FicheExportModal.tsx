import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Autocomplete, TextField, CircularProgress, Box,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
import { apiInstance } from '../../services/api';
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
            const response = await apiInstance.get(
                `${ENDPOINT_BASE}/note/fiche/export?controle_id=${controleId}&groupe_id=${selectedGroupe.id}`,
                { responseType: 'blob' },
            );
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `fiche_${controleId}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
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
            <DialogTitle>Exporter la fiche de notes</DialogTitle>
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
                                label="Groupe d'élèves"
                                placeholder="Rechercher un groupe..."
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
                <Button onClick={handleClose}>Annuler</Button>
                <Button
                    variant="contained"
                    onClick={() => { void handleDownload(); }}
                    disabled={!selectedGroupe || downloading}
                    startIcon={downloading ? <CircularProgress size={16} /> : undefined}
                >
                    Télécharger
                </Button>
            </DialogActions>
        </Dialog>
    );
}
