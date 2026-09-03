/**
 * Les champs de choix partagés — les remplaçants du `TextField select` et du
 * `Switch` MUI (lot 13). Même contrat que `ChampTexte` : `name`, `control`,
 * `label`, `disabled` ; câblage react-hook-form, erreur et état désactivé
 * dans le composant.
 *
 * `ChampSelection` monte le `Select` Base UI plutôt qu'un `<select>` natif :
 * c'est le contrôle que la suite e2e sait déjà cibler (`combobox` nommé puis
 * `option`, cf. le sélecteur de groupe de la grille), et son popup se vérifie
 * ouvert au navigateur comme tout popup Base UI (piège lot 3 §5).
 * L'`<input>` caché que Base UI rend porte le `name` du champ, et renvoie le
 * focus au déclencheur : `services/crud/focus.ts` continue d'y arriver.
 */

import { useId } from 'react';
import { useController, type FieldValues } from 'react-hook-form';

import { Field, FieldError, FieldLabel } from '../components/ui/field';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Switch } from '../components/ui/switch';
import { cn } from '../lib/utils';
import type { PropsChampBase } from './ChampTexte';

export interface OptionChoix {
    id: string;
    label: string;
}

export interface PropsChampSelection<D extends FieldValues> extends PropsChampBase<D> {
    options: readonly OptionChoix[];
    /**
     * Libellé de l'entrée « aucun choix ». Absente si non fourni ; choisie,
     * elle remet `null` au formulaire (le `*string` côté serveur l'accepte).
     */
    libelleVide?: string;
}

export function ChampSelection<D extends FieldValues>({
    name, control, label, disabled, className, options, libelleVide,
}: PropsChampSelection<D>) {
    // `ref` renommée à la sortie de `field` : même motif que `ChampTexte`.
    const { field: { ref: refChamp, value: valeurChamp, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    // `items` : Base UI affiche le libellé de l'entrée choisie dans le
    // déclencheur, et le libellé de l'entrée `null` tient lieu de placeholder.
    const items = [
        ...(libelleVide === undefined ? [] : [{ value: null, label: libelleVide }]),
        ...options.map((option) => ({ value: option.id, label: option.label })),
    ];
    // Création : `undefined` (absent d'`emptyValue`) ; une chaîne vide venue
    // d'un ancien enregistrement vaut aussi « aucun choix ».
    const valeur: string | null = typeof valeurChamp === 'string' && valeurChamp !== '' ? valeurChamp : null;

    return (
        <Field data-invalid={estInvalide} className={cn('mb-4', className)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select
                items={items}
                value={valeur}
                onValueChange={(choix) => { onChange(choix); }}
                name={name}
                inputRef={refChamp}
                disabled={disabled}
            >
                <SelectTrigger
                    id={id}
                    className="w-full"
                    onBlur={onBlur}
                    aria-invalid={estInvalide ? true : undefined}
                    aria-describedby={estInvalide ? idErreur : undefined}
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {libelleVide !== undefined && <SelectItem value={null}>{libelleVide}</SelectItem>}
                    {options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}

export type PropsChampInterrupteur<D extends FieldValues> = PropsChampBase<D>;

/** Un booléen : le `Switch` (rôle `switch`), libellé à sa droite comme le `FormControlLabel` MUI. */
export function ChampInterrupteur<D extends FieldValues>({
    name, control, label, disabled, className,
}: PropsChampInterrupteur<D>) {
    const { field: { ref: refChamp, value: valeurChamp, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        <Field orientation="horizontal" data-invalid={estInvalide} className={cn('mb-4', className)}>
            <Switch
                id={id}
                name={name}
                inputRef={refChamp}
                checked={valeurChamp === true}
                onCheckedChange={(coche) => { onChange(coche); }}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={estInvalide ? true : undefined}
                aria-describedby={estInvalide ? idErreur : undefined}
            />
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}

export type PropsChampCase<D extends FieldValues> = PropsChampBase<D>;

/**
 * Un booléen en case à cocher (rôle `checkbox`), libellé à sa droite comme le
 * `FormControlLabel` + `Checkbox` MUI. Cinquième champ du contrat, ajouté au
 * lot 14 pour `ReservationDialog` (« Distanciel ») : l'interrupteur aurait
 * changé le contrôle sous les yeux de l'utilisateur, et un écran n'a pas à
 * recâbler une case à la main.
 */
export function ChampCase<D extends FieldValues>({
    name, control, label, disabled, className,
}: PropsChampCase<D>) {
    const { field: { ref: refChamp, value: valeurChamp, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        <Field orientation="horizontal" data-invalid={estInvalide} className={cn('mb-4', className)}>
            <Checkbox
                id={id}
                name={name}
                inputRef={refChamp}
                checked={valeurChamp === true}
                onCheckedChange={(coche) => { onChange(coche); }}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={estInvalide ? true : undefined}
                aria-describedby={estInvalide ? idErreur : undefined}
            />
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}
