import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import frLocale from '@fullcalendar/core/locales/fr';
import { skipToken, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Palette, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { apiInstance } from '../../services/api';
import { useDroits } from '../../services/context/droits';
import { notifyError } from '../../services/notify';
import { Role } from '../user/def';
import { conflitsDetaillesFor, errorMessage } from '../../services/errorMessages';
import { ReservationDialog } from './ReservationDialog';
import { HeuresPanel } from './HeuresPanel';
import type { ReservationDetail } from './def';


// ─── Couleurs par type ────────────────────────────────────────────────────────

const TYPE_COURS_COLORS: Record<string, string> = {
    CM: '#1976d2',
    TD: '#2e7d32',
    TP: '#e65100',
    EXAMEN: '#c62828',
    RATTRAPAGE: '#6a1b9a',
};

type ColorMode = 'type' | 'matiere';

// Génère une couleur HSL déterministe à partir d'un entier (matiere_id).
function defaultMatiereColor(id: number): string {
    const hue = (id * 47) % 360;
    return `hsl(${hue}, 55%, 40%)`;
}

function toEvent(r: ReservationDetail, colorMode: ColorMode, t: TFunction<'programme'>) {
    const typeLabel = r.type_cours ?? r.description ?? t('planning.coursSansType');
    const matiereLabel = r.matiere_name ?? '';
    const sallesLabel = r.salles.map(s => s.name).join(', ');
    const intervenantsLabel = r.intervenants
        .map(i => [i.firstName, i.lastName].filter(Boolean).join(' '))
        .join(', ');

    const color = colorMode === 'matiere'
        ? (r.matiere_color ?? (r.matiere_id ? defaultMatiereColor(r.matiere_id) : '#607d8b'))
        : (TYPE_COURS_COLORS[r.type_cours ?? ''] ?? '#607d8b');

    return {
        id: String(r.id),
        title: [typeLabel, matiereLabel, sallesLabel].filter(Boolean).join(' — '),
        start: r.horaire.Lower,
        end: r.horaire.Upper,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { intervenantsLabel, reservation: r },
    };
}

/** Ce que le serveur attend pour réenregistrer une réservation déplacée. */
type EntreeDeplacement = ReturnType<typeof buildUpdateInput>;

function buildUpdateInput(r: ReservationDetail, start: Date, end: Date) {
    return {
        id: r.id,
        version: r.version,
        horaire: { Lower: start.toISOString(), Upper: end.toISOString(), LowerType: 2, UpperType: 2, Valid: true },
        periode_id: r.periode_id,
        matiere_id: r.matiere_id,
        type_cours: r.type_cours,
        is_distanciel: r.is_distanciel,
        description: r.description,
        salle_ids: r.salles.map(s => s.id),
        intervenant_ids: r.intervenants.map(i => i.id),
        groupe_ids: r.groupes.map(g => g.id),
    };
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function Planning() {
    const { periodeId, optionId } = useParams();
    const queryClient = useQueryClient();
    const { t, i18n: i18nInstance } = useTranslation('programme');

    // ── Données ─────────────────────────────────────────────────────────────
    const { data: reservations = [] } = useQuery<ReservationDetail[]>({
        queryKey: ['reservations', periodeId],
        queryFn: periodeId
            ? () => apiInstance.get<ReservationDetail[]>(`/api/v0/planning/reservation?periode_id=${periodeId}`).then(r => r.data)
            : skipToken,
    });

    // ── Mutation drag/resize (sans dialog) ──────────────────────────────────
    const moveMutation = useMutation({
        // `buildUpdateInput` rend la réservation complète : l'identifiant en fait
        // partie, il n'y a pas à aller le chercher derrière un `any`.
        mutationFn: (input: EntreeDeplacement) =>
            apiInstance.put<ReservationDetail>(`/api/v0/planning/reservation/${input.id}`, input).then(r => r.data),
        onSuccess: (updated) => {
            queryClient.setQueryData<ReservationDetail[]>(['reservations', periodeId], (old) =>
                old?.map(r => r.id === updated.id ? updated : r) ?? []
            );
            void queryClient.invalidateQueries({ queryKey: ['heures', periodeId] });
        },
    });

    // ── Lecture/écriture : découle du rôle, plus d'un mode ──────────────────
    const { possedeRole } = useDroits();
    const isEditMode = possedeRole(Role.PROGRAMME_ECRITURE);

    const DATE_KEY = 'planning_date';
    // Lue une fois, à l'ouverture : l'initialiseur paresseux de `useState` est
    // l'endroit prévu pour ça, alors qu'un `getItem` en plein rendu rendait le
    // composant impur — sa sortie dépendait d'un stockage qu'il n'observe pas.
    const [initialDate] = useState<string | undefined>(
        () => sessionStorage.getItem(DATE_KEY) ?? undefined,
    );
    const handleDatesSet = useCallback((info: { startStr: string }) => {
        sessionStorage.setItem(DATE_KEY, info.startStr);
    }, []);

    const [colorMode, setColorMode] = useState<ColorMode>(
        () => (sessionStorage.getItem('planning_color_mode') as ColorMode | null) ?? 'type'
    );
    useEffect(() => { sessionStorage.setItem('planning_color_mode', colorMode); }, [colorMode]);

    // ── État dialog ─────────────────────────────────────────────────────────
    const [panelOpen, setPanelOpen] = useState(
        () => sessionStorage.getItem('planning_panel_open') !== 'false'
    );
    useEffect(() => { sessionStorage.setItem('planning_panel_open', String(panelOpen)); }, [panelOpen]);

    const libelleCouleur = colorMode === 'type' ? t('planning.couleurParMatiere') : t('planning.couleurParType');
    const libelleHeures = panelOpen ? t('planning.masquerHeures') : t('planning.afficherHeures');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
    const [editReservation, setEditReservation] = useState<ReservationDetail | null>(null);

    // ── Callbacks FullCalendar ───────────────────────────────────────────────
    const handleSelect = useCallback((info: DateSelectArg) => {
        setEditReservation(null);
        setSelectedSlot({ start: info.start, end: info.end });
        setDialogOpen(true);
    }, []);

    const handleEventClick = useCallback((info: EventClickArg) => {
        setSelectedSlot(null);
        setEditReservation(info.event.extendedProps.reservation as ReservationDetail);
        setDialogOpen(true);
    }, []);

    const handleMoveError = useCallback((error: unknown) => {
        const errors = conflitsDetaillesFor(error);
        const first = Object.values(errors)[0];
        if (!first) return;

        let msg = errorMessage('BUSINESS_CONFLICT');
        if (first.detail) {
            const match = /conflicts with existing key[^=]+=\(\d+, \["([^"]+)","([^"]+)"\]\)/.exec(first.detail);
            if (match) {
                msg += t('planning.creneauExistant', { debut: dayjs(match[1]).format('HH:mm'), fin: dayjs(match[2]).format('HH:mm') });
            }
        }
        // Le `Snackbar` MUI qui portait ce message est remplacé par la
        // notification applicative (sonner, durée d'erreur centralisée).
        notifyError(msg);
    }, [t]);

    /**
     * Déplacement et redimensionnement aboutissent au même appel : la
     * réservation change de bornes, on la réenregistre, et on la remet en place
     * si le serveur refuse.
     *
     * `event.start` et `event.end` sont `Date | null` dans le type de
     * FullCalendar — un événement peut n'avoir aucune borne. Ce n'est pas le cas
     * ici, mais l'affirmer par un `!` reviendrait à parier ; on renonce au
     * déplacement plutôt que d'envoyer une date absente au serveur.
     */
    const deplacer = useCallback((info: EventDropArg | EventResizeDoneArg) => {
        const r = info.event.extendedProps.reservation as ReservationDetail;
        const { start, end } = info.event;
        if (!start || !end) {
            info.revert();
            return;
        }
        moveMutation.mutate(
            buildUpdateInput(r, start, end),
            {
                onError: (err) => {
                    info.revert();
                    handleMoveError(err);
                }
            },
        );
    }, [moveMutation, handleMoveError]);

    // ── Rendu ────────────────────────────────────────────────────────────────
    return (
        <div className="flex h-full overflow-hidden">

            {/* Calendrier */}
            <div className="flex min-w-0 flex-1 flex-col p-4">
                <FullCalendar
                    plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={initialDate}
                    datesSet={handleDatesSet}
                    locale={i18nInstance.language.startsWith('en') ? undefined : frLocale}
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay',
                    }}
                    events={reservations.map(r => toEvent(r, colorMode, t))}
                    allDaySlot={false}
                    slotMinTime="07:00:00"
                    slotMaxTime="21:00:00"
                    height="100%"
                    selectable={isEditMode}
                    editable={isEditMode}
                    select={isEditMode ? handleSelect : undefined}
                    eventClick={isEditMode ? handleEventClick : undefined}
                    eventDrop={isEditMode ? deplacer : undefined}
                    eventResize={isEditMode ? deplacer : undefined}
                    eventContent={(info) => (
                        <div className="overflow-hidden px-1 text-xs leading-[1.3]">
                            <strong>{info.event.title}</strong>
                            {info.event.extendedProps.intervenantsLabel && (
                                <div>{info.event.extendedProps.intervenantsLabel}</div>
                            )}
                        </div>
                    )}
                />
            </div>

            {/* Boutons toggle. Les deux libellés nomment l'action à venir, pas
                l'état courant, et servent aussi de nom accessible. Icônes
                nues : la taille vient du `Button` shadcn (lot 6). */}
            <div className={cn('mt-4 flex flex-col gap-1 self-start', !panelOpen && 'mr-2')}>
                <Tooltip>
                    <TooltipTrigger
                        render={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={libelleCouleur}
                                className={cn(colorMode === 'matiere' && 'text-primary')}
                                onClick={() => { setColorMode(m => m === 'type' ? 'matiere' : 'type'); }}
                            />
                        )}
                    >
                        <Palette />
                    </TooltipTrigger>
                    <TooltipContent side="left">{libelleCouleur}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger
                        render={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={libelleHeures}
                                aria-expanded={panelOpen}
                                onClick={() => { setPanelOpen(p => !p); }}
                            />
                        )}
                    >
                        {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
                    </TooltipTrigger>
                    <TooltipContent side="left">{libelleHeures}</TooltipContent>
                </Tooltip>
            </div>

            {/* Panel heures */}
            {panelOpen && <HeuresPanel periodeId={periodeId ?? ''} />}

            <ReservationDialog
                open={dialogOpen}
                onClose={() => { setDialogOpen(false); }}
                reservation={editReservation}
                start={selectedSlot?.start ?? null}
                end={selectedSlot?.end ?? null}
                periodeId={periodeId ?? ''}
                optionId={optionId ?? ''}
            />
        </div>
    );
}