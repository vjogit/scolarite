import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import frLocale from '@fullcalendar/core/locales/fr';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Box, IconButton, Tooltip, Snackbar, Alert } from '@mui/material';
import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import PaletteIcon from '@mui/icons-material/Palette';
import { apiInstance } from '../../services/api';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';
import { ERROR_MESSAGES } from '../../services/errorMessages';
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

function toEvent(r: ReservationDetail, colorMode: ColorMode) {
    const typeLabel = r.type_cours ?? r.description ?? 'Cours';
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

    // ── Données ─────────────────────────────────────────────────────────────
    const { data: reservations = [] } = useQuery<ReservationDetail[]>({
        queryKey: ['reservations', periodeId],
        queryFn: () => apiInstance.get(`/api/v0/planning/reservation?periode_id=${periodeId}`).then(r => r.data),
        enabled: !!periodeId,
    });

    // ── Mutation drag/resize (sans dialog) ──────────────────────────────────
    const moveMutation = useMutation({
        mutationFn: (input: object) =>
            apiInstance.put(`/api/v0/planning/reservation/${(input as any).id}`, input).then(r => r.data as ReservationDetail),
        onSuccess: (updated) => {
            queryClient.setQueryData<ReservationDetail[]>(['reservations', periodeId], (old) =>
                old?.map(r => r.id === updated.id ? updated : r) ?? []
            );
            queryClient.invalidateQueries({ queryKey: ['heures', periodeId] });
        },
    });

    // ── Lecture/écriture : découle du rôle, plus d'un mode ──────────────────
    const { possedeRole } = useDroits();
    const isEditMode = possedeRole(Role.PROGRAMME_ECRITURE);

    const DATE_KEY = 'planning_date';
    const initialDate = sessionStorage.getItem(DATE_KEY) ?? undefined;
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
    const [conflictMsg, setConflictMsg] = useState<string | null>(null);
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

    const handleMoveError = useCallback((error: any) => {
        const errors: Record<string, { message: string; detail?: string }> =
            error?.response?.data?.details?.errors ?? {};
        const first = Object.values(errors)[0];
        if (!first) return;

        let msg = ERROR_MESSAGES.BUSINESS_CONFLICT;
        if (first.detail) {
            const match = first.detail.match(
                /conflicts with existing key[^=]+=\(\d+, \["([^"]+)","([^"]+)"\]\)/
            );
            if (match) {
                msg += ` (créneau existant : ${dayjs(match[1]).format('HH:mm')}–${dayjs(match[2]).format('HH:mm')})`;
            }
        }
        setConflictMsg(msg);
    }, []);

    const handleEventDrop = useCallback((info: EventDropArg) => {
        const r = info.event.extendedProps.reservation as ReservationDetail;
        moveMutation.mutate(
            buildUpdateInput(r, info.event.start!, info.event.end!),
            {
                onError: (err) => {
                    info.revert();
                    handleMoveError(err);
                }
            },
        );
    }, [moveMutation, handleMoveError, queryClient, periodeId]);

    const handleEventResize = useCallback((info: any) => {
        const r = info.event.extendedProps.reservation as ReservationDetail;
        moveMutation.mutate(
            buildUpdateInput(r, info.event.start!, info.event.end!),
            {
                onError: (err) => {
                    info.revert();
                    handleMoveError(err);
                }
            },
        );
    }, [moveMutation, handleMoveError, queryClient, periodeId]);

    // ── Rendu ────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

            {/* Calendrier */}
            <Box sx={{ flex: 1, minWidth: 0, p: 2, display: 'flex', flexDirection: 'column' }}>
                <FullCalendar
                    plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={initialDate}
                    datesSet={handleDatesSet}
                    locale={frLocale}
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay',
                    }}
                    events={reservations.map(r => toEvent(r, colorMode))}
                    allDaySlot={false}
                    slotMinTime="07:00:00"
                    slotMaxTime="21:00:00"
                    height="100%"
                    selectable={isEditMode}
                    editable={isEditMode}
                    select={isEditMode ? handleSelect : undefined}
                    eventClick={isEditMode ? handleEventClick : undefined}
                    eventDrop={isEditMode ? handleEventDrop : undefined}
                    eventResize={isEditMode ? handleEventResize : undefined}
                    eventContent={(info) => (
                        <Box sx={{ fontSize: '0.75rem', overflow: 'hidden', px: 0.5, lineHeight: 1.3 }}>
                            <strong>{info.event.title}</strong>
                            {info.event.extendedProps.intervenantsLabel && (
                                <div>{info.event.extendedProps.intervenantsLabel}</div>
                            )}
                        </Box>
                    )}
                />
            </Box>

            {/* Boutons toggle */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', mt: 2, mr: panelOpen ? 0 : 1, gap: 0.5 }}>
                <Tooltip title={colorMode === 'type' ? 'Couleur par matière' : 'Couleur par type de cours'} placement="left">
                    <IconButton
                        size="small"
                        onClick={() => setColorMode(m => m === 'type' ? 'matiere' : 'type')}
                        color={colorMode === 'matiere' ? 'primary' : 'default'}
                    >
                        <PaletteIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title={panelOpen ? 'Masquer les heures' : 'Afficher les heures'} placement="left">
                    <IconButton size="small" onClick={() => setPanelOpen(p => !p)}>
                        <MenuOpenIcon sx={{ transform: panelOpen ? 'none' : 'scaleX(-1)' }} />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Panel heures */}
            {panelOpen && <HeuresPanel periodeId={periodeId ?? ''} />}

            <ReservationDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                reservation={editReservation}
                start={selectedSlot?.start ?? null}
                end={selectedSlot?.end ?? null}
                periodeId={periodeId ?? ''}
                optionId={optionId ?? ''}
            />

            <Snackbar
                open={!!conflictMsg}
                autoHideDuration={6000}
                onClose={(_, reason) => { if (reason !== 'clickaway') setConflictMsg(null); }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="error" onClose={() => setConflictMsg(null)}>
                    {conflictMsg}
                </Alert>
            </Snackbar>
        </Box>
    );
}