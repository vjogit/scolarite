import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
    Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent,
    ComboboxEmpty, ComboboxItem, ComboboxList, ComboboxValue,
} from '../../components/ui/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Field, FieldLabel } from '../../components/ui/field';
import { ChampDateHeure } from '../../services/ChampDate';
import { ChampCase, ChampSelection } from '../../services/ChampChoix';
import { ChampTexte } from '../../services/ChampTexte';
import { apiInstance } from '../../services/api';
import { conflitsDetaillesFor, errorMessage } from '../../services/errorMessages';
import type { ReservationDetail } from './def';

// ─── Types référentiels ───────────────────────────────────────────────────────

interface Salle      { id: number; name: string; batiment?: string }
interface User       { id: number; firstName?: string; lastName?: string }
interface Groupe     { id: number; name: string; option_id: number }
interface Matiere    { id: number; name: string; ueName: string }
interface Ue         { id: number; name: string }

const TYPE_COURS_OPTIONS = ['CM', 'TD', 'TP', 'EXAMEN', 'RATTRAPAGE'].map((type) => ({ id: type, label: type }));

/**
 * Le formulaire, tel que react-hook-form le porte (lot 14). `matiere_id` est
 * une chaîne : `ChampSelection` travaille en chaînes, la conversion se fait à
 * la soumission. Les trois listes portent les objets choisis eux-mêmes — en
 * édition, la réservation les fournit complets (`SalleRef`, `GroupeRef`,
 * `IntervenantRef` ont la forme des référentiels), sans attendre que ceux-ci
 * soient chargés.
 */
interface ValeursReservation {
    debut:         Date | null;
    fin:           Date | null;
    type_cours:    string | null;
    matiere_id:    string | null;
    salles:        Salle[];
    intervenants:  User[];
    groupes:       Groupe[];
    is_distanciel: boolean;
    description:   string;
}

function valeursInitiales(reservation: ReservationDetail | null, start: Date | null, end: Date | null): ValeursReservation {
    if (reservation) {
        return {
            debut:         new Date(reservation.horaire.Lower),
            fin:           new Date(reservation.horaire.Upper),
            type_cours:    reservation.type_cours ?? null,
            matiere_id:    reservation.matiere_id ? String(reservation.matiere_id) : null,
            salles:        reservation.salles.map(s => ({ id: s.id, name: s.name, batiment: s.batiment })),
            intervenants:  reservation.intervenants.map(i => ({ id: i.id, firstName: i.firstName, lastName: i.lastName })),
            groupes:       reservation.groupes.map(g => ({ id: g.id, name: g.name, option_id: g.option_id })),
            is_distanciel: reservation.is_distanciel,
            description:   reservation.description ?? '',
        };
    }
    return {
        debut: start, fin: end, type_cours: null, matiere_id: null,
        salles: [], intervenants: [], groupes: [], is_distanciel: false, description: '',
    };
}

const userName = (u: User) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ') || `#${u.id}`;

// Une saisie de date en cours de refus est un `Date` invalide, pas un
// `null` (contrat de `ChampDate`) : la soumission attend deux instants réels.
const dateComplete = (d: Date | null): d is Date => d !== null && !Number.isNaN(d.getTime());

// ─── Choix multiple ───────────────────────────────────────────────────────────

interface PropsChampMultiple<E extends { id: number }> {
    label: string;
    items: E[];
    value: E[];
    onChange: (choisis: E[]) => void;
    libelle: (element: E) => string;
    /** Recherche serveur : la frappe est remontée, la liste reçue s'affiche telle quelle. */
    onRecherche?: (texte: string) => void;
}

/**
 * Le remplaçant de l'`Autocomplete multiple` MUI : un `Combobox` Base UI à
 * chips (`ui/combobox.tsx`). Hors du contrat des champs partagés — le choix
 * multiple n'y figure pas, et trois écrans seulement en montent (ici, et les
 * deux `Autocomplete` restants des lots note) ; local tant qu'un second écran
 * n'en demande pas un.
 */
