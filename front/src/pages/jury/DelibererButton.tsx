import { useState } from 'react';
import { Gavel, Undo2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { ChampInterrupteur } from '../../services/ChampChoix';
import { apiInstance } from '../../services/api';
import { ENDPOINT_DELIBERER } from './def';
import { notifyError, notifySuccess, notifyUndone } from '../../services/notify';

interface Props {
    periodeId: string;
    userId: number;
    userName: string;
    isDelibere: boolean;
    /** undefined tant que la liste des délibérations n'est pas chargée */
    compteCumulActuel?: boolean;
    /**
     * UE non évaluées de l'élève. Non vide, le dossier est incomplet et la
     * délibération est refusée — ici comme au serveur.
     */
    uesNonEvaluees?: readonly string[];
}

/** Le seul réglage de la modale. */
interface ValeursDeliberation {
    compte_cumul: boolean;
}

export function DelibererButton({ periodeId, userId, userName, isDelibere, compteCumulActuel, uesNonEvaluees = [] }: Props) {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();
    const { t } = useTranslation('jury');

    const deliberationKey = ['jury-deliberations', periodeId];

    const deliberer = useMutation({
        mutationFn: (compteCumul: boolean) =>
            apiInstance.post(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`, { compte_cumul: compteCumul }),
        onSuccess: () => {
            notifySuccess(t('delibererBouton.succes', { nom: userName }));
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
            setOpen(false);
        },
        onError: () => {
            notifyError(t('delibererBouton.erreur'));
        },
    });

    const annuler = useMutation({
        mutationFn: () =>
            apiInstance.delete(`${ENDPOINT_DELIBERER(periodeId)}/${userId}`),
        onSuccess: () => {
            notifyUndone(t('delibererBouton.annulationSucces', { nom: userName }));
            void queryClient.invalidateQueries({ queryKey: deliberationKey });
        },
        onError: () => {
            notifyError(t('delibererBouton.annulationErreur'));
        },
    });

    if (isDelibere) {
        return (
            <Tooltip>
                <TooltipTrigger
                    render={(
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('delibererBouton.annulerAriaLabel', { nom: userName })}
                            className="text-warning hover:text-warning"
                            onClick={() => { annuler.mutate(); }}
                            disabled={annuler.isPending}
                        />
                    )}
                >
                    {annuler.isPending ? <Spinner aria-hidden /> : <Undo2 />}
                </TooltipTrigger>
                <TooltipContent>{t('delibererBouton.annulerTooltip')}</TooltipContent>
            </Tooltip>
        );
    }

    // Dossier incomplet : le bouton reste visible mais inerte, et l'infobulle
    // nomme les UE en cause. Laisser cliquer pour n'obtenir qu'un 409 ferait
    // porter au serveur une explication que l'écran a déjà sous la main.
    // `focusableWhenDisabled` : un bouton `disabled` n'émet ni survol ni focus,
    // l'infobulle ne s'ouvrirait jamais — MUI l'enveloppait d'un `<span>` pour
    // la même raison. Base UI le rend `aria-disabled`, inerte au clic, mais
    // atteignable au clavier : l'explication l'est aussi.
    if (uesNonEvaluees.length > 0) {
        return (
            <Tooltip>
                <TooltipTrigger
                    render={(
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled
                            focusableWhenDisabled
                            aria-label={t('delibererBouton.impossibleAriaLabel', { nom: userName })}
                        />
                    )}
                >
                    <Gavel />
                </TooltipTrigger>
                <TooltipContent>
                    <div>
                        {t('delibererBouton.impossibleTitre')}
                        <br />
                        {t('delibererBouton.uniteNonEvaluee', { count: uesNonEvaluees.length })} :{' '}
                        {uesNonEvaluees.join(', ')}.
                        <br />
                        {t('delibererBouton.repasseraEnJury', { nom: userName })}
                    </div>
                </TooltipContent>
            </Tooltip>
        );
    }

    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={(
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('delibererBouton.delibererAriaLabel', { nom: userName })}
                            className="text-primary hover:text-primary"
                            onClick={() => { setOpen(true); }}
                        />
                    )}
                >
                    <Gavel />
                </TooltipTrigger>
                <TooltipContent>{t('delibererBouton.delibererTooltip')}</TooltipContent>
            </Tooltip>

            <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) setOpen(false); }}>
                {/* Pas de croix (parité MUI) ; hauteur bornée et corps
                    défilant (lot 14), pour un écran bas. */}
                <DialogContent
                    className="max-h-[calc(100vh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md"
                    showCloseButton={false}
                >
                    <DialogHeader>
                        <DialogTitle>{t('delibererBouton.titreDialog', { nom: userName })}</DialogTitle>
                    </DialogHeader>
                    <FormulaireDeliberation
                        compteCumulInitial={compteCumulActuel ?? true}
                        enCours={deliberer.isPending}
                        onClose={() => { setOpen(false); }}
                        onConfirm={(compteCumul) => { deliberer.mutate(compteCumul); }}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Le formulaire, monté DANS le popup (motif du lot 14) : Base UI démonte le
 * contenu à la fermeture, chaque ouverture repart de la valeur connue —
 * l'ancien `setCompteCumul(compteCumulActuel ?? true)` rejoué à l'ouverture.
 */
function FormulaireDeliberation({ compteCumulInitial, enCours, onClose, onConfirm }: {
    compteCumulInitial: boolean;
    enCours: boolean;
    onClose: () => void;
    onConfirm: (compteCumul: boolean) => void;
}) {
    const { t } = useTranslation('jury');
    const { control, handleSubmit } = useForm<ValeursDeliberation>({
        defaultValues: { compte_cumul: compteCumulInitial },
    });

    return (
        <>
            <div className="-mx-1 -mt-2 flex flex-col gap-4 overflow-y-auto px-1 pt-2">
                <p className="m-0 text-sm">
                    {t('delibererBouton.descriptionPrefixe')}<strong>jury_result</strong>{t('delibererBouton.descriptionSuffixe')}
                </p>
                <ChampInterrupteur
                    name="compte_cumul"
                    control={control}
                    label={t('delibererBouton.compterGpaCumule')}
                    aide={t('delibererBouton.decocherRedoublant')}
                    className="mb-0"
                />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>{t('commun.annuler')}</Button>
                <Button
                    type="button"
                    onClick={() => { void handleSubmit(({ compte_cumul }) => { onConfirm(compte_cumul); })(); }}
                    disabled={enCours}
                >
                    {enCours ? <Spinner aria-hidden /> : <Gavel />}
                    {t('commun.confirmer')}
                </Button>
            </DialogFooter>
        </>
    );
}
