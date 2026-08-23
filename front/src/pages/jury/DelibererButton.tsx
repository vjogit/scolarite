import { useState } from 'react';
import {
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, Button, FormControlLabel, Switch, Typography,
    CircularProgress,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import UndoIcon from '@mui/icons-material/Undo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
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
    const notifications = useNotifications();
    const queryClient = useQueryClient();

    const deliberationKey = ['jury-deliberations', periodeId];

    const deliberer = useMutation({
        mutationFn: () =>
            apiInstance.post(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`, { compte_cumul: compteCumul }),
        onSuccess: () => {
            notifySuccess(notifications, `Délibération enregistrée pour ${userName}.`);
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
            setOpen(false);
        },
        onError: () => {
            notifyError(notifications, 'Erreur lors de la délibération.');
        },
    });

    const annuler = useMutation({
        mutationFn: () =>
            apiInstance.delete(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`),
        onSuccess: () => {
            notifyUndone(notifications, `Délibération annulée pour ${userName}.`);
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
        },
        onError: () => {
            notifyError(notifications, "Erreur lors de l'annulation.");
        },
    });

    const handleOpen = () => {
        setCompteCumul(compteCumulActuel ?? true);
        setOpen(true);
    };

    if (isDelibere) {
        return (
            <Tooltip title="Annuler la délibération (correction possible)">
                <span>
                    <IconButton
                        // Le `Tooltip` nomme son enfant direct, ici le `<span>`
                        // qui porte l'infobulle du bouton désactivé : sans cet
                        // attribut, le bouton n'a aucun nom.
                        aria-label={`Annuler la délibération de ${userName} (correction possible)`}
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
                        Délibération impossible : dossier incomplet.
                        <br />
                        {uesNonEvaluees.length > 1 ? 'Unités non évaluées' : 'Unité non évaluée'} :{' '}
                        {uesNonEvaluees.join(', ')}.
                        <br />
                        {userName} repassera en jury une fois ses notes complètes.
                    </>
                }
            >
                <span>
                    <IconButton
                        size="small"
                        disabled
                        aria-label={`Délibération impossible pour ${userName} : dossier incomplet`}
                    >
                        <GavelIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        );
    }

    return (
        <>
            <Tooltip title="Délibérer">
                <IconButton
                    aria-label={`Délibérer — ${userName}`}
                    size="small"
                    color="primary"
                    onClick={handleOpen}
                >
                    <GavelIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Dialog open={open} onClose={() => { setOpen(false); }} maxWidth="xs" fullWidth>
                <DialogTitle>Délibérer — {userName}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Les résultats actuels de cet élève seront figés dans <strong>jury_result</strong> et pris en compte dans le GPA cumulé des périodes futures.
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
                                Compter dans le GPA cumulé
                                <Typography variant="caption" display="block" color="text.secondary">
                                    Décocher si c'est une année échouée (redoublant)
                                </Typography>
                            </span>
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setOpen(false); }}>Annuler</Button>
                    <Button
                        variant="contained"
                        onClick={() => { deliberer.mutate(); }}
                        disabled={deliberer.isPending}
                        startIcon={deliberer.isPending ? <CircularProgress size={16} /> : <GavelIcon />}
                    >
                        Confirmer
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
