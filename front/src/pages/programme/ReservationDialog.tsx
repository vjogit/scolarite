import { useState, useEffect } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Select, MenuItem, FormControl,
    InputLabel, FormControlLabel, Checkbox, Autocomplete,
    Box, Stack, Alert,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { apiInstance } from '../../services/api';
import { conflitsDetaillesFor, ERROR_MESSAGES } from '../../services/errorMessages';
import type { ReservationDetail } from './def';

// ─── Types référentiels ───────────────────────────────────────────────────────

interface Salle      { id: number; name: string; batiment?: string }
interface User       { id: number; firstName?: string; lastName?: string }
interface Groupe     { id: number; name: string; option_id: number }
interface Matiere    { id: number; name: string; ueName: string }
interface Ue         { id: number; name: string }

const TYPE_COURS_OPTIONS = ['CM', 'TD', 'TP', 'EXAMEN', 'RATTRAPAGE'];

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

export function ReservationDialog({ open, onClose, reservation, start, end, periodeId, optionId }: Props) {

    // ── État du formulaire ──────────────────────────────────────────────────
    const [startDate,           setStartDate]           = useState<Dayjs | null>(null);
    const [endDate,             setEndDate]             = useState<Dayjs | null>(null);
    const [typeCours,           setTypeCours]           = useState('');
    const [matiereId,           setMatiereId]           = useState<number | ''>('');
    // `null` tant que l'utilisateur n'a rien choisi : la sélection se déduit
    // alors de la réservation, dès que le référentiel arrive. Un état initialisé
    // à `[]` obligeait à le remplir depuis un effet, une fois la requête revenue.
    const [sallesChoisies,      setSallesChoisies]      = useState<Salle[] | null>(null);
    const [selectedIntervenants,setSelectedIntervenants]= useState<User[]>([]);
    const [intervenantQuery,    setIntervenantQuery]    = useState('');
    const [debouncedQuery,      setDebouncedQuery]      = useState('');

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedQuery(intervenantQuery); }, 400);
        return () => { clearTimeout(t); };
    }, [intervenantQuery]);
    const [groupesChoisis,      setGroupesChoisis]      = useState<Groupe[] | null>(null);
    const [isDistanciel,        setIsDistanciel]        = useState(false);
    const [description,         setDescription]         = useState('');
    const [conflictErrors,      setConflictErrors]      = useState<string[]>([]);

    /**
     * Remise à zéro du formulaire, jouée à l'ouverture de la modale.
     *
     * C'était un effet gardé par `if (!open) return`, qui rejouait à chaque
     * changement de ses dépendances et posait neuf états d'un coup après le
     * rendu. L'ouverture est un événement : la transition de MUI le donne, et
     * l'état est prêt avant le premier affichage du contenu.
     */
    const initialiser = () => {
        setConflictErrors([]);
        setSallesChoisies(null);
        setGroupesChoisis(null);
        if (reservation) {
            setStartDate(dayjs(reservation.horaire.Lower));
            setEndDate(dayjs(reservation.horaire.Upper));
            setTypeCours(reservation.type_cours ?? '');
            setMatiereId(reservation.matiere_id ?? '');
            setIsDistanciel(reservation.is_distanciel);
            setDescription(reservation.description ?? '');
            setSelectedIntervenants(reservation.intervenants.map(i => ({
                id: i.id, firstName: i.firstName, lastName: i.lastName,
            })));
        } else {
            setStartDate(start ? dayjs(start) : null);
            setEndDate(end ? dayjs(end) : null);
            setTypeCours('');
            setMatiereId('');
            setSelectedIntervenants([]);
            setIsDistanciel(false);
            setDescription('');
        }
    };

    // ── Référentiels ────────────────────────────────────────────────────────
    const { data: salles = [] } = useQuery<Salle[]>({
        queryKey: ['salles'],
        queryFn: () => apiInstance.get<Salle[]>('/api/v0/planning/salle').then(r => r.data),
        enabled: open,
    });

    const { data: users = [] } = useQuery<User[]>({
        queryKey: ['users-search', debouncedQuery],
        queryFn: async () => {
            if (!debouncedQuery) return [];
            const r = await apiInstance.get<User[]>(`/api/v0/user/search?q=${encodeURIComponent(debouncedQuery)}`);
            return r.data;
        },
        enabled: open,
    });

    const { data: groupes = [] } = useQuery<Groupe[]>({
        queryKey: ['groupes', optionId],
        queryFn: () => apiInstance.get<Groupe[]>(`/api/v0/structure/groupe?option_id=${optionId}`).then(r => r.data),
        enabled: open && !!optionId,
    });

    const { data: ues = [] } = useQuery<Ue[]>({
        queryKey: ['ues', periodeId],
        queryFn: () => apiInstance.get<Ue[]>(`/api/v0/structure/ue?periode_id=${periodeId}`).then(r => r.data),
        enabled: open && !!periodeId,
    });

    const matiereResults = useQueries({
        queries: ues.map(ue => ({
            queryKey: ['matieres', ue.id],
            queryFn: () => apiInstance
                .get<{ id: number; name: string }[]>(`/api/v0/structure/matiere?unite_enseignement_id=${ue.id}`)
                .then(r => r.data.map(m => ({ ...m, ueName: ue.name }))),
            enabled: open,
        })),
    });
    const matieres: Matiere[] = matiereResults.flatMap(q => q.data ?? []);

    // ── Sélection courante : le choix de l'utilisateur, ou celle de la
    // réservation en cours d'édition, filtrée sur le référentiel chargé ───────
    const selectedSalles = sallesChoisies
        ?? salles.filter(s => reservation?.salles.some(rs => rs.id === s.id) ?? false);
    const selectedGroupes = groupesChoisis
        ?? groupes.filter(g => reservation?.groupes.some(rg => rg.id === g.id) ?? false);

    // ── Gestion des erreurs de conflit ───────────────────────────────────────
    const userName = (u: User) =>
        [u.firstName, u.lastName].filter(Boolean).join(' ') || `#${u.id}`;

    const handleConflictError = (error: unknown) => {
        const errors = conflitsDetaillesFor(error);
        if (Object.keys(errors).length === 0) return;

        const msgs = Object.entries(errors).map(([field, err]) => {
            if (!err.detail) return ERROR_MESSAGES.BUSINESS_CONFLICT;

            // Detail PG : "Key (col, horaire)=(id, ["start","end"]) conflicts with existing key (...) = (id, ["start","end"])."
            const match = /=\((\d+), \["([^"]+)","([^"]+)"\]\) conflicts with existing key[^=]+=\(\d+, \["([^"]+)","([^"]+)"\]\)/.exec(err.detail);
            if (!match) return ERROR_MESSAGES.BUSINESS_CONFLICT;

            const entityId      = parseInt(match[1] ?? '');
            const existingStart = dayjs(match[4]).format('HH:mm');
            const existingEnd   = dayjs(match[5]).format('HH:mm');

            if (field === 'intervenants') {
                const u = selectedIntervenants.find(i => i.id === entityId);
                return `${u ? userName(u) : `#${entityId}`} est déjà occupé·e de ${existingStart} à ${existingEnd}`;
            }
            if (field === 'salles') {
                const s = selectedSalles.find(s => s.id === entityId);
                return `La salle ${s?.name ?? `#${entityId}`} est déjà réservée de ${existingStart} à ${existingEnd}`;
            }
            if (field === 'groupes') {
                const g = selectedGroupes.find(g => g.id === entityId);
                return `Le groupe ${g?.name ?? `#${entityId}`} est déjà planifié de ${existingStart} à ${existingEnd}`;
            }
            return ERROR_MESSAGES.BUSINESS_CONFLICT;
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
        mutationFn: () => apiInstance.delete(`/api/v0/planning/reservation/${reservation!.id}`, {
            data: { ids: [reservation!.id] },
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['reservations', periodeId] });
            void queryClient.invalidateQueries({ queryKey: ['heures',       periodeId] });
            onClose();
        },
    });

    const handleSubmit = () => {
        if (!startDate || !endDate) return;
        mutation.mutate({
            ...(reservation ? { id: reservation.id, version: reservation.version } : {}),
            horaire: {
                Lower:     startDate.toISOString(),
                Upper:     endDate.toISOString(),
                LowerType: 2,
                UpperType: 2,
                Valid:     true,
            },
            periode_id:      parseInt(periodeId),
            matiere_id:      matiereId || null,
            type_cours:      typeCours || null,
            is_distanciel:   isDistanciel,
            description:     description || null,
            salle_ids:       selectedSalles.map(s => s.id),
            intervenant_ids: selectedIntervenants.map(u => u.id),
            groupe_ids:      selectedGroupes.map(g => g.id),
        });
    };

    // ── Rendu ───────────────────────────────────────────────────────────────
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            slotProps={{ transition: { onEnter: initialiser } }}
        >
            <DialogTitle>
                {reservation ? 'Modifier la réservation' : 'Nouvelle réservation'}
            </DialogTitle>

            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>

                    {conflictErrors.map((msg, i) => (
                        <Alert key={i} severity="error">{msg}</Alert>
                    ))}

                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <DateTimePicker
                            label="Début"
                            value={startDate}
                            onChange={setStartDate}
                            ampm={false}
                            sx={{ flex: 1 }}
                        />
                        <DateTimePicker
                            label="Fin"
                            value={endDate}
                            onChange={setEndDate}
                            ampm={false}
                            sx={{ flex: 1 }}
                        />
                    </Box>

                    <FormControl fullWidth>
                        <InputLabel>Type de cours</InputLabel>
                        <Select
                            value={typeCours}
                            onChange={e => { setTypeCours(e.target.value); }}
                            label="Type de cours"
                        >
                            <MenuItem value=""><em>Aucun</em></MenuItem>
                            {TYPE_COURS_OPTIONS.map(t => (
                                <MenuItem key={t} value={t}>{t}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth>
                        <InputLabel>Matière</InputLabel>
                        <Select
                            value={matiereId}
                            onChange={e => { setMatiereId(e.target.value as number | ''); }}
                            label="Matière"
                        >
                            <MenuItem value=""><em>Aucune</em></MenuItem>
                            {matieres.map(m => (
                                <MenuItem key={m.id} value={m.id}>
                                    {m.ueName} — {m.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Autocomplete
                        multiple
                        options={salles}
                        value={selectedSalles}
                        onChange={(_, v) => { setSallesChoisies(v); }}
                        getOptionLabel={s => `${s.name}${s.batiment ? ` (${s.batiment})` : ''}`}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        renderInput={params => <TextField {...params} label="Salles" />}
                    />

                    <Autocomplete
                        multiple
                        options={users}
                        value={selectedIntervenants}
                        onChange={(_, v) => { setSelectedIntervenants(v); }}
                        inputValue={intervenantQuery}
                        onInputChange={(_, v) => { setIntervenantQuery(v); }}
                        getOptionLabel={userName}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        filterOptions={x => x}
                        renderInput={params => <TextField {...params} label="Intervenants" />}
                    />

                    <Autocomplete
                        multiple
                        options={groupes}
                        value={selectedGroupes}
                        onChange={(_, v) => { setGroupesChoisis(v); }}
                        getOptionLabel={g => g.name}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        renderInput={params => <TextField {...params} label="Groupes" />}
                    />

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={isDistanciel}
                                onChange={e => { setIsDistanciel(e.target.checked); }}
                            />
                        }
                        label="Distanciel"
                    />

                    <TextField
                        label="Description"
                        multiline
                        rows={2}
                        value={description}
                        onChange={e => { setDescription(e.target.value); }}
                        fullWidth
                    />
                </Stack>
            </DialogContent>

            <DialogActions>
                {reservation && (
                    <Button
                        onClick={() => { deleteMutation.mutate(); }}
                        color="error"
                        disabled={deleteMutation.isPending}
                        sx={{ mr: 'auto' }}
                    >
                        Supprimer
                    </Button>
                )}
                <Button onClick={onClose}>Annuler</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={mutation.isPending || !startDate || !endDate}
                >
                    {reservation ? 'Enregistrer' : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
