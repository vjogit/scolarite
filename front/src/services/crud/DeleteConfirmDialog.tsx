import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
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
import type { DeleteImpact, DeleteImpactEntry, EntiteCrud } from './def';
import { messageForError } from '../errorMessages';
import { formatNombre } from '../format';

/** Au-delà de ce nombre de descendants, la saisie de confirmation est exigée. */
const SEUIL_CONFIRMATION = 100;

/** Nombre d'objets nommés avant le repli sur « et N autres ». */
const MAX_NOMS_AFFICHES = 5;

/** Mot à recopier lorsque plusieurs objets sont sélectionnés. */
const MOT_CONFIRMATION = 'CONFIRMER';

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
    /**
     * L'entité visée, réduite à ce que la modale lit vraiment : identifiant,
     * nom, libellés, impact. Un `Datasource` en est un — la liste passe le
     * sien —, mais l'arbre de la structure, qui supprime sans table, n'a pas de
     * colonnes à fournir.
     */
    entite: EntiteCrud<D>;
    /** Les objets visés eux-mêmes, et non les lignes d'une table. */
    objets: readonly D[];
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Modale de confirmation de suppression : nomme les objets visés et affiche
 * l'impact réel de la cascade, calculé par le serveur.
 */
export function DeleteConfirmDialog<D extends FieldValues>({
    open,
    entite,
    objets,
    onClose,
    onConfirm,
}: Props<D>) {
    const [saisie, setSaisie] = useState('');
    const saisieRef = useRef<HTMLInputElement>(null);

    const ids = useMemo(
        () => objets.map((objet) => entite.getId(objet)),
        [objets, entite],
    );
    const noms = useMemo(
        () => objets.map((objet) => entite.getName(objet)),
        [objets, entite],
    );

    const fetchImpact = entite.deleteImpact;
    const supporteImpact = Boolean(fetchImpact);

    const impactQuery = useQuery<DeleteImpact>({
        queryKey: [...entite.queryKey, 'delete-impact', ids],
        queryFn: () => fetchImpact!(ids),
        enabled: open && supporteImpact && ids.length > 0,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });

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
        (entite.deleteRequiresNameConfirmation === true ||
            totalCascade > SEUIL_CONFIRMATION ||
            impactEnEchec);

    // La saisie exigée peut naître plus tard que la modale : c'est le cas
    // quand c'est l'ampleur de la cascade, ou l'échec de son analyse, qui la
    // déclenche. Le piège à focus de MUI a alors rendu la main depuis
    // longtemps, un `focus()` direct suffit. Le cas symétrique — saisie
    // présente dès l'ouverture — est traité par `onEntered` sur la modale.
    useEffect(() => {
        if (open && confirmationRequise) saisieRef.current?.focus();
    }, [open, confirmationRequise]);

    // Sur sélection multiple, recopier cinq noms n'aurait aucun sens.
    const phraseAttendue = objets.length === 1 ? (noms[0] ?? MOT_CONFIRMATION) : MOT_CONFIRMATION;
    const confirmationOk = !confirmationRequise || saisie.trim() === phraseAttendue;

    const suppressionPossible = !estBloque && !impactEnCours && confirmationOk;

    const titre = (() => {
        if (objets.length === 1) {
            const libelle = entite.entityLabel ? `${entite.entityLabel} ` : '';
            return `Supprimer ${libelle}« ${noms[0]} » ?`;
        }
        // Sans libellé explicite, on conserve le mot neutre déjà utilisé par la
        // modale d'origine : certains titres de liste ne sont pas des pluriels.
        const pluriel = entite.entityLabelPlural ?? 'éléments';
        return `Supprimer ${formatNombre.format(objets.length)} ${pluriel} ?`;
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
            // Quand la saisie est exigée dès l'ouverture — une entité de haut
            // niveau, dont le marqueur est connu avant toute réponse serveur —
            // le piège à focus de MUI reprend la main et applique l'`autoFocus`
            // du bouton « Annuler ». Même contournement que dans
            // `UnsavedChangesDialog` : on place le focus la transition finie.
            // Sans saisie exigée, on ne touche à rien et « Annuler » le garde.
            slotProps={{
                transition: {
                    onEntered: () => {
                        if (confirmationRequise) saisieRef.current?.focus();
                    },
                    // La saisie ne doit jamais survivre à la fermeture. La vider
                    // à la fin de la transition plutôt que dans un effet évite
                    // un rendu de plus, et le champ ne se vide pas sous les yeux
                    // de l'utilisateur pendant que la modale s'efface.
                    onExited: () => { setSaisie(''); },
                },
            }}
        >
            <DialogTitle id="delete-dialog-title">{titre}</DialogTitle>

            <DialogContent>
                <Stack spacing={2}>
                    {objets.length > 1 && (
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
                                        {objets.length === 1
                                            ? <>« {noms[0]} » contient </>
                                            : 'La sélection contient '}
                                        <strong>{joinFr(impact.cascade.map(formatEntry))}</strong>.{' '}
                                        {entite.suppressionEnCorbeille
                                            ? 'Tout partira en corbeille.'
                                            : 'Tout sera définitivement supprimé.'}
                                    </Typography>
                                </Alert>
                            )}

                            {entite.suppressionEnCorbeille && (
                                <Alert severity="info">
                                    La suppression est restaurable : un administrateur peut tout
                                    rétablir depuis la corbeille, jusqu'à purge définitive.
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
                                inputRef={saisieRef}
                                value={saisie}
                                onChange={(event) => { setSaisie(event.target.value); }}
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