function ChampMultiple<E extends { id: number }>({ label, items, value, onChange, libelle, onRecherche }: PropsChampMultiple<E>) {
    const { t } = useTranslation('programme');
    const id = useId();
    const ancre = useRef<HTMLDivElement>(null);
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Combobox
                multiple
                items={items}
                value={value}
                onValueChange={onChange}
                itemToStringLabel={libelle}
                isItemEqualToValue={(a, b) => a.id === b.id}
                filter={onRecherche ? null : undefined}
                onInputValueChange={onRecherche}
            >
                <ComboboxChips ref={ancre}>
                    <ComboboxValue>
                        {(choisis: E[]) => (
                            <>
                                {choisis.map((element) => (
                                    <ComboboxChip key={element.id}>{libelle(element)}</ComboboxChip>
                                ))}
                                <ComboboxChipsInput id={id} />
                            </>
                        )}
                    </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={ancre}>
                    <ComboboxEmpty>{t('reservationDialog.aucuneOption')}</ComboboxEmpty>
                    <ComboboxList>
                        {(element: E) => (
                            <ComboboxItem key={element.id} value={element}>{libelle(element)}</ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
        </Field>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    open:        boolean;
    onClose:     () => void;
    reservation: ReservationDetail | null; // null = création
    start:       Date | null;
    end:         Date | null;
    periodeId:   string;
    optionId:    string;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * La modale. Le formulaire est un composant à part, monté DANS le popup :
 * Base UI démonte le contenu à la fermeture, chaque ouverture repart donc de
 * valeurs initiales calculées au montage — plus d'`initialiser` rejoué sur
 * la transition MUI, plus de référentiels chargés modale fermée.
 */
export function ReservationDialog({ open, onClose, reservation, start, end, periodeId, optionId }: Props) {
    const { t } = useTranslation('programme');
    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            {/* Pas de croix : la modale MUI n'en avait pas, « Annuler » reste
                l'issue explicite (Échap et clic hors modale ferment aussi).
                Hauteur bornée et corps défilant (rangée centrale de la grille)
                : la modale MUI faisait défiler son `DialogContent` sous un
                titre et des actions fixes ; sans cette borne, dix champs
                débordaient de l'écran, titre et bouton « Créer » hors de vue
                — constaté au navigateur (lot 14). */}
            <DialogContent
                className="max-h-[calc(100vh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[600px]"
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle>
                        {reservation ? t('reservationDialog.titreModifier') : t('reservationDialog.titreCreer')}
                    </DialogTitle>
                </DialogHeader>
                <FormulaireReservation
                    reservation={reservation}
                    start={start}
                    end={end}
                    periodeId={periodeId}
                    optionId={optionId}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}

function FormulaireReservation({ reservation, start, end, periodeId, optionId, onClose }: Omit<Props, 'open'>) {
    const { t } = useTranslation('programme');
    const [conflictErrors, setConflictErrors] = useState<string[]>([]);

    const { control, handleSubmit, getValues } = useForm<ValeursReservation>({
        defaultValues: valeursInitiales(reservation, start, end),
    });
    // Les deux bornes gouvernent le bouton de soumission.
    const debut = useWatch({ control, name: 'debut' });
    const fin = useWatch({ control, name: 'fin' });

    // ── Recherche d'intervenants (serveur, différée) ────────────────────────
    const [intervenantQuery,    setIntervenantQuery]    = useState('');
    const [debouncedQuery,      setDebouncedQuery]      = useState('');
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedQuery(intervenantQuery); }, 400);
        return () => { clearTimeout(t); };
    }, [intervenantQuery]);

    // ── Référentiels ────────────────────────────────────────────────────────
    const { data: salles = [] } = useQuery<Salle[]>({
        queryKey: ['salles'],
        queryFn: () => apiInstance.get<Salle[]>('/api/v0/planning/salle').then(r => r.data),
    });

    const { data: users = [] } = useQuery<User[]>({
        queryKey: ['users-search', debouncedQuery],
        queryFn: async () => {
            if (!debouncedQuery) return [];
            const r = await apiInstance.get<User[]>(`/api/v0/user/search?q=${encodeURIComponent(debouncedQuery)}`);
            return r.data;
        },
    });

    const { data: groupes = [] } = useQuery<Groupe[]>({
        queryKey: ['groupes', optionId],
        queryFn: () => apiInstance.get<Groupe[]>(`/api/v0/structure/groupe?option_id=${optionId}`).then(r => r.data),
        enabled: !!optionId,
    });

    const { data: ues = [] } = useQuery<Ue[]>({
        queryKey: ['ues', periodeId],
        queryFn: () => apiInstance.get<Ue[]>(`/api/v0/structure/ue?periode_id=${periodeId}`).then(r => r.data),
        enabled: !!periodeId,
    });

    const matiereResults = useQueries({
        queries: ues.map(ue => ({
            queryKey: ['matieres', ue.id],
            queryFn: () => apiInstance
                .get<{ id: number; name: string }[]>(`/api/v0/structure/matiere?unite_enseignement_id=${ue.id}`)
                .then(r => r.data.map(m => ({ ...m, ueName: ue.name }))),
        })),
    });
    const matieres: Matiere[] = matiereResults.flatMap(q => q.data ?? []);
    const optionsMatiere = matieres.map(m => ({ id: String(m.id), label: `${m.ueName} — ${m.name}` }));

    // ── Gestion des erreurs de conflit ───────────────────────────────────────
    const handleConflictError = (error: unknown) => {
        const errors = conflitsDetaillesFor(error);
        if (Object.keys(errors).length === 0) return;

        const msgs = Object.entries(errors).map(([field, err]) => {
            if (!err.detail) return errorMessage('BUSINESS_CONFLICT');

            // Detail PG : "Key (col, horaire)=(id, ["start","end"]) conflicts with existing key (...) = (id, ["start","end"])."
            const match = /=\((\d+), \["([^"]+)","([^"]+)"\]\) conflicts with existing key[^=]+=\(\d+, \["([^"]+)","([^"]+)"\]\)/.exec(err.detail);
            if (!match) return errorMessage('BUSINESS_CONFLICT');

            const entityId      = parseInt(match[1] ?? '');
            const existingStart = dayjs(match[4]).format('HH:mm');
            const existingEnd   = dayjs(match[5]).format('HH:mm');

            if (field === 'intervenants') {
                const u = getValues('intervenants').find(i => i.id === entityId);
                return t('reservationDialog.conflitIntervenant', { nom: u ? userName(u) : `#${entityId}`, debut: existingStart, fin: existingEnd });
            }
            if (field === 'salles') {
                const s = getValues('salles').find(s => s.id === entityId);
                return t('reservationDialog.conflitSalle', { nom: s?.name ?? `#${entityId}`, debut: existingStart, fin: existingEnd });
            }
            if (field === 'groupes') {
                const g = getValues('groupes').find(g => g.id === entityId);
                return t('reservationDialog.conflitGroupe', { nom: g?.name ?? `#${entityId}`, debut: existingStart, fin: existingEnd });
            }
            return errorMessage('BUSINESS_CONFLICT');
        });

        setConflictErrors(msgs);
    };

    // ── Mutation ────────────────────────────────────────────────────────────
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: (input: object) => reservation
            ? apiInstance.put(`/api/v0/planning/reservation/${reservation.id}`, input)
            : apiInstance.post('/api/v0/planning/reservation', input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['reservations', periodeId] });
            void queryClient.invalidateQueries({ queryKey: ['heures',       periodeId] });
            onClose();
        },
        onError: handleConflictError,
    });

    const deleteMutation = useMutation({
        // La mutation n'est atteignable que depuis le bouton « Supprimer »,
        // qui n'est rendu qu'en édition. On le dit plutôt que de l'affirmer.
        mutationFn: () => {
            if (!reservation) throw new Error(t('reservationDialog.aucuneReservationASupprimer'));
            return apiInstance.delete(`/api/v0/planning/reservation/${reservation.id}`, {
                data: { ids: [reservation.id] },
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['reservations', periodeId] });
            void queryClient.invalidateQueries({ queryKey: ['heures',       periodeId] });
            onClose();
        },
    });

    const envoyer = (valeurs: ValeursReservation) => {
        if (!dateComplete(valeurs.debut) || !dateComplete(valeurs.fin)) return;
        mutation.mutate({
            ...(reservation ? { id: reservation.id, version: reservation.version } : {}),
            horaire: {
                Lower:     valeurs.debut.toISOString(),
                Upper:     valeurs.fin.toISOString(),
                LowerType: 2,
                UpperType: 2,
                Valid:     true,
            },
            periode_id:      parseInt(periodeId),
            matiere_id:      valeurs.matiere_id ? Number(valeurs.matiere_id) : null,
            type_cours:      valeurs.type_cours,
            is_distanciel:   valeurs.is_distanciel,
            description:     valeurs.description || null,
            salle_ids:       valeurs.salles.map(s => s.id),
            intervenant_ids: valeurs.intervenants.map(u => u.id),
            groupe_ids:      valeurs.groupes.map(g => g.id),
        });
    };

    // `Control<ValeursReservation>` : les champs partagés sont génériques sur
    // le formulaire, l'annotation évite de la répéter à chaque champ.
    const controle: Control<ValeursReservation> = control;

    // ── Rendu ───────────────────────────────────────────────────────────────
    return (
        <>
            {/* Les popups des champs (sélections, combobox, calendrier) se
                portalisent vers <body> : la modale Base UI les reconnaît, et
                un calendrier rendu dans ce corps défilant y serait rogné.
                Marges négatives compensées par des marges internes : de la
                place pour l'anneau de focus, que le bord du défilement
                rognerait sinon (constaté au lot 14). */}
            <div className="-mx-1 -mt-2 flex flex-col gap-4 overflow-y-auto px-1 pt-2">

                {conflictErrors.map((msg, i) => (
                    // Liste de messages affichée d'un bloc, jamais réordonnée
                    // et sans état interne : l'index suffit à les distinguer.
                    // eslint-disable-next-line react-x/no-array-index-key
                    <Alert key={i} variant="destructive"><AlertDescription>{msg}</AlertDescription></Alert>
                ))}

                {/* L'un sous l'autre : chaque champ date-heure occupe
                    déjà la largeur de deux champs. */}
                <ChampDateHeure name="debut" control={controle} label={t('reservationDialog.champDebut')} />
                <ChampDateHeure name="fin" control={controle} label={t('reservationDialog.champFin')} />

                <ChampSelection
                    name="type_cours"
                    control={controle}
                    label={t('reservationDialog.champTypeCours')}
                    options={TYPE_COURS_OPTIONS}
                    libelleVide={t('reservationDialog.aucun')}
                    className="mb-0"
                />

                <ChampSelection
                    name="matiere_id"
                    control={controle}
                    label={t('reservationDialog.champMatiere')}
                    options={optionsMatiere}
                    libelleVide={t('reservationDialog.aucune')}
                    className="mb-0"
                />

                <Controller
                    name="salles"
                    control={controle}
                    render={({ field }) => (
                        <ChampMultiple
                            label={t('reservationDialog.champSalles')}
                            items={salles}
                            value={field.value}
                            onChange={field.onChange}
                            libelle={s => `${s.name}${s.batiment ? ` (${s.batiment})` : ''}`}
                        />
                    )}
                />

                <Controller
                    name="intervenants"
                    control={controle}
                    render={({ field }) => (
                        <ChampMultiple
                            label={t('reservationDialog.champIntervenants')}
                            items={users}
                            value={field.value}
                            onChange={field.onChange}
                            libelle={userName}
                            onRecherche={setIntervenantQuery}
                        />
                    )}
                />

                <Controller
                    name="groupes"
                    control={controle}
                    render={({ field }) => (
                        <ChampMultiple
                            label={t('reservationDialog.champGroupes')}
                            items={groupes}
                            value={field.value}
                            onChange={field.onChange}
                            libelle={g => g.name}
                        />
                    )}
                />

                <ChampCase
                    name="is_distanciel"
                    control={controle}
                    label={t('reservationDialog.champDistanciel')}
                    className="mb-0"
                />

                <ChampTexte
                    name="description"
                    control={controle}
                    label={t('reservationDialog.champDescription')}
                    multiline
                    rows={2}
                    className="mb-0"
                />
            </div>

            <DialogFooter>
                {reservation && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive sm:mr-auto"
                        onClick={() => { deleteMutation.mutate(); }}
                        disabled={deleteMutation.isPending}
                    >
                        {t('reservationDialog.supprimer')}
                    </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>{t('reservationDialog.annuler')}</Button>
                <Button
                    type="button"
                    onClick={() => { void handleSubmit(envoyer)(); }}
                    disabled={mutation.isPending || !dateComplete(debut) || !dateComplete(fin)}
                >
                    {reservation ? t('reservationDialog.enregistrer') : t('reservationDialog.creer')}
                </Button>
            </DialogFooter>
        </>
    );
}
