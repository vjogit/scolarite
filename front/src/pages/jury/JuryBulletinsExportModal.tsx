import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Stack, CircularProgress,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';

// ─────────────────────────────────────────────────────────────────────────────

export interface BulletinParams {
    entete_ligne_1: string;
    entete_ligne_2: string;
    entete_ligne_3: string;
    entete_ligne_4: string;
    entete_ligne_5: string;
    periode: string;
    entete_ue: string;
    date_jury: string;
    nom_responsable: string;
}

const defaultParams: BulletinParams = {
    entete_ligne_1: '',
    entete_ligne_2: '',
    entete_ligne_3: '',
    entete_ligne_4: '',
    entete_ligne_5: '',
    periode: '',
    entete_ue: '',
    date_jury: '',
    nom_responsable: '',
};

interface Props {
    open: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: (params: BulletinParams) => void;
}

export function JuryBulletinsExportModal({ open, loading, onClose, onConfirm }: Props) {
    const [params, setParams] = useState<BulletinParams>(defaultParams);

    const set = (key: keyof BulletinParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setParams(prev => ({ ...prev, [key]: e.target.value }));

    const handleConfirm = () => onConfirm(params);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Paramètres des bulletins</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label="En-tête ligne 1" value={params.entete_ligne_1} onChange={set('entete_ligne_1')} size="small" fullWidth />
                    <TextField label="En-tête ligne 2" value={params.entete_ligne_2} onChange={set('entete_ligne_2')} size="small" fullWidth />
                    <TextField label="En-tête ligne 3" value={params.entete_ligne_3} onChange={set('entete_ligne_3')} size="small" fullWidth />
                    <TextField label="En-tête ligne 4" value={params.entete_ligne_4} onChange={set('entete_ligne_4')} size="small" fullWidth />
                    <TextField label="En-tête ligne 5" value={params.entete_ligne_5} onChange={set('entete_ligne_5')} size="small" fullWidth />
                    <TextField label="Période" value={params.periode} onChange={set('periode')} size="small" fullWidth />
                    <TextField label="En-tête UE" value={params.entete_ue} onChange={set('entete_ue')} size="small" fullWidth />
                    <TextField label="Date du jury" value={params.date_jury} onChange={set('date_jury')} size="small" fullWidth />
                    <TextField label="Nom responsable" value={params.nom_responsable} onChange={set('nom_responsable')} size="small" fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Annuler</Button>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <ArticleIcon />}
                >
                    Exporter
                </Button>
            </DialogActions>
        </Dialog>
    );
}
