import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Button } from '../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
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
        <Dialog open={refus !== null} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            {/* Pas de croix de fermeture (parité MUI) : « Fermer » est la
                seule issue nommée. `sm:max-w-4xl` ≈ le `maxWidth="md"` MUI. */}
            <DialogContent className="sm:max-w-4xl" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{t('lignesRefusees.titre')}</DialogTitle>
                    <DialogDescription>{sousTitre}</DialogDescription>
                </DialogHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label={t('lignesRefusees.tableAriaLabel')}>
                        <thead>
                            <tr className="border-b text-left">
                                <th scope="col" className="px-2 py-1.5 font-medium">{t('lignesRefusees.colonneLigne')}</th>
                                <th scope="col" className="px-2 py-1.5 font-medium">{t('lignesRefusees.colonneChamp')}</th>
                                <th scope="col" className="px-2 py-1.5 font-medium">{t('lignesRefusees.colonneMotif')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(refus?.lignes ?? []).map((l) => (
                                <tr key={`${String(l.ligne)}·${l.champ ?? ''}·${l.motif}·${l.valeur ?? ''}`} className="border-b last:border-b-0">
                                    <td className="px-2 py-1.5">{l.ligne ?? '—'}</td>
                                    <td className="px-2 py-1.5">{l.champ ? libelleChamp(l.champ, t) : '—'}</td>
                                    <td className="px-2 py-1.5">{messageLigneRefusee(l, refus?.bareme)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>{t('lignesRefusees.fermer')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
