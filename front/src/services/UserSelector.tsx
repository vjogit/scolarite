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
    /** `ELEVE` ou `AGENT`, tel que `/user/search` le renvoie ; sert au filtrage côté client. */
    type_personne?: string;
}

/** « Nom Prénom », l'affichage de l'option comme du champ. */
function libelleOption(option: UserOption): string {
    return `${option.lastName} ${option.firstName}`;
}

/** Les deux champs du formulaire où le nom de la personne choisie est recopié. */
export interface ChampsNom<T extends FieldValues> {
    prenom: Path<T>;
    nom: Path<T>;
}

/** Les deux libellés du champ : en consultation, et en saisie (recherche). */
export interface LibellesSelecteur {
    champ: string;
    rechercher: string;
}

interface UserSelectorProps<T extends FieldValues> {
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
    /**
     * Le champ du formulaire qui reçoit l'identifiant. Par défaut `user_id`,
     * l'élève des cinq écrans historiques ; le syllabus (lot 2) y met
     * `responsable_id`.
     */
    name?: Path<T>;
    /** Où recopier le nom de la personne choisie. Par défaut `firstName`/`lastName`. */
    champsNom?: ChampsNom<T>;
    /** Libellés du champ. Par défaut ceux de l'élève (`app.userSelector`). */
    libelles?: LibellesSelecteur;
    /**
     * Restriction côté client des résultats de la recherche — le serveur ne
     * filtre pas par nature de personne et coupe à 20 résultats avant ce
     * filtre : un préfixe très porté par les élèves peut masquer un agent.
     */
    filtrer?: (option: UserOption) => boolean;
}

const CHAMPS_NOM_PAR_DEFAUT = { prenom: 'firstName', nom: 'lastName' } as const;

function texte(valeur: unknown): string | null {
    return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

export const UserSelector = <T extends FieldValues>({
    control,
    errors,
    setValue,
    isReadOnly = false,
    onChoisir,
    name = 'user_id' as Path<T>,
    champsNom = CHAMPS_NOM_PAR_DEFAUT as unknown as ChampsNom<T>,
    libelles,
    filtrer,
}: UserSelectorProps<T>) => {
    const { t } = useTranslation('app');
    const idChamp = useId();
    const libelleChamp = libelles?.champ ?? t('userSelector.champEleve');
    const libelleRecherche = libelles?.rechercher ?? t('userSelector.rechercherEleve');
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
    const valeurs = useWatch({ control }) as Record<string, unknown>;
    const identifiant = valeurs[name];
    const prenom = texte(valeurs[champsNom.prenom]);
    const nom = texte(valeurs[champsNom.nom]);
    const personneChoisie = useMemo<UserOption | null>(
        () => (typeof identifiant === 'number' && prenom !== null && nom !== null
            ? { id: identifiant, firstName: prenom, lastName: nom }
            : null),
        [identifiant, prenom, nom],
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

    const options = useMemo(
        () => (filtrer === undefined ? users ?? [] : (users ?? []).filter(filtrer)),
        [users, filtrer],
    );

    // Le générique `T` fait du message un type conditionnel : on ne lit ici
    // que la forme brute de l'erreur du champ nommé.
    const erreurChamp = (errors as Record<string, { message?: unknown } | undefined>)[name];
    const messageErreur = typeof erreurChamp?.message === 'string' ? erreurChamp.message : undefined;

    if (isReadOnly) {
        return (
            <div className="mb-4 flex flex-col gap-1.5">
                <Label htmlFor={idChamp}>{libelleChamp}</Label>
                <Input
                    id={idChamp}
                    value={personneChoisie ? libelleOption(personneChoisie) : ''}
                    disabled
                    readOnly
                />
            </div>
        );
    }

    return (
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <Combobox
                    items={options}
                    // Le filtrage est serveur : la liste reçue s'affiche telle quelle.
                    filter={null}
                    itemToStringLabel={libelleOption}
                    isItemEqualToValue={(a, b) => a.id === b.id}
                    value={personneChoisie}
                    // `inputValue` volontairement non contrôlé : en mode
                    // simple, Base UI affiche le libellé de `value` au montage
                    // et le resynchronise à chaque changement de `value` —
                    // c'est ce qui remplit le champ en édition et le vide
                    // après un `reset`. On ne fait qu'écouter la frappe.
                    onInputValueChange={(valeur) => { setRecherche(valeur); }}
                    onValueChange={(newValue) => {
                        field.onChange(newValue?.id ?? null);
                        setValue(champsNom.prenom, (newValue?.firstName ?? '') as PathValue<T, Path<T>>);
                        setValue(champsNom.nom, (newValue?.lastName ?? '') as PathValue<T, Path<T>>);
                        onChoisir?.(newValue);
                    }}
                >
                    <div className="mb-4 flex flex-col gap-1.5">
                        {/* Le nom accessible vient du label, comme celui que le
                            TextField MUI posait. */}
                        <Label htmlFor={idChamp}>{libelleRecherche}</Label>
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
                            <p className="text-sm text-destructive">{messageErreur}</p>
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
