import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';

interface Props {
    open: boolean;
    /** Rester : action par défaut, également déclenchée par Échap et le clic hors modale. */
    onStay: () => void;
    /** Quitter en abandonnant la saisie. */
    onLeave: () => void;
}

/**
 * Confirmation avant d'abandonner une saisie non enregistrée.
 *
 * Aucun bouton ne s'appelle « Annuler » : le formulaire a déjà un bouton de ce
 * nom, qui signifie l'inverse — abandonner la saisie. Les deux libellés
 * nomment donc leur conséquence.
 */
export function UnsavedChangesDialog({ open, onStay, onLeave }: Props) {
    const { t } = useTranslation('crud');
    const resterRef = useRef<HTMLButtonElement>(null);

    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onStay(); }}>
            {/* Pas de croix de fermeture (parité MUI) : les deux issues restent
                « Rester » et « Quitter ». `initialFocus` remplace le
                contournement du piège à focus MUI (`onEntered`) : le focus
                initial va sur l'action qui préserve le travail. */}
            <DialogContent showCloseButton={false} initialFocus={resterRef}>
                <DialogHeader>
                    <DialogTitle>{t('unsavedDialog.titre')}</DialogTitle>
                    <DialogDescription>{t('unsavedDialog.corps')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" ref={resterRef} onClick={onStay}>
                        {t('unsavedDialog.rester')}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onLeave}>
                        {t('unsavedDialog.quitter')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
