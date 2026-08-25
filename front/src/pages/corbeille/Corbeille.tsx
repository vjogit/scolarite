import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

import { fetchCorbeille, purgerOperation, restaurerOperation, type OperationCorbeille } from './service';
import { CORBEILLE } from './def';
import type { DeleteImpactEntry } from '../../services/crud/def';
import { blockingMessageFor, messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';

/** « 3 promotions », « 1 847 notes » — même règle que la modale de suppression. */
function formatEntry(entry: DeleteImpactEntry): string {
    return `${formatNombre.format(entry.count)} ${entry.label}`;
}

/** Énumération : « a, b et c » (le séparateur final vient du namespace `corbeille`). */
function joinEnumeration(parts: string[], t: TFunction<'corbeille'>): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} ${t('et')} ${parts.at(-1) ?? ''}`;
}

/** Le type de racine (`formation`, `promotion`, `option`, `periode`) traduit. */
function libelleRacine(racineType: string, pluriel: boolean, t: TFunction<'corbeille'>): string {
    switch (racineType) {
        case 'formation': return pluriel ? t('racinesPluriel.formation') : t('racines.formation');
        case 'promotion': return pluriel ? t('racinesPluriel.promotion') : t('racines.promotion');
        case 'option': return pluriel ? t('racinesPluriel.option') : t('racines.option');
        case 'periode': return pluriel ? t('racinesPluriel.periode') : t('racines.periode');
        default: return racineType;
    }
}

function titreOperation(op: OperationCorbeille, t: TFunction<'corbeille'>): string {
    const noms = op.items.map((item) => `« ${item.name} »`);
    if (noms.length === 1) return `${libelleRacine(op.racineType, false, t)} ${noms[0] ?? ''}`;
    return `${formatNombre.format(noms.length)} ${libelleRacine(op.racineType, true, t)} : ${joinEnumeration(noms, t)}`;
}

function sousTitreOperation(op: OperationCorbeille, t: TFunction<'corbeille'>): string {
    const date = new Date(op.deletedAt).toLocaleString();
    const auteur = op.deletedByNom ?? op.deletedBy;
    return t('supprimeLe', { date, auteur });
}

/**
 * Purge : friction maximale, comme la modale de suppression d'origine —
 * impact chiffré sous les yeux, saisie du nom (ou de CONFIRMER en cas de
 * racines multiples) avant que le bouton ne s'arme. La purge est le seul
 * geste réellement irréversible de la corbeille.
 */
function PurgeDialog({
    operation,
    onClose,
    onConfirm,
    enCours,
}: {
    operation: OperationCorbeille | null;
    onClose: () => void;
    onConfirm: (op: OperationCorbeille) => void;
    enCours: boolean;
}) {
    const { t } = useTranslation('corbeille');
    const [saisie, setSaisie] = useState('');
    const saisieRef = useRef<HTMLInputElement>(null);

    const [seulElement] = operation?.items ?? [];
    const phraseAttendue =
        operation?.items.length === 1 && seulElement ? seulElement.name : t('motConfirmation');
    const confirmationOk = operation !== null && saisie.trim() === phraseAttendue;

    const fermer = () => {
        setSaisie('');
        onClose();
    };

    return (
        <Dialog
            open={operation !== null}
            onClose={fermer}
            maxWidth="sm"
            fullWidth
            // La saisie est le geste attendu, et elle existe dès l'ouverture :
            // le piège à focus de MUI reprendrait la main sur un `autoFocus`.
            // Même contournement que dans `UnsavedChangesDialog`.
            slotProps={{ transition: { onEntered: () => { saisieRef.current?.focus(); } } }}
        >
            <DialogTitle>
                {operation ? t('purgerTitre', { titre: titreOperation(operation, t) }) : ''}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    {operation && operation.cascade.length > 0 && (
                        <Alert severity="warning">
                            <Typography variant="body2" component="span">
                                {t('contientPrefixe')}<strong>{joinEnumeration(operation.cascade.map(formatEntry), t)}</strong>.
                            </Typography>
                        </Alert>
                    )}
                    <DialogContentText>
                        {t('purgeIrreversible')}
                    </DialogContentText>
                    <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                            {t('confirmerSaisiePrefixe')} <strong>{phraseAttendue}</strong> :
                        </Typography>
                        <TextField
                            inputRef={saisieRef}
                            value={saisie}
                            onChange={(event) => { setSaisie(event.target.value); }}
                            size="small"
                            fullWidth
                            autoComplete="off"
                            label={t('confirmationLabel')}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={fermer}>
                    {t('annuler')}
                </Button>
                <Button
                    color="error"
                    disabled={!confirmationOk || enCours}
                    onClick={() => { if (operation) onConfirm(operation); }}
                >
                    {t('purgerDefinitivement')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Restauration : un simple accord suffit — le geste est réversible (re-suppression). */
function RestoreDialog({
    operation,
    onClose,
    onConfirm,
    enCours,
}: {
    operation: OperationCorbeille | null;
    onClose: () => void;
    onConfirm: (op: OperationCorbeille) => void;
    enCours: boolean;
}) {
    const { t } = useTranslation('corbeille');
    return (
        <Dialog open={operation !== null} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {operation ? t('restaurerTitre', { titre: titreOperation(operation, t) }) : ''}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {t('restaurationTout')}
                    {operation && operation.cascade.length > 0
                        ? t('restaurationToutSuffixe', { liste: joinEnumeration(operation.cascade.map(formatEntry), t) })
                        : '.'}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} autoFocus>
                    {t('annuler')}
                </Button>
                <Button
                    color="primary"
                    disabled={enCours}
                    onClick={() => { if (operation) onConfirm(operation); }}
                >
                    {t('restaurer')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export function CorbeillePage() {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const { t } = useTranslation('corbeille');

    const [aRestaurer, setARestaurer] = useState<OperationCorbeille | null>(null);
    const [aPurger, setAPurger] = useState<OperationCorbeille | null>(null);

    const query = useQuery({
        queryKey: [CORBEILLE],
        queryFn: fetchCorbeille,
    });

    // Restaurer ou purger invalide toutes les lectures : les objets restaurés
    // doivent réapparaître partout (listes, sélecteurs, fil d'Ariane) sans
    // qu'on ait à connaître leurs clés de cache une à une.
    const invalidateTout = () => queryClient.invalidateQueries();

    const restauration = useMutation({
        mutationFn: (op: OperationCorbeille) => restaurerOperation(op.id),
        onSuccess: (_data, op) => {
            setARestaurer(null);
            void invalidateTout();
            notifySuccess(notifications, t('restaurationSucces', { titre: titreOperation(op, t) }));
        },
        onError: (error) => {
            setARestaurer(null);
            notifyError(notifications, blockingMessageFor(error) ?? messageForError(error));
        },
    });

    const purge = useMutation({
        mutationFn: (op: OperationCorbeille) => purgerOperation(op.id),
        onSuccess: (_data, op) => {
            setAPurger(null);
            void invalidateTout();
            notifySuccess(notifications, t('purgeSucces', { titre: titreOperation(op, t) }));
        },
        onError: (error) => {
            setAPurger(null);
            notifyError(notifications, blockingMessageFor(error) ?? messageForError(error));
        },
    });

    const operations = useMemo(() => query.data ?? [], [query.data]);

    if (query.isPending) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
                <CircularProgress size={18} />
                <Typography variant="body2">{t('chargement')}</Typography>
            </Box>
        );
    }

    if (query.isError) {
        return (
            <Alert severity="error" sx={{ m: 2 }}>
                {t('erreurLecture', { erreur: messageForError(query.error) })}
            </Alert>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
                {t('titre')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('sousTitre')}
            </Typography>

            {/* Rien à créer dans une corbeille : le message se suffit, et dit
                d'où viendra ce qui s'y trouvera. */}
            {operations.length === 0 && (
                <Alert severity="info">
                    {t('vide')}
                </Alert>
            )}

            <Stack spacing={2}>
                {operations.map((op) => (
                    <Card key={op.id} variant="outlined">
                        <CardContent>
                            <Typography variant="h6">{titreOperation(op, t)}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {sousTitreOperation(op, t)}
                            </Typography>
                            {op.cascade.length > 0 ? (
                                <Typography variant="body2">
                                    {t('contientPrefixe')}{joinEnumeration(op.cascade.map(formatEntry), t)}.
                                </Typography>
                            ) : (
                                <Typography variant="body2">{t('aucuneDonneeLiee')}</Typography>
                            )}
                            {op.blocking.length > 0 && (
                                <Alert severity="error" sx={{ mt: 1 }}>
                                    {op.blocking.map((blocage) => (
                                        <Typography key={blocage.reason} variant="body2">
                                            {blocage.message}
                                        </Typography>
                                    ))}
                                </Alert>
                            )}
                        </CardContent>
                        <CardActions>
                            <Button
                                startIcon={<RestoreIcon />}
                                onClick={() => { setARestaurer(op); }}
                                disabled={restauration.isPending || purge.isPending}
                            >
                                {t('restaurer')}
                            </Button>
                            <Button
                                color="error"
                                startIcon={<DeleteForeverIcon />}
                                onClick={() => { setAPurger(op); }}
                                disabled={op.blocking.length > 0 || restauration.isPending || purge.isPending}
                            >
                                {t('purger')}
                            </Button>
                        </CardActions>
                    </Card>
                ))}
            </Stack>

            <RestoreDialog
                operation={aRestaurer}
                onClose={() => { setARestaurer(null); }}
                onConfirm={(op) => { restauration.mutate(op); }}
                enCours={restauration.isPending}
            />
            <PurgeDialog
                operation={aPurger}
                onClose={() => { setAPurger(null); }}
                onConfirm={(op) => { purge.mutate(op); }}
                enCours={purge.isPending}
            />
        </Box>
    );
}
