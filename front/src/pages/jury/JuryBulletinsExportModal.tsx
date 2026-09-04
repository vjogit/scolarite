import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FileText } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { ChampTexte } from '../../services/ChampTexte';

// ─────────────────────────────────────────────────────────────────────────────

export interface BulletinParams {
    entete_ligne_1: string;
    entete_ligne_2: string;
    entete_ligne_3: string;
    entete_ligne_4: string;
    entete_ligne_5: string;
    periode: string;
    entete_ue: string;
    date_jury: string;
    nom_responsable: string;
}

const defaultParams: BulletinParams = {
    entete_ligne_1: '',
    entete_ligne_2: '',
    entete_ligne_3: '',
    entete_ligne_4: '',
    entete_ligne_5: '',
    periode: '',
    entete_ue: '',
    date_jury: '',
    nom_responsable: '',
};

/** Les neuf champs, dans l'ordre du bulletin, avec leur libellé. */
function champsBulletin(t: TFunction<'jury'>): { name: keyof BulletinParams; label: string }[] {
    return [
        { name: 'entete_ligne_1', label: t('exportBulletins.champEnteteLigne1') },
        { name: 'entete_ligne_2', label: t('exportBulletins.champEnteteLigne2') },
        { name: 'entete_ligne_3', label: t('exportBulletins.champEnteteLigne3') },
        { name: 'entete_ligne_4', label: t('exportBulletins.champEnteteLigne4') },
        { name: 'entete_ligne_5', label: t('exportBulletins.champEnteteLigne5') },
        { name: 'periode', label: t('exportBulletins.champPeriode') },
        { name: 'entete_ue', label: t('exportBulletins.champEnteteUe') },
        { name: 'date_jury', label: t('exportBulletins.champDateJury') },
        { name: 'nom_responsable', label: t('exportBulletins.champNomResponsable') },
    ];
}

interface Props {
    open: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: (params: BulletinParams) => void;
}

export function JuryBulletinsExportModal({ open, loading, onClose, onConfirm }: Props) {
    const { t } = useTranslation('jury');
    // Le formulaire vit ici, au niveau de la modale, et non dans le popup :
    // les paramètres saisis survivent à une fermeture puis une réouverture,
    // comme l'état de la modale MUI, qui restait montée. Les champs, eux,
    // sont démontés avec le popup ; react-hook-form garde leurs valeurs.
    const { control, handleSubmit } = useForm<BulletinParams>({ defaultValues: defaultParams });

    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            {/* Pas de croix (parité MUI). Hauteur bornée et corps défilant
                (lot 14) : neuf champs dépassent un écran bas, titre et bouton
                d'export doivent rester en vue. */}
            <DialogContent
                className="max-h-[calc(100vh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[600px]"
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle>{t('exportBulletins.titreParametres')}</DialogTitle>
                </DialogHeader>
                <div className="-mx-1 -mt-2 flex flex-col gap-4 overflow-y-auto px-1 pt-2">
                    {champsBulletin(t).map(({ name, label }) => (
                        <ChampTexte key={name} name={name} control={control} label={label} className="mb-0" />
                    ))}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        {t('commun.annuler')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => { void handleSubmit(onConfirm)(); }}
                        disabled={loading}
                    >
                        {loading ? <Spinner aria-hidden /> : <FileText />}
                        {t('exportBulletins.exporter')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
