/**
 * Le champ de date partagé — le remplaçant du `DatePicker` MUI (lot 12).
 *
 * Recette shadcn : un `TextField` MUI (les formulaires porteurs restent MUI,
 * le champ doit leur ressembler) + un `Popover` Base UI + le `Calendar`
 * react-day-picker. La saisie au clavier et la sélection au calendrier
 * produisent la même chose : un `Date` natif remis à `onChange`.
 *
 * Contrat avec les écrans :
 *  - `value` accepte `Date | null | undefined`. Le schéma des écrans type
 *    leurs champs `Date`, mais `emptyValue` ne les contient pas : en
 *    création, react-hook-form donne `undefined`. Et `dayjs(undefined)` rend
 *    l'heure courante, pas une date invalide — le garde vit ICI, une fois
 *    pour toutes (`value == null`), pour qu'aucun formulaire ne s'ouvre avec
 *    la date du jour pré-remplie. Vérifié au navigateur (lot 12) ; les cinq
 *    écrans portaient chacun ce garde du temps de MUI.
 *  - une saisie vide rend `null` ; une saisie inanalysable rend un
 *    `Date` invalide, que les `z.coerce.date()` des schémas refusent — le
 *    message de validation arrive sur le champ par le circuit habituel.
 *  - le format suit la langue i18next active (`L`/`l` de la locale dayjs,
 *    posée instance par instance — dayjs global reste en `en`, comme du
 *    temps de l'`adapterLocale` du `LocalizationProvider`).
 */

import { useRef, useState, type RefObject } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
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

import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { fr as jourLocaleFr, enUS as jourLocaleEn } from 'react-day-picker/locale';

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

function formater(value: Date | null | undefined, localeDayjs: string): string {
    if (value == null || Number.isNaN(value.getTime())) return '';
    return dayjs(value).locale(localeDayjs).format('L');
}

/**
 * Parse strict au format localisé (`L` = complet, `l` = sans zéros de tête) :
 * « 31/02/2025 » ou « 12/05 » sont invalides, pas réinterprétés.
 */
function analyser(texte: string, localeDayjs: string): dayjs.Dayjs {
    return dayjs(texte, ['L', 'l'], localeDayjs, true);
}

export interface PropsChampDate {
    label: string;
    value: Date | null | undefined;
    onChange: (date: Date | null) => void;
    disabled?: boolean;
    error?: boolean;
    helperText?: string;
    fullWidth?: boolean;
    sx?: SxProps<Theme>;
    /**
     * Sous-arbre où rendre le popup du calendrier. À fournir depuis une
     * modale MUI : son piège à focus reprend le focus dès qu'il quitte la
     * modale, et fermerait un popup portalé vers `<body>` sitôt ouvert.
     */
    conteneurPopup?: RefObject<HTMLElement | null>;
}

