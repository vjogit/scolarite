import { useId, useState, useEffect } from 'react';
import type { Control, FieldErrors, FieldValues, Path, PathValue, UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import  { Controller  } from 'react-hook-form';

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
    getValues,
    setValue,
    isReadOnly = false,
    onChoisir,
}: UserSelectorProps<T>) => {
    const { t } = useTranslation('app');
    const idChamp = useId();
    const [inputValue, setInputValue] = useState('');
    const [debouncedInputValue, setDebouncedInputValue] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserOption | null>(() => {
        const id = getValues('user_id' as Path<T>);
        const firstName = getValues('firstName' as Path<T>);
        const lastName = getValues('lastName' as Path<T>);
        if (id && firstName && lastName) {
            return { id: id as number, firstName, lastName };
        }
        return null;
    });

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedInputValue(inputValue);
        }, 500);
        return () => { clearTimeout(handler); };
    }, [inputValue]);

    const { data: users, isLoading } = useQuery({
        queryKey: ['users', debouncedInputValue],
        queryFn: async () => {
            if (!debouncedInputValue) return [];
            const params = new URLSearchParams({ q: debouncedInputValue });
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
                    value={`${String(getValues('lastName' as Path<T>) ?? '')} ${String(getValues('firstName' as Path<T>) ?? '')}`.trim()}
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
                    value={selectedUser}
                    inputValue={inputValue}
                    onInputValueChange={(valeur) => { setInputValue(valeur); }}
                    onValueChange={(newValue) => {
                        field.onChange(newValue?.id ?? null);
                        setValue('firstName' as Path<T>, (newValue?.firstName ?? '') as PathValue<T, Path<T>>);
                        setValue('lastName' as Path<T>, (newValue?.lastName ?? '') as PathValue<T, Path<T>>);
                        setSelectedUser(newValue);
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
