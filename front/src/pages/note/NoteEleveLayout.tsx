import { useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Tabs, Tab } from '@mui/material';
import { useForm, useWatch } from 'react-hook-form';
import { skipToken, useQuery } from '@tanstack/react-query';
import { UserSelector } from '../../services/UserSelector';
import { apiInstance } from '../../services/api';
import { ENDPOINT_NOTE } from './def';

interface NoteEleveForm {
    id: number;
    user_id: number | null | undefined;
    firstName?: string;
    lastName?: string;
}

interface GpaPeriode {
    periode_id: number;
    periode_name: string;
    gpa_periode: number | null;
    gpa_academique_periode: number | null;
}

interface NoteEleve {
    id: number;
    note: number | null;
    remarque: string | null;
    is_validated: boolean;
    not_evaluated: boolean;
    controle_id: number;
    controle_name: string;
    controle_coeff: number;
    is_rattrapage: boolean;
    matiere_id: number;
    matiere_name: string;
    unite_enseignement_id: number;
    unite_enseignement_name: string;
    unite_enseignement_ects: number;
    periode_id: number;
    periode_name: string;
}

export function NoteEleveDetail() {
    const [tabIndex, setTabIndex] = useState(0);

    const { control, formState: { errors }, getValues, setValue } = useForm<NoteEleveForm>({
        defaultValues: { id: 0, user_id: null },
    });

    const userId = useWatch({ control, name: 'user_id' });

    const { data: gpaData = [] } = useQuery({
        queryKey: ['gpa-eleve', userId],
        queryFn: userId
            ? async () => {
                const res = await apiInstance.get<GpaPeriode[]>(`${ENDPOINT_NOTE}/eleve/gpa?user_id=${userId}`);
                return res.data;
            }
            : skipToken,
    });

    const gpaByPeriode = new Map(gpaData.map(g => [g.periode_name, g]));

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ['notes-eleve', userId],
        queryFn: userId
            ? async () => {
                const res = await apiInstance.get<NoteEleve[]>(`${ENDPOINT_NOTE}/eleve?user_id=${userId}`);
                return res.data;
            }
            : skipToken,
    });

    // Grouper par période (ordre conservé) puis UE
    const periodes = notes.reduce<Map<string, Map<string, NoteEleve[]>>>((acc, note) => {
        // On garde la référence qu'on vient d'insérer plutôt que de la
        // redemander à la Map, ce qui obligeait à affirmer qu'elle s'y trouve.
        let ues = acc.get(note.periode_name);
        if (!ues) {
            ues = new Map();
            acc.set(note.periode_name, ues);
        }
        let rangees = ues.get(note.unite_enseignement_name);
        if (!rangees) {
            rangees = [];
            ues.set(note.unite_enseignement_name, rangees);
        }
        rangees.push(note);
        return acc;
    }, new Map());

    const periodeKeys = Array.from(periodes.keys());
    // L'onglet est un état, les périodes viennent de l'élève : changer d'élève
    // pour un dossier plus court laissait `tabIndex` au-delà du dernier onglet.
    // L'écran affichait alors un onglet inexistant et aucune note, sans rien
    // dire. On retombe sur la première période plutôt que d'aller chercher une
    // clé qui n'existe pas.
    const ongletActif = tabIndex < periodeKeys.length ? tabIndex : 0;
    const periodeActive = periodeKeys[ongletActif] ?? '';
    const currentPeriode = periodes.get(periodeActive);

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <UserSelector
                control={control}
                errors={errors}
                getValues={getValues}
                setValue={setValue}
            />

            {isLoading && <Typography>Chargement...</Typography>}

            {!isLoading && userId && notes.length === 0 && (
                <Typography color="text.secondary">Aucune note trouvée pour cet élève.</Typography>
            )}

            {periodeKeys.length > 0 && (
                <Paper variant="outlined">
                    <Tabs
                        value={ongletActif}
                        onChange={(_: React.SyntheticEvent, v: number) => { setTabIndex(v); }}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        {periodeKeys.map(p => <Tab key={p} label={p} />)}
                    </Tabs>

                    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(() => {
                            const gpa = gpaByPeriode.get(periodeActive);
                            if (!gpa) return null;
                            return (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Chip label={`GPA période : ${gpa.gpa_periode != null ? gpa.gpa_periode.toFixed(2) : 'N/A'}`} color="primary" />
                                    <Chip label={`GPA académique : ${gpa.gpa_academique_periode != null ? gpa.gpa_academique_periode.toFixed(2) : 'N/A'}`} color="secondary" />
                                </Box>
                            );
                        })()}
                        {currentPeriode && Array.from(currentPeriode.entries()).map(([ue, rows]) => (
                            <Box key={ue}>
                                <Typography variant="subtitle1" sx={{ mb: 0.5, fontWeight: 600 }}>
                                    {ue} <Chip label={`${rows[0]?.unite_enseignement_ects ?? 0} ECTS`} size="small" sx={{ ml: 1 }} />
                                </Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ width: '30%' }}>Matière</TableCell>
                                                <TableCell sx={{ width: '30%' }}>Contrôle</TableCell>
                                                <TableCell align="center" sx={{ width: '10%' }}>Coeff</TableCell>
                                                <TableCell align="center" sx={{ width: '15%' }}>Note</TableCell>
                                                <TableCell align="center" sx={{ width: '15%' }}>Type</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {rows.map(row => (
                                                <TableRow key={row.id}>
                                                    <TableCell>{row.matiere_name}</TableCell>
                                                    <TableCell>{row.controle_name}</TableCell>
                                                    <TableCell align="center">{row.controle_coeff}</TableCell>
                                                    <TableCell align="center">
                                                        {row.not_evaluated
                                                            ? <Chip label="N.E." size="small" color="warning" />
                                                            : row.note ?? '—'}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {row.is_rattrapage
                                                            ? <Chip label="Rattrapage" size="small" color="secondary" />
                                                            : <Chip label="Normal" size="small" />}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        ))}
                    </Box>
                </Paper>
            )}
        </Box>
    );
}
