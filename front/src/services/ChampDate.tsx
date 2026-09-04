/**
 * Le champ de date partagé — le remplaçant du `DatePicker` MUI (lot 12),
 * aligné au lot 17 sur le contrat des autres `Champ*` : `name`, `control`,
 * `label`, `disabled`, plus `aide` — câblage react-hook-form, erreur et état
 * désactivé dans le composant, jamais dans l'écran.
 *
 * Recette shadcn : un `InputGroup` (champ + bouton de calendrier en
 * adornement) + un `Popover` Base UI + le `Calendar` react-day-picker. La
 * saisie au clavier et la sélection au calendrier produisent la même chose :
 * un `Date` natif remis au formulaire.
 *
 * Contrat avec les écrans :
 *  - la valeur du formulaire peut être `Date | string | null | undefined`.
 *    Le schéma des écrans type leurs champs `Date`, mais `emptyValue` ne les
 *    contient pas : en création, react-hook-form donne `undefined`. Et
 *    `dayjs(undefined)` rend l'heure courante, pas une date invalide — le
 *    garde vit ICI, une fois pour toutes (`value == null`), pour qu'aucun
 *    formulaire ne s'ouvre avec la date du jour pré-remplie. Vérifié au
 *    navigateur (lot 12, revérifié au lot 17 sur les cinq écrans) ; les cinq
 *    écrans portaient chacun ce garde du temps de MUI.
 *  - une saisie vide rend `null` ; une saisie inanalysable rend un
 *    `Date` invalide, que les `z.coerce.date()` des schémas refusent — le
 *    message de validation arrive sur le champ par le circuit habituel.
 *  - le format suit la langue i18next active (`L`/`l` de la locale dayjs,
 *    posée instance par instance — dayjs global reste en `en`, comme du
 *    temps de l'`adapterLocale` du `LocalizationProvider`).
 *  - l'`<input>` porte le `name` du champ et la `ref` de react-hook-form :
 *    `services/crud/focus.ts` le trouve par le nom, là où le `DatePicker`
 *    sous `Controller` n'était joignable que par `aria-invalid`.
 */

import { useId, useRef, useState } from 'react';
import { useController, type FieldValues } from 'react-hook-form';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
// Enregistre la locale FR de dayjs sans l'activer globalement — c'est le
// paramètre de locale des appels ci-dessous qui choisit, instance par
// instance, en suivant la langue active de i18next. (Import déplacé
// d'App.tsx avec le retrait du LocalizationProvider, lot 12.)
import 'dayjs/locale/fr';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { Field, FieldDescription, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '../components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { fr as jourLocaleFr, enUS as jourLocaleEn } from 'react-day-picker/locale';
import { cn } from '../lib/utils';
import type { PropsChampBase } from './ChampTexte';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);

/** Les deux langues de l'application, réduites aux locales des deux moteurs. */
function locales(langue: string) {
    const estFr = langue.startsWith('fr');
    return {
        dayjs: estFr ? 'fr' : 'en',
        calendrier: estFr ? jourLocaleFr : jourLocaleEn,
    };
}

/**
 * La valeur reçue n'est pas toujours un `Date` : en édition, react-hook-form
 * est `reset` avec la réponse de l'API telle quelle — les dates y sont des
 * chaînes ISO, la coercion `z.coerce.date` du schéma ne joue qu'à la
 * soumission. L'ancien `dayjs(field.value)` les avalait sans le dire ;
 * constaté au navigateur (lot 12, plantage `getTime` sur l'écran d'édition).
 */
function normaliser(value: unknown): Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date(NaN);
}

function formater(date: Date | null, localeDayjs: string): string {
    if (date == null || Number.isNaN(date.getTime())) return '';
    return dayjs(date).locale(localeDayjs).format('L');
}

/**
 * Parse strict au format localisé (`L` = complet, `l` = sans zéros de tête) :
 * « 31/02/2025 » ou « 12/05 » sont invalides, pas réinterprétés.
 */
function analyser(texte: string, localeDayjs: string): dayjs.Dayjs {
    return dayjs(texte, ['L', 'l'], localeDayjs, true);
}

/**
 * L'identifiant que `aria-describedby` doit viser : l'erreur quand il y en a
 * une, sinon l'aide quand elle existe — même règle que `ChampTexte`.
 */
function decritPar(estInvalide: boolean, idErreur: string, aide: string | undefined, idAide: string): string | undefined {
    if (estInvalide) return idErreur;
    return aide === undefined ? undefined : idAide;
}

