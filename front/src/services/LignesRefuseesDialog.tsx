import {
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
    Button, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
function libelleChamp(champ: string, t: TFunction<'app'>): string {
    switch (champ) {
        case 'note': return t('lignesRefusees.champs.note');
        case 'user_id': return t('lignesRefusees.champs.userId');
        case 'email': return t('lignesRefusees.champs.email');
        case 'nature': return t('lignesRefusees.champs.nature');
        case 'roles': return t('lignesRefusees.champs.roles');
        default: return champ;
    }
}

interface Props {
    /** null : la modale est fermée. */
    refus: LignesRefusees | null;
    /** Ce qui s'est passé — ou plutôt ne s'est pas passé — en une phrase. */
    sousTitre: string;
    onClose: () => void;
}

export function LignesRefuseesDialog({ refus, sousTitre, onClose }: Props) {
    const { t } = useTranslation('app');
    return (
        <Dialog open={refus !== null} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{t('lignesRefusees.titre')}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>{sousTitre}</DialogContentText>
                <Table size="small" aria-label={t('lignesRefusees.tableAriaLabel')}>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('lignesRefusees.colonneLigne')}</TableCell>
                            <TableCell>{t('lignesRefusees.colonneChamp')}</TableCell>
                            <TableCell>{t('lignesRefusees.colonneMotif')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(refus?.lignes ?? []).map((l) => (
                            <TableRow key={`${String(l.ligne)}·${l.champ ?? ''}·${l.motif}·${l.valeur ?? ''}`}>
                                <TableCell>{l.ligne ?? '—'}</TableCell>
                                <TableCell>{l.champ ? libelleChamp(l.champ, t) : '—'}</TableCell>
                                <TableCell>{messageLigneRefusee(l, refus?.bareme)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('lignesRefusees.fermer')}</Button>
            </DialogActions>
        </Dialog>
    );
}
