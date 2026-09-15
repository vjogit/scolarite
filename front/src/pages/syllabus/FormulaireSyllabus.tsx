/**
 * Le cadre commun des deux écrans syllabus : un formulaire 1-1 qui reste sur
 * place après enregistrement.
 *
 * `services/crud/Form.tsx` n'est pas réutilisable ici : il exige un
 * `Datasource` complet et renvoie vers la liste après chaque écriture — or la
 * fiche n'a pas de liste et se relit sur place (le total encadré doit se
 * recalculer sous les yeux du rédacteur). Tout le reste vient du socle :
 * champs partagés, garde de saisie non enregistrée, focus, routage des
 * erreurs, notifications.
 *
 * Lecture seule par défaut (invariant 3) : sans le rôle d'écriture, les
 * champs sont désactivés et aucun bouton d'écriture n'est rendu.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Resolver } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';

import { Button } from '../../components/ui/button';
import { fieldErrorsFor, messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';
import { premierChampEnErreur, premierChampSaisissable } from '../../services/crud/focus';
import type { RenderProps } from '../../services/crud/def';
import { useUnsavedChangesGuard } from '../../services/useUnsavedChangesGuard';
import { UnsavedChangesDialog } from '../../services/UnsavedChangesDialog';

interface Props<D extends FieldValues> {
    titre: string;
    schema: ZodType<D, FieldValues>;
    valeursInitiales: DefaultValues<D>;
    peutEcrire: boolean;
    /**
     * Écrit, puis renvoie ce que le formulaire doit désormais tenir pour ses
     * valeurs de référence — la réponse du serveur, complétée de ce que
     * l'écran lui ajoute (le nom du responsable).
     */
    enregistrer: (valeurs: D) => Promise<D>;
    messageSucces: string;
    /** Où mènent « Retour » et « Annuler » : le détail de l'entité porteuse. */
    cheminRetour: string;
    render: (props: RenderProps<D>) => ReactNode;
    /**
     * Une saisie non enregistrée hors de ce formulaire — la matrice de
     * compétences de l'UE (lot 3), qui a son propre bouton d'enregistrement.
     * react-router ne tient qu'un bloqueur par routeur : la garde est unique,
     * et c'est celle-ci.
     */
    modificationsExternes?: boolean;
    /** Ce qui s'affiche sous le formulaire, sous la même garde. */
    complement?: ReactNode;
}

export function FormulaireSyllabus<D extends FieldValues>({
    titre, schema, valeursInitiales, peutEcrire, enregistrer, messageSucces, cheminRetour, render,
    modificationsExternes = false, complement,
}: Props<D>) {
    const { t } = useTranslation('crud');
    const { t: tSyllabus } = useTranslation('syllabus');
    const navigate = useNavigate();
    const formulaireRef = useRef<HTMLFormElement>(null);
    const isReadOnly = !peutEcrire;
    // Champs refusés par le dernier appel serveur — un tableau neuf à chaque
    // refus, y compris identique au précédent : l'effet doit rejouer.
    const [champsRefuses, setChampsRefuses] = useState<string[]>([]);

    const { register, handleSubmit, control, setError, reset, formState: { errors, dirtyFields }, getValues, setValue } = useForm<D>({
        // Même affirmation que dans `Form.tsx` : le résolveur de zod et le
        // générique de react-hook-form ne se rejoignent pas.
        resolver: zodResolver(schema) as Resolver<D>,
        defaultValues: valeursInitiales,
    });

    const mutation = useMutation({
        mutationFn: enregistrer,
        onSuccess: (valeurs) => {
            // Les valeurs enregistrées deviennent la référence : la version
            // avance, le formulaire redevient « non modifié », rien ne bouge
            // à l'écran.
            reset(valeurs);
            notifySuccess(messageSucces);
        },
        onError: (error) => {
            const fields = fieldErrorsFor(error);
            if (fields) {
                Object.entries(fields).forEach(([field, message]) => {
                    setError(field as Parameters<typeof setError>[0], { type: 'server', message });
                });
                setChampsRefuses(Object.keys(fields));
                return;
            }
            // Un 409 arrive ici : le message canonique du code, rien de plus.
            notifyError(messageForError(error));
        },
    });

    const hasUnsavedChanges = (peutEcrire && Object.keys(dirtyFields).length > 0 && !mutation.isPending) || modificationsExternes;
    const guard = useUnsavedChangesGuard(hasUnsavedChanges);

    useEffect(() => {
        if (isReadOnly) return;
        premierChampSaisissable(formulaireRef.current)?.focus();
    }, [isReadOnly]);

    useEffect(() => {
        if (champsRefuses.length === 0) return;
        premierChampEnErreur(formulaireRef.current, champsRefuses)?.focus();
    }, [champsRefuses]);

    return (
        <>
            <div className="mt-4 flex justify-center">
                {/* `noValidate` : même arbitrage que `Form.tsx`, zod tranche. */}
                <form
                    ref={formulaireRef}
                    noValidate
                    onSubmit={(event) => { void handleSubmit((valeurs) => { mutation.mutate(valeurs); })(event); }}
                    className="flex w-full max-w-[800px] flex-col gap-2.5"
                >
                    <h2>{titre}</h2>

                    {render({ register, control, errors, isReadOnly, getValues, setValue })}

                    <div className="mt-4 flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => { guard.requestNavigation(() => { void navigate(cheminRetour); }); }}
                        >
                            {isReadOnly ? t('form.retour') : t('form.annuler')}
                        </Button>
                        {peutEcrire && (
                            <Button type="submit" disabled={mutation.isPending}>
                                {mutation.isPending ? t('form.chargement') : tSyllabus('enregistrer')}
                            </Button>
                        )}
                    </div>
                </form>
            </div>

            {complement !== undefined && (
                <div className="mt-8 flex justify-center">
                    {complement}
                </div>
            )}

            <UnsavedChangesDialog
                open={guard.isBlocked}
                onStay={guard.cancelLeave}
                onLeave={guard.confirmLeave}
            />
        </>
    );
}
