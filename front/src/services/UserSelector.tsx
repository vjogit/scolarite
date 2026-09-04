import { useId, useState, useEffect, useMemo } from 'react';
import type { Control, FieldErrors, FieldValues, Path, PathValue, UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from '../components/ui/combobox';
import { InputGroupAddon } from '../components/ui/input-group';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { apiInstance } from './api';

export interface UserOption {
    id: number;
    firstName: string;
    lastName: string;
}

/** « Nom Prénom », l'affichage de l'option comme du champ. */
function libelleOption(option: UserOption): string {
    return `${option.lastName} ${option.firstName}`;
}

// `FieldValues` porte déjà la signature d'index qu'exige react-hook-form :
// l'étendre évite de la redéclarer en `any` pour notre compte.
interface FormFields extends FieldValues {
    id: number;
    user_id: number | null | undefined;
    firstName?: string;
    lastName?: string;
}

interface UserSelectorProps<T extends FormFields> {
    control: Control<T>;
    errors: FieldErrors<T>;
    /**
     * Plus lu depuis le lot 14 (la sélection vient de `useWatch`), mais
     * gardé dans la signature : cinq écrans le passent, dont trois hors de
     * ce lot. À retirer avec eux.
     */
    getValues: UseFormGetValues<T>;
    setValue: UseFormSetValue<T>;
    isReadOnly?: boolean;
    /**
     * Prévenu du choix, en plus de l'écriture dans le formulaire. L'axe Élève
     * porte l'élève dans l'URL et non dans un état : il navigue ici, plutôt que
     * d'observer le champ et de naviguer depuis un effet — ce qui republierait
     * la même entrée d'historique à chaque rendu et ferait boucler le retour
     * navigateur.
     */
    onChoisir?: (eleve: UserOption | null) => void;
}

export const UserSelector = <T extends FormFields>({
    control,
    errors,
    setValue,
    isReadOnly = false,
    onChoisir,
}: UserSelectorProps<T>) => {
    const { t } = useTranslation('app');
    const idChamp = useId();
    // Le texte tapé, pour la recherche serveur seulement : le champ lui-même
    // n'est plus contrôlé (voir le commentaire du `Combobox`).
    const [recherche, setRecherche] = useState('');
    const [rechercheDifferee, setRechercheDifferee] = useState('');

    /**
     * La sélection est LUE dans le formulaire, pas recopiée dans un état.
     *
     * Constaté au navigateur (lot 13 §9) : en édition, le champ s'ouvrait
     * vide alors qu'un élève était bien sélectionné — un `useState('')` pour
     * le texte du champ, à côté d'un `selectedUser` reconstruit une fois au
     * montage depuis `getValues`. Deux états locaux, deux occasions de
     * diverger du formulaire : à l'ouverture en édition (constaté), et à
     * tout `reset` du parent (déduit par lecture : GroupeUserPage remet le
     * formulaire à vide après un ajout, l'ancien état gardait l'élève ajouté
     * sous les yeux de l'utilisateur).
     * `useWatch` suit le formulaire dans les deux sens, et l'objet est
     * mémorisé sur ses trois valeurs : Base UI compare `value` par référence
     * pour décider de resynchroniser le texte du champ.
     */
    const valeurs = useWatch({ control });
    const { user_id: idEleve, firstName: prenom, lastName: nom } = valeurs;
    const eleveChoisi = useMemo<UserOption | null>(
        () => (typeof idEleve === 'number' && typeof prenom === 'string' && typeof nom === 'string' && prenom && nom
            ? { id: idEleve, firstName: prenom, lastName: nom }
            : null),
        [idEleve, prenom, nom],
    );

    useEffect(() => {
        const handler = setTimeout(() => {
            setRechercheDifferee(recherche);
        }, 500);
        return () => { clearTimeout(handler); };
    }, [recherche]);

    const { data: users, isLoading } = useQuery({
        queryKey: ['users', rechercheDifferee],
        queryFn: async () => {
            if (!rechercheDifferee) return [];
            const params = new URLSearchParams({ q: rechercheDifferee });
            const res = await apiInstance.get<UserOption[]>(`/api/v0/user/search?${params.toString()}`);
            return res.data;
        },
        enabled: !isReadOnly,
    });

    const messageErreur = errors.user_id?.message;

    if (isReadOnly) {
        return (
            <div className="mb-4 flex flex-col gap-1.5">
                <Label htmlFor={idChamp}>{t('userSelector.champEleve')}</Label>
                <Input
                    id={idChamp}
                    value={eleveChoisi ? libelleOption(eleveChoisi) : ''}
                    disabled
                    readOnly
                />
            </div>
        );
    }

    return (
        <Controller
            name={'user_id' as Path<T>}
            control={control}
            render={({ field }) => (
                <Combobox
                    items={users ?? []}
                    // Le filtrage est serveur : la liste reçue s'affiche telle quelle.
                    filter={null}
                    itemToStringLabel={libelleOption}
                    isItemEqualToValue={(a, b) => a.id === b.id}
                    value={eleveChoisi}
                    // `inputValue` volontairement non contrôlé : en mode
                    // simple, Base UI affiche le libellé de `value` au montage
                    // et le resynchronise à chaque changement de `value` —
                    // c'est ce qui remplit le champ en édition et le vide
                    // après un `reset`. On ne fait qu'écouter la frappe.
                    onInputValueChange={(valeur) => { setRecherche(valeur); }}
                    onValueChange={(newValue) => {
                        field.onChange(newValue?.id ?? null);
                        setValue('firstName' as Path<T>, (newValue?.firstName ?? '') as PathValue<T, Path<T>>);
                        setValue('lastName' as Path<T>, (newValue?.lastName ?? '') as PathValue<T, Path<T>>);
                        onChoisir?.(newValue);
                    }}
                >
                    <div className="mb-4 flex flex-col gap-1.5">
                        {/* Le nom accessible vient du label, comme celui que le
                            TextField MUI posait. */}
                        <Label htmlFor={idChamp}>{t('userSelector.rechercherEleve')}</Label>
                        <ComboboxInput
                            id={idChamp}
                            aria-invalid={messageErreur ? true : undefined}
                            showClear
                        >
                            {isLoading && (
                                <InputGroupAddon align="inline-end">
                                    {/* Le résultat qui arrive porte l'information :
                                        le spinner n'annonce rien de plus. */}
                                    <Spinner aria-hidden />
                                </InputGroupAddon>
                            )}
                        </ComboboxInput>
                        {messageErreur !== undefined && (
                            // Le générique `T` transforme le type du message en
                            // conditionnel que React n'accepte pas : c'est le seul
                            // endroit du projet où l'assertion est vraiment nécessaire.
                            <p className="text-sm text-destructive">{messageErreur as string}</p>
                        )}
                    </div>
                    <ComboboxContent>
                        <ComboboxEmpty>{t('userSelector.aucuneOption')}</ComboboxEmpty>
                        <ComboboxList>
                            {(option: UserOption) => (
                                <ComboboxItem key={option.id} value={option}>
                                    {libelleOption(option)}
                                </ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
            )}
        />
    );
};
