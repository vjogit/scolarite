import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Stack, CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

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
    const { t } = useTranslation('jury');

    const set = (key: keyof BulletinParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setParams(prev => ({ ...prev, [key]: e.target.value }));
    };

    const handleConfirm = () => { onConfirm(params); };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('exportBulletins.titreParametres')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label={t('exportBulletins.champEnteteLigne1')} value={params.entete_ligne_1} onChange={set('entete_ligne_1')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champEnteteLigne2')} value={params.entete_ligne_2} onChange={set('entete_ligne_2')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champEnteteLigne3')} value={params.entete_ligne_3} onChange={set('entete_ligne_3')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champEnteteLigne4')} value={params.entete_ligne_4} onChange={set('entete_ligne_4')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champEnteteLigne5')} value={params.entete_ligne_5} onChange={set('entete_ligne_5')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champPeriode')} value={params.periode} onChange={set('periode')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champEnteteUe')} value={params.entete_ue} onChange={set('entete_ue')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champDateJury')} value={params.date_jury} onChange={set('date_jury')} size="small" fullWidth />
                    <TextField label={t('exportBulletins.champNomResponsable')} value={params.nom_responsable} onChange={set('nom_responsable')} size="small" fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>{t('commun.annuler')}</Button>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <FileText size={20} />}
                >
                    {t('exportBulletins.exporter')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
