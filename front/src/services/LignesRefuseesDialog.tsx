import {
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
    Button, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { messageLigneRefusee, type LignesRefusees } from './errorMessages';

/**
 * Le tableau des lignes fautives d'un import refusé.
 *
 * Un refus d'import arrive par paquets — l'enseignant note trente élèves, la
 * gestionnaire marque cinq absents — et se lit fichier ouvert à côté : une
 * notification qui s'efface d'elle-même obligerait à relancer l'import à
 * l'aveugle. La modale reste à l'écran le temps de corriger, et chaque ligne
 * du tableau désigne la ligne du tableur, le champ et le motif traduit.
 *
 * Le serveur n'envoie que des données (extension `lignes` du problème RFC
 * 9457) ; les mots viennent de `messageLigneRefusee`.
 */

/** Libellés des champs tels qu'ils apparaissent dans la colonne du tableau. */
const LIBELLE_CHAMP: Record<string, string> = {
    note: 'Note',
    user_id: 'Élève',
    email: 'Email',
    nature: 'Nature',
    roles: 'Rôles',
};

interface Props {
    /** null : la modale est fermée. */
    refus: LignesRefusees | null;
    /** Ce qui s'est passé — ou plutôt ne s'est pas passé — en une phrase. */
    sousTitre: string;
    onClose: () => void;
}

export function LignesRefuseesDialog({ refus, sousTitre, onClose }: Props) {
    return (
        <Dialog open={refus !== null} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Import refusé</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>{sousTitre}</DialogContentText>
                <Table size="small" aria-label="Lignes refusées">
                    <TableHead>
                        <TableRow>
                            <TableCell>Ligne</TableCell>
                            <TableCell>Champ</TableCell>
                            <TableCell>Motif</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(refus?.lignes ?? []).map((l) => (
                            <TableRow key={`${String(l.ligne)}·${l.champ ?? ''}·${l.motif}·${l.valeur ?? ''}`}>
                                <TableCell>{l.ligne ?? '—'}</TableCell>
                                <TableCell>{l.champ ? LIBELLE_CHAMP[l.champ] ?? l.champ : '—'}</TableCell>
                                <TableCell>{messageLigneRefusee(l, refus?.bareme)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}
