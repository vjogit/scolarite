import { useRef } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from '@mui/material';

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
    const resterRef = useRef<HTMLButtonElement>(null);

    return (
        <Dialog
            open={open}
            onClose={onStay}
            maxWidth="xs"
            fullWidth
            aria-labelledby="unsaved-changes-dialog-title"
            // `autoFocus` sur le bouton ne suffit pas : le piège à focus de MUI
            // prend la main sur le conteneur de la modale. On place donc le
            // focus une fois la transition terminée.
            slotProps={{ transition: { onEntered: () => { resterRef.current?.focus(); } } }}
        >
            <DialogTitle id="unsaved-changes-dialog-title">
                Modifications non enregistrées
            </DialogTitle>

            <DialogContent>
                <DialogContentText>
                    Les modifications apportées à ce formulaire seront perdues si vous quittez
                    maintenant.
                </DialogContentText>
            </DialogContent>

            <DialogActions>
                {/* Le focus initial va sur l'action qui préserve le travail. */}
                <Button ref={resterRef} onClick={onStay}>
                    Rester sur la page
                </Button>
                <Button onClick={onLeave} color="error">
                    Quitter sans enregistrer
                </Button>
            </DialogActions>
        </Dialog>
    );
}
