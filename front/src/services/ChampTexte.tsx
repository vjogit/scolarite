/**
 * Les champs de saisie partagés — le remplaçant du `TextField` MUI (lot 13).
 *
 * Même principe que `ChampDate` (lot 12) : le câblage react-hook-form,
 * l'affichage de l'erreur et l'état désactivé vivent ICI, une fois pour
 * toutes. Un écran ne passe que `name`, `control`, `label` et `disabled` ; il
 * ne recopie plus `error`/`helperText`/`fullWidth`, et ne peut plus oublier
 * `valueAsNumber` sur un champ numérique — c'est exactement le défaut qui
 * faisait échouer la création de salle (lot 7 §8).
 *
 * Contrat avec les écrans :
 *  - `useController` plutôt que `register` : le composant lit lui-même la
 *    valeur et l'erreur du champ, et rend un `<input>` porteur du `name` —
 *    `services/crud/focus.ts` retrouve ainsi le premier champ saisissable et
 *    le premier champ refusé par le serveur, comme avant.
 *  - la valeur reçue n'est pas toujours du type du schéma : en création,
 *    react-hook-form donne `undefined` pour tout champ absent d'`emptyValue` ;
 *    en édition il est `reset` avec la réponse de l'API telle quelle. Le
 *    composant normalise à l'affichage (`null`/`undefined` → champ vide).
 *  - `ChampNombre` remet au formulaire un **nombre**, ou `null` si le champ
 *    est vide — jamais une chaîne : les `z.number()` des schémas reçoivent ce
 *    qu'ils attendent, et un `.nullable()` accepte l'effacement. Le message
 *    d'un champ requis laissé vide reste celui du schéma, par le circuit
 *    habituel.
 *  - le libellé est un `<label for>` : le nom accessible que le `TextField`
 *    MUI posait par son label flottant est conservé, `getByLabel` le trouve.
 */

import { useId } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';

/** Ce que tout champ de formulaire partagé reçoit de son écran. */
export interface PropsChampBase<D extends FieldValues> {
    name: Path<D>;
    control: Control<D>;
    label: string;
    /** Consultation : le champ se lit, ne se saisit pas. */
    disabled?: boolean;
    className?: string;
}

/**
 * `null`/`undefined` → champ vide ; le reste tel quel. Un nombre passe par
 * `String` : l'attribut `value` d'un `<input>` est une chaîne.
 */
function texteDe(valeur: unknown): string {
    if (typeof valeur === 'string') return valeur;
    if (typeof valeur === 'number' && !Number.isNaN(valeur)) return String(valeur);
    return '';
}

export interface PropsChampTexte<D extends FieldValues> extends PropsChampBase<D> {
    type?: 'text' | 'password' | 'email';
    /** Plusieurs lignes : un `<textarea>` de `rows` lignes. */
    multiline?: boolean;
    rows?: number;
    autoComplete?: string;
}

export function ChampTexte<D extends FieldValues>({
    name, control, label, disabled, className, type = 'text', multiline = false, rows, autoComplete,
}: PropsChampTexte<D>) {
    // `ref` sort de `field` sous un autre nom : le React Compiler tient tout
    // objet dont il voit lire `.ref` pour une ref, et refuse ensuite d'en lire
    // `.value` pendant le rendu. Renommer lève l'ambiguïté sans rien cacher.
    const { field: { ref: refChamp, value: valeur, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    const communs = {
        id,
        name,
        ref: refChamp,
        value: texteDe(valeur),
        onChange: (evenement: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            onChange(evenement.target.value);
        },
        onBlur,
        disabled,
        'aria-invalid': estInvalide ? true : undefined,
        'aria-describedby': estInvalide ? idErreur : undefined,
    };

    return (
        <Field data-invalid={estInvalide} className={cn('mb-4', className)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {multiline
                ? <Textarea {...communs} rows={rows} />
                : <Input {...communs} type={type} autoComplete={autoComplete} />}
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}

export interface PropsChampNombre<D extends FieldValues> extends PropsChampBase<D> {
    step?: number | string;
    min?: number;
    max?: number;
}

/**
 * Champ numérique : ce que le formulaire reçoit est un `number` (ou `null`
 * pour un champ vidé), quelle que soit la frappe. Les bornes `min`/`max`
 * restent des attributs natifs — `Form.tsx` pose `noValidate`, elles bornent
 * l'incrémenteur sans court-circuiter zod (voir son commentaire).
 */
export function ChampNombre<D extends FieldValues>({
    name, control, label, disabled, className, step, min, max,
}: PropsChampNombre<D>) {
    const { field: { ref: refChamp, value: valeur, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        <Field data-invalid={estInvalide} className={cn('mb-4', className)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                id={id}
                name={name}
                ref={refChamp}
                type="number"
                inputMode="decimal"
                step={step}
                min={min}
                max={max}
                value={texteDe(valeur)}
                onChange={(evenement) => {
                    const saisie = evenement.target.value;
                    onChange(saisie === '' ? null : Number(saisie));
                }}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={estInvalide ? true : undefined}
                aria-describedby={estInvalide ? idErreur : undefined}
            />
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}