export function ChampDate({
    label, value, onChange, disabled, error, helperText, fullWidth, sx, conteneurPopup,
}: PropsChampDate) {
    const { t, i18n } = useTranslation('app');
    const { dayjs: localeDayjs, calendrier } = locales(i18n.resolvedLanguage ?? i18n.language);

    const [ouvert, setOuvert] = useState(false);
    const [texte, setTexte] = useState(() => formater(value, localeDayjs));
    const [enSaisie, setEnSaisie] = useState(false);
    const racine = useRef<HTMLDivElement>(null);

    // Reflète la valeur externe (chargement d'une édition, changement de
    // langue) — mais jamais pendant la frappe : reformater sous les doigts
    // détruirait la saisie en cours. Ajustement pendant le rendu (le motif
    // « you might not need an effect » qu'imposent les règles de lint), sur
    // l'instant plutôt que l'objet : chaque rendu du parent peut fabriquer un
    // nouveau `Date` de même valeur. `Object.is` : NaN (date invalide) doit
    // être égal à lui-même.
    const instant = value == null ? null : value.getTime();
    const [precedent, setPrecedent] = useState({ instant, locale: localeDayjs });
    if (!Object.is(precedent.instant, instant) || precedent.locale !== localeDayjs) {
        setPrecedent({ instant, locale: localeDayjs });
        if (!enSaisie) setTexte(formater(value, localeDayjs));
    }

    // La valeur sous forme exploitable par le calendrier : `undefined` couvre
    // l'absent (création) comme l'invalide (saisie en cours de refus).
    const dateValide = value != null && !Number.isNaN(value.getTime()) ? value : undefined;

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
    };

    return (
        <Popover open={ouvert} onOpenChange={setOuvert}>
            <TextField
                ref={racine}
                label={label}
                value={texte}
                onChange={(evenement) => { surSaisie(evenement.target.value); }}
                onFocus={() => { setEnSaisie(true); }}
                onBlur={surFinDeSaisie}
                placeholder={t('champDate.gabarit')}
                disabled={disabled}
                error={error}
                helperText={helperText}
                fullWidth={fullWidth}
                sx={sx}
                slotProps={{
                    input: {
                        endAdornment: (
                            <InputAdornment position="end">
                                <PopoverTrigger
                                    render={
                                        <IconButton
                                            edge="end"
                                            aria-label={t('champDate.ouvrirCalendrier')}
                                            disabled={disabled}
                                        />
                                    }
                                >
                                    <CalendarIcon />
                                </PopoverTrigger>
                            </InputAdornment>
                        ),
                    },
                }}
            />
            <PopoverContent anchor={racine} align="end" container={conteneurPopup}>
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

export interface PropsChampDateHeure {
    label: string;
    value: Date | null;
    onChange: (date: Date | null) => void;
    disabled?: boolean;
    conteneurPopup?: RefObject<HTMLElement | null>;
}

/**
 * Date et heure — le remplaçant du `DateTimePicker` MUI, pour le seul écran
 * qui en montait (ReservationDialog). La date passe par `ChampDate`, l'heure
 * par un `<input type="time">` natif : pas de roue d'horloge à recomposer.
 * L'heure saisie avant la date est retenue localement et rattachée dès
 * qu'une date arrive.
 */
export function ChampDateHeure({ label, value, onChange, disabled, conteneurPopup }: PropsChampDateHeure) {
    const { t } = useTranslation('app');

    const valide = value != null && !Number.isNaN(value.getTime());
    const [heure, setHeure] = useState(() => (valide ? dayjs(value).format('HH:mm') : ''));
    const [heureEnSaisie, setHeureEnSaisie] = useState(false);

    // Même ajustement pendant le rendu que dans `ChampDate` (lint interdit le
    // setState d'effet) : l'heure suit la valeur externe hors saisie.
    const instant = value == null ? null : value.getTime();
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
        <div className="flex flex-1 gap-2">
            <ChampDate
                label={label}
                value={value}
                onChange={(jour) => {
                    if (jour == null || Number.isNaN(jour.getTime())) onChange(jour);
                    else onChange(combiner(jour, heure));
                }}
                disabled={disabled}
                fullWidth
                conteneurPopup={conteneurPopup}
            />
            <TextField
                label={t('champDate.heure')}
                type="time"
                value={heure}
                onChange={(evenement) => {
                    const saisie = evenement.target.value;
                    setHeure(saisie);
                    // Sans date, l'heure attend la sienne : retenue localement,
                    // rattachée par `combiner` au premier jour choisi.
                    if (valide && saisie !== '') onChange(combiner(value, saisie));
                }}
                onFocus={() => { setHeureEnSaisie(true); }}
                onBlur={() => { setHeureEnSaisie(false); }}
                disabled={disabled}
                sx={{ width: '7.5rem', flexShrink: 0 }}
                slotProps={{ inputLabel: { shrink: true } }}
            />
        </div>
    );
}
