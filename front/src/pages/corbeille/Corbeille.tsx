import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
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

/** Mot à recopier pour purger une opération à plusieurs racines. */
const MOT_CONFIRMATION = 'CONFIRMER';

/** Libellés des types de racine, accordés pour les titres. */
const LIBELLE_RACINE: Record<string, string> = {
    formation: 'Formation',
    promotion: 'Promotion',
    option: 'Option',
    periode: 'Période',
};

/** « 3 promotions », « 1 847 notes » — même règle que la modale de suppression. */
function formatEntry(entry: DeleteImpactEntry): string {
    return `${formatNombre.format(entry.count)} ${entry.label}`;
}

/** Énumération française : « a, b et c ». */
function joinFr(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

function titreOperation(op: OperationCorbeille): string {
    const type = LIBELLE_RACINE[op.racineType] ?? op.racineType;
    const noms = op.items.map((item) => `« ${item.name} »`);
    if (noms.length === 1) return `${type} ${noms[0]}`;
    return `${formatNombre.format(noms.length)} ${type.toLowerCase()}s : ${joinFr(noms)}`;
}

function sousTitreOperation(op: OperationCorbeille): string {
    const date = new Date(op.deletedAt).toLocaleString();
    const auteur = op.deletedByNom ?? op.deletedBy;
    return `Supprimé le ${date} par ${auteur}`;
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
    const [saisie, setSaisie] = useState('');
    const saisieRef = useRef<HTMLInputElement>(null);

    const [seulElement] = operation?.items ?? [];
    const phraseAttendue =
        operation?.items.length === 1 && seulElement ? seulElement.name : MOT_CONFIRMATION;
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
                {operation ? `Purger ${titreOperation(operation)} ?` : ''}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    {operation && operation.cascade.length > 0 && (
                        <Alert severity="warning">
                            <Typography variant="body2" component="span">
                                Contient <strong>{joinFr(operation.cascade.map(formatEntry))}</strong>.
                            </Typography>
                        </Alert>
                    )}
                    <DialogContentText>
                        La purge détruit définitivement ces données. Aucune restauration ne
                        sera possible ensuite.
                    </DialogContentText>
                    <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                            Pour confirmer, saisissez <strong>{phraseAttendue}</strong> :
                        </Typography>
                        <TextField
                            inputRef={saisieRef}
                            value={saisie}
                            onChange={(event) => { setSaisie(event.target.value); }}
                            size="small"
                            fullWidth
                            autoComplete="off"
                            label="Confirmation"
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={fermer}>
                    Annuler
                </Button>
                <Button
                    color="error"
                    disabled={!confirmationOk || enCours}
                    onClick={() => { if (operation) onConfirm(operation); }}
                >
                    Purger définitivement
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
    return (
        <Dialog open={operation !== null} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {operation ? `Restaurer ${titreOperation(operation)} ?` : ''}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Tout ce que cette suppression avait emporté sera rétabli
                    {operation && operation.cascade.length > 0
                        ? ` — ${joinFr(operation.cascade.map(formatEntry))}.`
                        : '.'}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} autoFocus>
                    Annuler
                </Button>
                <Button
                    color="primary"
                    disabled={enCours}
                    onClick={() => { if (operation) onConfirm(operation); }}
                >
                    Restaurer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export function CorbeillePage() {
    const notifications = useNotifications();
    const queryClient = useQueryClient();

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
            notifySuccess(notifications, `${titreOperation(op)} : restauration effectuée.`);
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
            notifySuccess(notifications, `${titreOperation(op)} : purge définitive effectuée.`);
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
                <Typography variant="body2">Chargement de la corbeille…</Typography>
            </Box>
        );
    }

    if (query.isError) {
        return (
            <Alert severity="error" sx={{ m: 2 }}>
                Impossible de lire la corbeille ({messageForError(query.error)}).
            </Alert>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
                Corbeille
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Les suppressions restaurables, de la plus récente à la plus ancienne.
                La purge est définitive.
            </Typography>

            {/* Rien à créer dans une corbeille : le message se suffit, et dit
                d'où viendra ce qui s'y trouvera. */}
            {operations.length === 0 && (
                <Alert severity="info">
                    La corbeille est vide. Les suppressions restaurables apparaîtront ici.
                </Alert>
            )}

            <Stack spacing={2}>
                {operations.map((op) => (
                    <Card key={op.id} variant="outlined">
                        <CardContent>
                            <Typography variant="h6">{titreOperation(op)}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {sousTitreOperation(op)}
                            </Typography>
                            {op.cascade.length > 0 ? (
                                <Typography variant="body2">
                                    Contient {joinFr(op.cascade.map(formatEntry))}.
                                </Typography>
                            ) : (
                                <Typography variant="body2">Aucune donnée liée.</Typography>
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
                                Restaurer
                            </Button>
                            <Button
                                color="error"
                                startIcon={<DeleteForeverIcon />}
                                onClick={() => { setAPurger(op); }}
                                disabled={op.blocking.length > 0 || restauration.isPending || purge.isPending}
                            >
                                Purger
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