interface PropsSaisieDate {
    id: string;
    name: string;
    refChamp: (instance: HTMLInputElement | null) => void;
    value: unknown;
    onChange: (date: Date | null) => void;
    onBlur: () => void;
    disabled?: boolean;
    estInvalide: boolean;
    decritPar: string | undefined;
}

/**
 * Le contrôle lui-même — champ texte, bouton et calendrier — sans libellé ni
 * message : `ChampDate` et `ChampDateHeure` l'habillent chacun dans leur
 * `Field`.
 */
function SaisieDate({
    id, name, refChamp, value, onChange, onBlur, disabled, estInvalide, decritPar: decrit,
}: PropsSaisieDate) {
    const { t, i18n } = useTranslation('app');
    const { dayjs: localeDayjs, calendrier } = locales(i18n.resolvedLanguage ?? i18n.language);

    const date = normaliser(value);

    const [ouvert, setOuvert] = useState(false);
    const [texte, setTexte] = useState(() => formater(date, localeDayjs));
    const [enSaisie, setEnSaisie] = useState(false);
    const racine = useRef<HTMLDivElement>(null);

    // Reflète la valeur externe (chargement d'une édition, changement de
    // langue) — mais jamais pendant la frappe : reformater sous les doigts
    // détruirait la saisie en cours. Ajustement pendant le rendu (le motif
    // « you might not need an effect » qu'imposent les règles de lint), sur
    // l'instant plutôt que l'objet : chaque rendu du parent peut fabriquer un
    // nouveau `Date` de même valeur. `Object.is` : NaN (date invalide) doit
    // être égal à lui-même.
    const instant = date == null ? null : date.getTime();
    const [precedent, setPrecedent] = useState({ instant, locale: localeDayjs });
    if (!Object.is(precedent.instant, instant) || precedent.locale !== localeDayjs) {
        setPrecedent({ instant, locale: localeDayjs });
        if (!enSaisie) setTexte(formater(date, localeDayjs));
    }

    // La valeur sous forme exploitable par le calendrier : `undefined` couvre
    // l'absent (création) comme l'invalide (saisie en cours de refus).
    const dateValide = date != null && !Number.isNaN(date.getTime()) ? date : undefined;

    const surSaisie = (saisie: string) => {
        setTexte(saisie);
        if (saisie.trim() === '') {
            onChange(null);
            return;
        }
        const analyse = analyser(saisie, localeDayjs);
        // Invalide tant que la saisie est incomplète : le schéma zod du
        // formulaire (`z.coerce.date`) le refusera à la soumission, sur ce
        // champ — même circuit d'erreur que du temps de MUI.
        onChange(analyse.isValid() ? analyse.toDate() : new Date(NaN));
    };

    const surFinDeSaisie = () => {
        setEnSaisie(false);
        // Normalise une saisie valide (« 1/5/2025 » → « 01/05/2025 » selon la
        // langue) ; une saisie invalide reste affichée telle quelle, pour que
        // l'erreur se comprenne.
        if (dateValide) setTexte(formater(dateValide, localeDayjs));
        onBlur();
    };

    return (
        <Popover open={ouvert} onOpenChange={setOuvert}>
            <InputGroup ref={racine}>
                <InputGroupInput
                    id={id}
                    name={name}
                    ref={refChamp}
                    value={texte}
                    onChange={(evenement) => { surSaisie(evenement.target.value); }}
                    onFocus={() => { setEnSaisie(true); }}
                    onBlur={surFinDeSaisie}
                    placeholder={t('champDate.gabarit')}
                    disabled={disabled}
                    aria-invalid={estInvalide ? true : undefined}
                    aria-describedby={decrit}
                />
                <InputGroupAddon align="inline-end">
                    <PopoverTrigger
                        render={(
                            <InputGroupButton
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t('champDate.ouvrirCalendrier')}
                                disabled={disabled}
                            />
                        )}
                    >
                        <CalendarIcon />
                    </PopoverTrigger>
                </InputGroupAddon>
            </InputGroup>
            <PopoverContent anchor={racine} align="end">
                <Calendar
                    mode="single"
                    locale={calendrier}
                    selected={dateValide}
                    defaultMonth={dateValide}
                    onSelect={(jour) => {
                        onChange(jour ?? null);
                        setOuvert(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}

export type PropsChampDate<D extends FieldValues> = PropsChampBase<D>;

export function ChampDate<D extends FieldValues>({
    name, control, label, disabled, className, aide,
}: PropsChampDate<D>) {
    // `ref` renommée à la sortie de `field` : même motif que `ChampTexte`
    // (React Compiler).
    const { field: { ref: refChamp, value: valeur, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const idAide = `${id}-aide`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        <Field data-invalid={estInvalide} className={cn('mb-4', className)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <SaisieDate
                id={id}
                name={name}
                refChamp={refChamp}
                value={valeur}
                onChange={onChange}
                onBlur={onBlur}
                disabled={disabled}
                estInvalide={estInvalide}
                decritPar={decritPar(estInvalide, idErreur, aide, idAide)}
            />
            {estInvalide
                ? <FieldError id={idErreur}>{erreur}</FieldError>
                : aide !== undefined && <FieldDescription id={idAide}>{aide}</FieldDescription>}
        </Field>
    );
}

export type PropsChampDateHeure<D extends FieldValues> = PropsChampBase<D>;

/**
 * Date et heure — le remplaçant du `DateTimePicker` MUI, pour le seul écran
 * qui en montait (ReservationDialog). La date passe par `SaisieDate`, l'heure
 * par un `<input type="time">` natif : pas de roue d'horloge à recomposer.
 * L'heure saisie avant la date est retenue localement et rattachée dès
 * qu'une date arrive. Une seule valeur de formulaire (`Date | null`) pour
 * les deux contrôles ; l'erreur, s'il y en a une, s'affiche sous la date.
 */
export function ChampDateHeure<D extends FieldValues>({
    name, control, label, disabled, className, aide,
}: PropsChampDateHeure<D>) {
    const { t } = useTranslation('app');
    const { field: { ref: refChamp, value: valeur, onChange, onBlur }, fieldState } = useController({ name, control });
    const id = useId();
    const idHeure = `${id}-heure`;
    const idErreur = `${id}-erreur`;
    const idAide = `${id}-aide`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    const date = normaliser(valeur);
    const valide = date != null && !Number.isNaN(date.getTime());
    const [heure, setHeure] = useState(() => (valide ? dayjs(date).format('HH:mm') : ''));
    const [heureEnSaisie, setHeureEnSaisie] = useState(false);

    // Même ajustement pendant le rendu que dans `SaisieDate` (lint interdit le
    // setState d'effet) : l'heure suit la valeur externe hors saisie.
    const instant = date == null ? null : date.getTime();
    const [precedentInstant, setPrecedentInstant] = useState<number | null>(instant);
    if (!Object.is(precedentInstant, instant)) {
        setPrecedentInstant(instant);
        if (!heureEnSaisie) {
            setHeure(instant != null && !Number.isNaN(instant) ? dayjs(instant).format('HH:mm') : '');
        }
    }

    const combiner = (jour: Date, heureTexte: string): Date => {
        // `''.split(':')` rend `['']`, dont `Number` fait NaN — pas un absent.
        const [heures = 0, minutes = 0] = heureTexte === '' ? [] : heureTexte.split(':').map(Number);
        const resultat = new Date(jour);
        resultat.setHours(heures, minutes, 0, 0);
        return resultat;
    };

    return (
        <div className={cn('flex gap-2', className)}>
            <Field data-invalid={estInvalide} className="flex-1">
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <SaisieDate
                    id={id}
                    name={name}
                    refChamp={refChamp}
                    value={valeur}
                    onChange={(jour) => {
                        if (jour == null || Number.isNaN(jour.getTime())) onChange(jour);
                        else onChange(combiner(jour, heure));
                    }}
                    onBlur={onBlur}
                    disabled={disabled}
                    estInvalide={estInvalide}
                    decritPar={decritPar(estInvalide, idErreur, aide, idAide)}
                />
                {estInvalide
                    ? <FieldError id={idErreur}>{erreur}</FieldError>
                    : aide !== undefined && <FieldDescription id={idAide}>{aide}</FieldDescription>}
            </Field>
            <Field className="w-[7.5rem] shrink-0">
                <FieldLabel htmlFor={idHeure}>{t('champDate.heure')}</FieldLabel>
                <Input
                    id={idHeure}
                    type="time"
                    value={heure}
                    onChange={(evenement) => {
                        const saisie = evenement.target.value;
                        setHeure(saisie);
                        // Sans date, l'heure attend la sienne : retenue localement,
                        // rattachée par `combiner` au premier jour choisi.
                        if (valide && saisie !== '') onChange(combiner(date, saisie));
                    }}
                    onFocus={() => { setHeureEnSaisie(true); }}
                    onBlur={() => { setHeureEnSaisie(false); onBlur(); }}
                    disabled={disabled}
                />
            </Field>
        </div>
    );
}
