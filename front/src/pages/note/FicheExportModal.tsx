import { useId, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import {
    Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from '../../components/ui/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { InputGroupAddon } from '../../components/ui/input-group';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { ENDPOINT_GROUPE } from '../structure/def';
import { ENDPOINT_BASE } from './def';
import type { Groupe } from '../structure/Groupe';
import { notifyError } from '../../services/notify';
import { messageForError } from '../../services/errorMessages';

interface Props {
    open: boolean;
    controleId: number | null;
    optionId: string;
    onClose: () => void;
}

export function FicheExportModal({ open, controleId, optionId, onClose }: Props) {
    const { t } = useTranslation('note');
    const idGroupe = useId();
    const [selectedGroupe, setSelectedGroupe] = useState<Groupe | null>(null);
    const [downloading, setDownloading] = useState(false);

    const { data: groupes = [], isLoading } = useQuery<Groupe[]>({
        queryKey: ['groupe', optionId],
        queryFn: () => apiInstance.get<Groupe[]>(`${ENDPOINT_GROUPE}?option_id=${optionId}`).then(r => r.data),
        enabled: open && !!optionId,
    });

    const handleClose = () => {
        setSelectedGroupe(null);
        onClose();
    };

    const handleDownload = async () => {
        if (!controleId || !selectedGroupe) return;
        setDownloading(true);
        try {
            const response = await apiInstance.get<Blob>(
                `${ENDPOINT_BASE}/note/fiche/export?controle_id=${controleId}&groupe_id=${selectedGroupe.id}`,
                { responseType: 'blob' },
            );
            // Le serveur nomme la fiche ; le repli ne sert que s'il se tait.
            telecharger(response, `fiche_${controleId}.xlsx`);
            handleClose();
        } catch (error) {
            // Sans ce `catch`, l'échec ne se voyait nulle part : la modale
            // restait ouverte, le bouton cessait de tourner, et rien ne
            // distinguait un export refusé d'un export terminé.
            notifyError(messageForError(error));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) handleClose(); }}>
            {/* Pas de croix (parité MUI) ; `sm:max-w-[600px]` = le `maxWidth="sm"`
                MUI. Le popup du combobox se portalise vers `<body>` : la modale
                Base UI le reconnaît comme sien. */}
            <DialogContent className="sm:max-w-[600px]" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{t('ficheExportModal.titre')}</DialogTitle>
                </DialogHeader>
                <Combobox
                    items={groupes}
                    itemToStringLabel={(groupe: Groupe) => groupe.name}
                    isItemEqualToValue={(a, b) => a.id === b.id}
                    value={selectedGroupe}
                    onValueChange={(valeur) => { setSelectedGroupe(valeur); }}
                >
                    <div className="flex flex-col gap-1.5">
                        {/* Le nom accessible vient du label, comme celui que le
                            TextField MUI posait. */}
                        <Label htmlFor={idGroupe}>{t('ficheExportModal.groupeLabel')}</Label>
                        <ComboboxInput id={idGroupe} placeholder={t('ficheExportModal.groupePlaceholder')} showClear>
                            {isLoading && (
                                <InputGroupAddon align="inline-end">
                                    <Spinner aria-hidden />
                                </InputGroupAddon>
                            )}
                        </ComboboxInput>
                    </div>
                    <ComboboxContent>
                        <ComboboxEmpty />
                        <ComboboxList>
                            {(groupe: Groupe) => (
                                <ComboboxItem key={groupe.id} value={groupe}>{groupe.name}</ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose}>{t('commun.annuler')}</Button>
                    <Button
                        type="button"
                        onClick={() => { void handleDownload(); }}
                        disabled={!selectedGroupe || downloading}
                    >
                        {downloading ? <Spinner aria-hidden /> : <FileDown />}
                        {t('ficheExportModal.telecharger')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
