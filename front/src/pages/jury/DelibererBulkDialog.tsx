import { Gavel } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Separator } from '../../components/ui/separator';
import { Spinner } from '../../components/ui/spinner';
import { ChampInterrupteur } from '../../services/ChampChoix';

// ─────────────────────────────────────────────────────────────────────────────

export interface BulkStudent {
    userId: number;
    name: string;
}

interface Props {
    open: boolean;
    students: BulkStudent[];
    loading: boolean;
    onClose: () => void;
    /** Appelé avec la liste des élèves à délibérer + leur compte_cumul */
    onConfirm: (entries: { user_id: number; compte_cumul: boolean }[]) => void;
}

/** Le seul réglage de la modale : compte_cumul, appliqué à tous. */
interface ValeursDeliberationGroupee {
    compte_cumul: boolean;
}

/**
 * La modale. Le formulaire est monté DANS le popup (motif du lot 14) : Base
 * UI démonte le contenu à la fermeture, chaque ouverture repart de la valeur
 * par défaut — l'ancien `useState(true)` de la modale MUI, remis à zéro par
 * le démontage plutôt qu'à la main.
 */
export function DelibererBulkDialog({ open, students, loading, onClose, onConfirm }: Props) {
    const { t } = useTranslation('jury');

    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            {/* Pas de croix (parité MUI) ; hauteur bornée et corps défilant
                (lot 14) : la liste des élèves est déjà bornée, mais titre et
                actions doivent rester en vue sur un écran bas. */}
            <DialogContent
                className="max-h-[calc(100vh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md"
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle>{t('delibererBulkDialog.titre', { count: students.length })}</DialogTitle>
                </DialogHeader>
                <FormulaireDeliberationGroupee
                    students={students}
                    loading={loading}
                    onClose={onClose}
                    onConfirm={onConfirm}
                />
            </DialogContent>
        </Dialog>
    );
}

function FormulaireDeliberationGroupee({ students, loading, onClose, onConfirm }: Omit<Props, 'open'>) {
    const { t } = useTranslation('jury');
    const { control, handleSubmit } = useForm<ValeursDeliberationGroupee>({
        defaultValues: { compte_cumul: true },
    });

    const confirmer = ({ compte_cumul }: ValeursDeliberationGroupee) => {
        onConfirm(students.map(s => ({ user_id: s.userId, compte_cumul })));
    };

    return (
        <>
            {/* Marges négatives compensées : de la place pour l'anneau de
                focus, que le bord du défilement rognerait sinon (lot 14). */}
            <div className="-mx-1 -mt-2 flex flex-col gap-2 overflow-y-auto px-1 pt-2">
                <ChampInterrupteur
                    name="compte_cumul"
                    control={control}
                    label={t('delibererBulkDialog.compterGpaCumule')}
                    aide={t('delibererBulkDialog.decocherRedoublants')}
                    className="mb-0"
                />
                <Separator />
                <ul className="m-0 max-h-[260px] list-none overflow-y-auto p-0">
                    {students.map(s => (
                        <li key={s.userId} className="py-1 text-sm">{s.name}</li>
                    ))}
                </ul>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                    {t('commun.annuler')}
                </Button>
                <Button
                    type="button"
                    onClick={() => { void handleSubmit(confirmer)(); }}
                    disabled={loading || students.length === 0}
                >
                    {/* Le libellé porte l'information : le spinner n'a rien à
                        annoncer de plus. Icône nue : la taille vient du bouton. */}
                    {loading ? <Spinner aria-hidden /> : <Gavel />}
                    {t('commun.confirmer')}
                </Button>
            </DialogFooter>
        </>
    );
}
