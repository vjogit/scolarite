import { useState } from 'react';
import {
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, Button, FormControlLabel, Switch, Typography,
    CircularProgress,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import UndoIcon from '@mui/icons-material/Undo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiInstance } from '../../services/api';
import { ENDPOINT_DELIBERER } from './def';
import { notifyError, notifySuccess, notifyUndone } from '../../services/notify';

interface Props {
    periodeId: string;
    userId: number;
    userName: string;
    isDelibere: boolean;
    /** undefined tant que la liste des délibérations n'est pas chargée */
    compteCumulActuel?: boolean;
    /**
     * UE non évaluées de l'élève. Non vide, le dossier est incomplet et la
     * délibération est refusée — ici comme au serveur.
     */
    uesNonEvaluees?: readonly string[];
}

export function DelibererButton({ periodeId, userId, userName, isDelibere, compteCumulActuel, uesNonEvaluees = [] }: Props) {
    const [open, setOpen] = useState(false);
    const [compteCumul, setCompteCumul] = useState(compteCumulActuel ?? true);
    const queryClient = useQueryClient();
    const { t } = useTranslation('jury');

    const deliberationKey = ['jury-deliberations', periodeId];

    const deliberer = useMutation({
        mutationFn: () =>
            apiInstance.post(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`, { compte_cumul: compteCumul }),
        onSuccess: () => {
            notifySuccess(t('delibererBouton.succes', { nom: userName }));
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
            setOpen(false);
        },
        onError: () => {
            notifyError(t('delibererBouton.erreur'));
        },
    });

    const annuler = useMutation({
        mutationFn: () =>
            apiInstance.delete(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`),
        onSuccess: () => {
            notifyUndone(t('delibererBouton.annulationSucces', { nom: userName }));
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
        },
        onError: () => {
            notifyError(t('delibererBouton.annulationErreur'));
        },
    });

    const handleOpen = () => {
        setCompteCumul(compteCumulActuel ?? true);
        setOpen(true);
    };

    if (isDelibere) {
        return (
            <Tooltip title={t('delibererBouton.annulerTooltip')}>
                <span>
                    <IconButton
                        // Le `Tooltip` nomme son enfant direct, ici le `<span>`
                        // qui porte l'infobulle du bouton désactivé : sans cet
                        // attribut, le bouton n'a aucun nom.
                        aria-label={t('delibererBouton.annulerAriaLabel', { nom: userName })}
                        size="small"
                        color="warning"
                        onClick={() => { annuler.mutate(); }}
                        disabled={annuler.isPending}
                    >
                        {annuler.isPending ? <CircularProgress size={16} /> : <UndoIcon fontSize="small" />}
                    </IconButton>
                </span>
            </Tooltip>
        );
    }

    // Dossier incomplet : le bouton reste visible mais inerte, et l'infobulle
    // nomme les UE en cause. Laisser cliquer pour n'obtenir qu'un 409 ferait
    // porter au serveur une explication que l'écran a déjà sous la main.
    if (uesNonEvaluees.length > 0) {
        return (
            <Tooltip
                title={
                    <>
                        {t('delibererBouton.impossibleTitre')}
                        <br />
                        {t('delibererBouton.uniteNonEvaluee', { count: uesNonEvaluees.length })} :{' '}
                        {uesNonEvaluees.join(', ')}.
                        <br />
                        {t('delibererBouton.repasseraEnJury', { nom: userName })}
                    </>
                }
            >
                <span>
                    <IconButton
                        size="small"
                        disabled
                        aria-label={t('delibererBouton.impossibleAriaLabel', { nom: userName })}
                    >
                        <GavelIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        );
    }

    return (
        <>
            <Tooltip title={t('delibererBouton.delibererTooltip')}>
                <IconButton
                    aria-label={t('delibererBouton.delibererAriaLabel', { nom: userName })}
                    size="small"
                    color="primary"
                    onClick={handleOpen}
                >
                    <GavelIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Dialog open={open} onClose={() => { setOpen(false); }} maxWidth="xs" fullWidth>
                <DialogTitle>{t('delibererBouton.titreDialog', { nom: userName })}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {t('delibererBouton.descriptionPrefixe')}<strong>jury_result</strong>{t('delibererBouton.descriptionSuffixe')}
                    </Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={compteCumul}
                                onChange={(e) => { setCompteCumul(e.target.checked); }}
                            />
                        }
                        label={
                            <span>
                                {t('delibererBouton.compterGpaCumule')}
                                <Typography variant="caption" display="block" color="text.secondary">
                                    {t('delibererBouton.decocherRedoublant')}
                                </Typography>
                            </span>
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setOpen(false); }}>{t('commun.annuler')}</Button>
                    <Button
                        variant="contained"
                        onClick={() => { deliberer.mutate(); }}
                        disabled={deliberer.isPending}
                        startIcon={deliberer.isPending ? <CircularProgress size={16} /> : <GavelIcon />}
                    >
                        {t('commun.confirmer')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
