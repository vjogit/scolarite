import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { MRT_Row } from 'material-react-table';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    List,
    ListItem,
    ListItemText,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import type { Datasource, DeleteImpact, DeleteImpactEntry } from './def';
import { messageForError } from '../errorMessages';

/** Au-delà de ce nombre de descendants, la saisie de confirmation est exigée. */
const SEUIL_CONFIRMATION = 100;

/** Nombre d'objets nommés avant le repli sur « et N autres ». */
const MAX_NOMS_AFFICHES = 5;

/** Mot à recopier lorsque plusieurs objets sont sélectionnés. */
const MOT_CONFIRMATION = 'CONFIRMER';

const formatNombre = new Intl.NumberFormat('fr-FR');

/** « 3 promotions », « 1 847 notes ». */
function formatEntry(entry: DeleteImpactEntry): string {
    return `${formatNombre.format(entry.count)} ${entry.label}`;
}

/** Énumération française : « a, b et c ». */
function joinFr(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

interface Props<D extends FieldValues> {
    open: boolean;
    datasource: Datasource<D>;
    selectedRows: MRT_Row<D>[];
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Modale de confirmation de suppression : nomme les objets visés et affiche
 * l'impact réel de la cascade, calculé par le serveur.
 */
export function DeleteConfirmDialog<D extends FieldValues>({
    open,
    datasource,
    selectedRows,
    onClose,
    onConfirm,
}: Props<D>) {
    const [saisie, setSaisie] = useState('');

    const ids = useMemo(
        () => selectedRows.map((row) => datasource.getId(row.original)),
        [selectedRows, datasource],
    );
    const noms = useMemo(
        () => selectedRows.map((row) => datasource.getName(row.original)),
        [selectedRows, datasource],
    );

    const fetchImpact = datasource.deleteImpact;
    const supporteImpact = Boolean(fetchImpact);

    const impactQuery = useQuery<DeleteImpact>({
        queryKey: [...datasource.queryKey, 'delete-impact', ids],
        queryFn: () => fetchImpact!(ids),
        enabled: open && supporteImpact && ids.length > 0,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });

    // La saisie ne doit jamais survivre à la fermeture de la modale.
    useEffect(() => {
        if (!open) setSaisie('');
    }, [open]);

    const impact = impactQuery.data;
    const impactEnCours = supporteImpact && impactQuery.isPending;
    const impactEnEchec = supporteImpact && impactQuery.isError;

    const totalCascade = useMemo(
        () => (impact?.cascade ?? []).reduce((total, entry) => total + entry.count, 0),
        [impact],
    );

    const blocages = impact?.blocking ?? [];
    const estBloque = blocages.length > 0;

    // Confirmation renforcée : entité de haut niveau, cascade massive, ou
    // impact inconnu — dans ce dernier cas on ne prétend surtout pas qu'il est nul.
    const confirmationRequise =
        supporteImpact &&
        (datasource.deleteRequiresNameConfirmation === true ||
            totalCascade > SEUIL_CONFIRMATION ||
            impactEnEchec);

    // Sur sélection multiple, recopier cinq noms n'aurait aucun sens.
    const phraseAttendue = selectedRows.length === 1 ? (noms[0] ?? MOT_CONFIRMATION) : MOT_CONFIRMATION;
    const confirmationOk = !confirmationRequise || saisie.trim() === phraseAttendue;

    const suppressionPossible = !estBloque && !impactEnCours && confirmationOk;

    const titre = (() => {
        if (selectedRows.length === 1) {
            const libelle = datasource.deleteEntityLabel ? `${datasource.deleteEntityLabel} ` : '';
            return `Supprimer ${libelle}« ${noms[0]} » ?`;
        }
        // Sans libellé explicite, on conserve le mot neutre déjà utilisé par la
        // modale d'origine : certains titres de liste ne sont pas des pluriels.
        const pluriel = datasource.deleteEntityLabelPlural ?? 'éléments';
        return `Supprimer ${formatNombre.format(selectedRows.length)} ${pluriel} ?`;
    })();

    const nomsAffiches = noms.slice(0, MAX_NOMS_AFFICHES);
    const nomsRestants = noms.length - nomsAffiches.length;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            aria-labelledby="delete-dialog-title"
        >
            <DialogTitle id="delete-dialog-title">{titre}</DialogTitle>

            <DialogContent>
                <Stack spacing={2}>
                    {selectedRows.length > 1 && (
                        <Box>
                            <DialogContentText>Objets sélectionnés :</DialogContentText>
                            <List dense disablePadding>
                                {nomsAffiches.map((nom, index) => (
                                    <ListItem key={`${ids[index]}`} disablePadding sx={{ pl: 1 }}>
                                        <ListItemText primary={`• ${nom}`} />
                                    </ListItem>
                                ))}
                            </List>
                            {nomsRestants > 0 && (
                                <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                                    et {formatNombre.format(nomsRestants)}{' '}
                                    {nomsRestants > 1 ? 'autres' : 'autre'}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {impactEnCours && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2">Analyse de l'impact en cours…</Typography>
                        </Box>
                    )}

                    {impactEnEchec && (
                        <Alert severity="warning">
                            Impossible d'évaluer l'impact de cette suppression
                            {impactQuery.error ? ` (${messageForError(impactQuery.error)})` : ''}. Des
                            données liées peuvent exister et seraient définitivement perdues.
                        </Alert>
                    )}

                    {impact && !estBloque && (
                        <>
                            {impact.cascade.length === 0 ? (
                                <Alert severity="info">Aucune donnée liée.</Alert>
                            ) : (
                                <Alert severity="warning">
                                    <Typography variant="body2" component="span">
                                        {selectedRows.length === 1
                                            ? <>« {noms[0]} » contient </>
                                            : 'La sélection contient '}
                                        <strong>{joinFr(impact.cascade.map(formatEntry))}</strong>. Tout
                                        sera définitivement supprimé.
                                    </Typography>
                                </Alert>
                            )}

                            {impact.detached.length > 0 && (
                                <Alert severity="info">
                                    Ne sera pas supprimé, mais perdra son lien :{' '}
                                    {joinFr(impact.detached.map(formatEntry))}.
                                </Alert>
                            )}
                        </>
                    )}

                    {estBloque && (
                        <Alert severity="error">
                            <Stack spacing={0.5}>
                                {blocages.map((blocage) => (
                                    <Typography key={blocage.reason} variant="body2">
                                        {blocage.message}
                                    </Typography>
                                ))}
                            </Stack>
                        </Alert>
                    )}

                    {!supporteImpact && (
                        <DialogContentText>
                            Cette action est irréversible.
                        </DialogContentText>
                    )}

                    {!estBloque && confirmationRequise && (
                        <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                Pour confirmer, saisissez <strong>{phraseAttendue}</strong> :
                            </Typography>
                            <TextField
                                value={saisie}
                                onChange={(event) => setSaisie(event.target.value)}
                                size="small"
                                fullWidth
                                autoComplete="off"
                                label="Confirmation"
                            />
                        </Box>
                    )}
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} autoFocus>
                    Annuler
                </Button>
                <Button onClick={onConfirm} color="error" disabled={!suppressionPossible}>
                    Supprimer
                </Button>
            </DialogActions>
        </Dialog>
    );
}
