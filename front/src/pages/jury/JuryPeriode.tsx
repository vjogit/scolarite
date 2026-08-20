import { Box, Button, Chip, darken, Tooltip, Typography } from '@mui/material';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JuryData, JuryResult, StudentEntry } from './def';
import { uesNonEvaluees } from './def';
import { apiInstance } from '../../services/api';
import { handleAxiosError } from '../../services/crud/def';
import { messageForError } from '../../services/errorMessages';
import { useCallback, useMemo, memo, useState } from 'react';
import { Alert } from '@mui/material';
import {
    MaterialReactTable,
    useMaterialReactTable,
    type MRT_ColumnDef,
    type MRT_RowSelectionState,
    type MRT_Row,
} from 'material-react-table';
import { ENDPOINT_DELIBERER, ENDPOINT_JURY } from './def';
import { JuryExportButton } from './JuryExportButton';
import { JuryBulletinsExportButton } from './JuryBulletinsExportButton';
import { DelibererButton } from './DelibererButton';
import { DelibererBulkDialog, type BulkStudent } from './DelibererBulkDialog';
import { useNotifications } from '@toolpad/core/useNotifications';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';
import GavelIcon from '@mui/icons-material/Gavel';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuelles
// ─────────────────────────────────────────────────────────────────────────────

/** Rendu d'un grade : rouge si F, normal sinon */
function GradeBadge({ grade }: { grade: string | null | undefined }) {
    if (!grade) return <Typography variant="body2" color="text.disabled">—</Typography>;
    const isF = grade === 'F';
    return (
        <Typography
            variant="body2"
            sx={{
                fontWeight: isF ? 700 : 400,
                color: isF ? 'error.main' : 'inherit',
            }}
        >
            {grade}
        </Typography>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Cell renderers mémoïsés — définis hors du composant pour éviter
// de nouvelles références à chaque render et casser la mémoïsation MRT
// ─────────────────────────────────────────────────────────────────────────────

/** Cellule GPA */
const GpaCell = memo(({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined)
        return <Typography variant="body2" color="text.disabled">—</Typography>;
    return <Typography variant="body2">{value.toFixed(2)}</Typography>;
});

/** Cellule ECTS non validés */
const EctsEchecCell = memo(({ value }: { value: number }) => (
    <Typography
        variant="body2"
        sx={{ fontWeight: value > 0 ? 700 : 400, color: value > 0 ? 'error.main' : 'success.main' }}
    >
        {value}
    </Typography>
));

/** Cellule Booléenne pour afficher Oui/Non ou — */
const BooleanCell = memo(({ value }: { value: boolean | null | undefined }) => {
    if (value === null || value === undefined)
        return <Typography variant="body2" color="text.disabled">—</Typography>;
    return <Typography variant="body2">{value ? 'Oui' : 'Non'}</Typography>;
});

/** Cellule Entier pour afficher un nombre entier ou — */
const IntegerCell = memo(({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined)
        return <Typography variant="body2" color="text.disabled">—</Typography>;
    return <Typography variant="body2">{value}</Typography>;
});

// ─────────────────────────────────────────────────────────────────────────────
// Constantes stables hors du composant
// Tout ce qui est défini ici a une référence stable entre les renders,
// ce qui évite les boucles infinies dans MRT (mrtTheme, muiTableHeadCellProps)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_STUDENTS: StudentEntry[] = [];

/** « 1 élève délibéré. » / « 12 élèves délibérés. » */
function messageDeliberationGroupee(nombre: number): string {
    const pluriel = nombre > 1 ? 's' : '';
    return `${formatNombre.format(nombre)} élève${pluriel} délibéré${pluriel}.`;
}

const TABLE_THEME = (theme: any) => ({
    baseBackgroundColor:
        theme.palette.mode === 'dark'
            ? darken(theme.palette.background.default, 0.05)
            : theme.palette.background.default,
});

const HEAD_CELL_PROPS = {
    sx: {
        fontSize: '0.78rem',
        py: 1,
        whiteSpace: 'pre-line',
    },
} as const;

const CONTAINER_PROPS = { sx: { maxHeight: '75vh' } } as const;

//const ROW_VIRTUALIZER_OPTIONS = { estimateSize: () => 28 } as const;
const ROW_VIRTUALIZER_OPTIONS = {
    estimateSize: () => 36,   // mesure réelle en compact MUI
    overscan: 10,              // pré-rend 10 lignes au-delà de la fenêtre
} as const;

const fetchSynthese = async (periodeId: string | undefined): Promise<JuryData> => {
    if (!periodeId) throw new Error('Le paramètre periodeId est obligatoire');
    try {
        const rep = await apiInstance.get<JuryData>(`${ENDPOINT_JURY}/data/${periodeId}`);
        return rep.data;
    } catch (error: any) {
        throw handleAxiosError(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export const JuryPeriode = () => {
    const { periodeId } = useParams();
    const notifications = useNotifications();
    const queryClient = useQueryClient();

    const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['syntheseJury', periodeId],
        queryFn: () => fetchSynthese(periodeId),
        staleTime: 5 * 60 * 1000,
    });

    // Délibérations déjà enregistrées : map userID → JuryResult[]
    const { data: deliberations = [] } = useQuery<JuryResult[]>({
        queryKey: ['jury-deliberations', periodeId],
        queryFn: async () => {
            if (!periodeId) return [];
            const res = await apiInstance.get<JuryResult[]>(ENDPOINT_DELIBERER(periodeId));
            return res.data;
        },
        enabled: !!periodeId,
        staleTime: 30 * 1000,
    });

    // userID → { delibere, compte_cumul } — calculé une seule fois par render
    const deliberationByUser = useMemo(() => {
        const map = new Map<number, { delibere: boolean; compteCumul: boolean }>();
        for (const d of deliberations) {
            // Si l'élève a au moins une UE dans jury_result → il est délibéré
            const existing = map.get(d.jr_user_id);
            if (!existing) {
                map.set(d.jr_user_id, { delibere: true, compteCumul: d.jr_compte_cumul });
            }
        }
        return map;
    }, [deliberations]);

    const nbDeliberes = deliberationByUser.size;
    const nbTotal = data?.students?.length ?? 0;

    // userID → UE non évaluées. Un dossier incomplet ne se délibère pas : le
    // serveur le refuse, l'écran doit le dire avant l'envoi et nommer les UE.
    const dossiersIncomplets = useMemo(() => {
        const map = new Map<number, string[]>();
        if (!data?.hierarchy) return map;
        for (const eleve of data.students) {
            const ues = uesNonEvaluees(data.statsUe, data.hierarchy.ues, eleve.userID);
            if (ues.length > 0) map.set(eleve.userID, ues);
        }
        return map;
    }, [data]);

    const nbIncomplets = dossiersIncomplets.size;

    // ── Colonnes ──────────────────────────────────────────────────────────────
    const columns = useMemo<MRT_ColumnDef<StudentEntry>[]>(() => {
        if (!data?.hierarchy) return [];

        // A. Colonnes identité (épinglées à gauche)
        const baseCols: MRT_ColumnDef<StudentEntry>[] = [
            {
                id: 'statut',
                header: 'Statut',
                size: 110,
                enableSorting: false,
                enableColumnFilter: false,
                accessorFn: (row) => deliberationByUser.get(row.userID)?.delibere ?? false,
                Cell: ({ row }) => {
                    if (!periodeId) return null;
                    const info = deliberationByUser.get(row.original.userID);
                    const nom = `${row.original.juryStat.lastName ?? ''} ${row.original.juryStat.firstName ?? ''}`.trim();
                    const incompletes = dossiersIncomplets.get(row.original.userID);
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {info?.delibere ? (
                                <Chip
                                    label={info.compteCumul ? 'Délibéré' : 'Redoublant'}
                                    size="small"
                                    color={info.compteCumul ? 'success' : 'warning'}
                                    sx={{ fontSize: '0.68rem', height: 20 }}
                                />
                            ) : incompletes ? (
                                // « En attente » dirait qu'il ne manque qu'une décision.
                                // Ici c'est une note qui manque, et le jury doit le voir.
                                <Tooltip title={`Non évaluée : ${incompletes.join(', ')}`}>
                                    <Chip
                                        label="Incomplet"
                                        size="small"
                                        color="warning"
                                        variant="outlined"
                                        sx={{ fontSize: '0.68rem', height: 20 }}
                                    />
                                </Tooltip>
                            ) : (
                                <Chip label="En attente" size="small" variant="outlined" sx={{ fontSize: '0.68rem', height: 20 }} />
                            )}
                            <DelibererButton
                                periodeId={periodeId}
                                userId={row.original.userID}
                                userName={nom}
                                isDelibere={info?.delibere ?? false}
                                compteCumulActuel={info?.compteCumul}
                                uesNonEvaluees={incompletes}
                            />
                        </Box>
                    );
                },
                muiTableHeadCellProps: { sx: { fontWeight: 700 } },
            },
            {
                id: 'lastName',
                header: 'Nom',
                size: 140,
                accessorFn: (row) => row.juryStat.lastName,
                muiTableHeadCellProps: { sx: { fontWeight: 700 } },
            },
            {
                id: 'firstName',
                header: 'Prénom',
                size: 130,
                accessorFn: (row) => row.juryStat.firstName,
                muiTableHeadCellProps: { sx: { fontWeight: 700 } },
            },
        ];

        // B. Colonnes UE dynamiques — groupe par UE avec moy. + grade
        const ueCols: MRT_ColumnDef<StudentEntry>[] = data.hierarchy.ues.map((ue) => ({
            id: `ue_group_${ue.id}`,
            header: ue.nom,
            muiTableHeadCellProps: {
                sx: {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    borderRight: '2px solid',
                    borderRightColor: 'divider',
                    '& .MuiTableSortLabel-root': { color: 'inherit' },
                },
            },
            Header: () => {
                const displayName = ue.nom.length > 40 ? `${ue.nom.substring(0, 39)}…` : ue.nom;
                return (
                    <Tooltip title={ue.nom} disableHoverListener={ue.nom.length <= 40}>
                        <Box sx={{ textAlign: 'center', lineHeight: 1.3 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                {displayName}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                {ue.ects} ECTS
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            },
            columns: [
                {
                    id: `ue_${ue.id}_grade`,
                    header: 'Grade',
                    size: 140,
                    accessorFn: (row) => data.statsUe[row.userID]?.[ue.id]?.grade_lettre,
                    Cell: ({ cell }) => (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <GradeBadge grade={cell.getValue<string | null>()} />
                        </Box>
                    ),
                    muiTableHeadCellProps: {
                        sx: {
                            fontSize: '0.72rem',
                            borderRight: '2px solid',
                            borderRightColor: 'divider',
                        },
                    },
                    muiTableBodyCellProps: {
                        sx: {
                            textAlign: 'center',
                            borderRight: '2px solid',
                            borderRightColor: 'divider',
                        },
                    },
                },
            ],
        }));

        // C. Colonnes synthèse (GPA, ECTS)
        const endCols: MRT_ColumnDef<StudentEntry>[] = [
            {
                id: 'gpa_academique_periode',
                header: 'GPA aca',
                Header: () => (
                    <Tooltip title="GPA Académique">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>GPA aca</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_academique_periode,
                Cell: ({ cell }) => <GpaCell value={cell.getValue<number | null>()} />,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
            {
                id: 'gpa',
                header: 'GPA',
                Header: () => (
                    <Tooltip title="GPA Période">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>GPA</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_periode,
                Cell: ({ cell }) => <GpaCell value={cell.getValue<number | null>()} />,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
             {
                id: 'toeic',
                header: 'Toeic',
                Header: () => (
                    <Tooltip title="Score TOEIC">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>Toeic</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 100,
                accessorFn: (row) => row.juryStat.toeic,
                Cell: ({ cell }) => <IntegerCell value={cell.getValue<number | null>()} />,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
             {
                id: 'mobilite_valide',
                header: 'Mobilite',
                Header: () => (
                    <Tooltip title="Mobilité Validée">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>Mobilite</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 100,
                accessorFn: (row) => row.juryStat.mobilite_valide,
                Cell: ({ cell }) => <BooleanCell value={cell.getValue<boolean | null>()} />,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
            {
                id: 'ects_acquis',
                header: 'ECTS\nValidés',
                Header: () => (
                    <Tooltip title="Total ECTS Validés">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'pre-line' }}>{'ECTS\nValidés'}</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_valides,
                Cell: ({ cell }) => (
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {cell.getValue<number>()}
                    </Typography>
                ),
                muiTableBodyCellProps: { sx: { textAlign: 'center' } },
            },
            {
                id: 'ects_non_valides',
                header: 'Échecs\n(ECTS)',
                Header: () => (
                    <Tooltip title="ECTS non validés (Grades F)">
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'pre-line' }}>{'Échecs\n(ECTS)'}</Typography>
                        </Box>
                    </Tooltip>
                ),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_periode - row.juryStat.total_ects_valides,
                Cell: ({ cell }) => <EctsEchecCell value={cell.getValue<number>()} />,
                muiTableBodyCellProps: { sx: { textAlign: 'center' } },
            },
        ];

        return [...baseCols, ...ueCols, ...endCols];
    }, [data, deliberationByUser, dossiersIncomplets, periodeId]);

    // ── Données mémoïsées — évite un nouveau [] à chaque render ─────────────
    const students = useMemo(() => data?.students ?? EMPTY_STUDENTS, [data?.students]);

    // ── Élèves sélectionnés non encore délibérés ──────────────────────────────
    const selectedStudents = useMemo<BulkStudent[]>(() => {
        return Object.keys(rowSelection)
            .map(idx => students[Number(idx)])
            .filter(s => s && !deliberationByUser.get(s.userID)?.delibere)
            .filter(s => !dossiersIncomplets.has(s.userID))
            .map(s => ({
                userId: s.userID,
                name: `${s.juryStat.lastName ?? ''} ${s.juryStat.firstName ?? ''}`.trim(),
            }));
    }, [rowSelection, students, deliberationByUser, dossiersIncomplets]);

    // ── Handler délibération bulk ─────────────────────────────────────────────
    const handleBulkConfirm = useCallback(async (entries: { user_id: number; compte_cumul: boolean }[]) => {
        if (!periodeId) return;
        setBulkLoading(true);
        try {
            await apiInstance.post(`${ENDPOINT_DELIBERER(periodeId)}/bulk`, { users: entries });
            notifySuccess(notifications, messageDeliberationGroupee(entries.length));
            queryClient.invalidateQueries({ queryKey: ['jury-deliberations', periodeId] });
            setRowSelection({});
            setBulkDialogOpen(false);
        } catch {
            notifyError(notifications, 'Erreur lors de la délibération groupée.');
        } finally {
            setBulkLoading(false);
        }
    }, [periodeId, notifications, queryClient]);

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const renderTopToolbarCustomActions = useCallback(() => {
        if (!periodeId) return null;
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    {data?.hierarchy?.periode}
                </Typography>
                <Chip
                    label={`${nbDeliberes} / ${nbTotal} délibéré(s)`}
                    size="small"
                    color={nbDeliberes === nbTotal && nbTotal > 0 ? 'success' : 'default'}
                    variant={nbDeliberes === nbTotal && nbTotal > 0 ? 'filled' : 'outlined'}
                />
                {nbIncomplets > 0 && (
                    <Tooltip title="Ces élèves ont au moins une unité d'enseignement non évaluée. Ils repasseront en jury une fois leurs notes complètes.">
                        <Chip
                            label={`${nbIncomplets} dossier${nbIncomplets > 1 ? 's' : ''} incomplet${nbIncomplets > 1 ? 's' : ''}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                        />
                    </Tooltip>
                )}
                {selectedStudents.length > 0 && (
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<GavelIcon />}
                        onClick={() => setBulkDialogOpen(true)}
                    >
                        Délibérer {selectedStudents.length} sélectionné(s)
                    </Button>
                )}
                <JuryExportButton periodeId={periodeId} />
                <JuryBulletinsExportButton periodeId={periodeId} />
            </Box>
        );
    }, [periodeId, data, nbDeliberes, nbTotal, nbIncomplets, selectedStudents]);

    // ── Props de lignes mémoïsées ─────────────────────────────────────────────
    const rowProps = useCallback(({ row }: { row: MRT_Row<StudentEntry> }) => ({
        sx: {
            backgroundColor: row.index % 2 === 0 ? 'background.default' : 'action.hover',
            '&:hover td': { backgroundColor: 'primary.50 !important', transition: 'background-color 0.15s' },
            cursor: 'default',
        },
    }), []);

    const cellProps = useCallback(({ row }: { row: MRT_Row<StudentEntry> }) => ({
        sx: {
            fontSize: '0.8rem',
            py: 0.5,
            ...(row.index % 2 !== 0 && { backgroundColor: 'action.hover' }),
        },
    }), []);

    // ── Table ─────────────────────────────────────────────────────────────────
    const table = useMaterialReactTable({
        columns,
        data: students,
        state: { isLoading, rowSelection },
        onRowSelectionChange: setRowSelection,

        // Un dossier incomplet n'est pas délibérable : sa case reste inerte
        // plutôt que d'être silencieusement retirée de la sélection.
        enableRowSelection: (row: MRT_Row<StudentEntry>) => !dossiersIncomplets.has(row.original.userID),
        enableColumnPinning: true,
        initialState: {
            density: 'compact',
            columnPinning: { left: ['mrt-row-select', 'statut', 'lastName', 'firstName'] },
            sorting: [{ id: 'lastName', desc: false }],
        },

        // ── Virtualisation ────────────────────────────────────────────────────
        enableRowVirtualization: true,
        rowVirtualizerOptions: ROW_VIRTUALIZER_OPTIONS,

        // Options UX
        enableColumnResizing: true,
        enableStickyHeader: true,
        enablePagination: false,
        enableDensityToggle: false,
        enableFullScreenToggle: true,
        enableGlobalFilter: true,

        // Constantes stables définies hors du composant — évite les boucles infinies
        muiTableContainerProps: CONTAINER_PROPS,
        muiTableHeadCellProps: HEAD_CELL_PROPS,
        mrtTheme: TABLE_THEME,

        // Props mémoïsées
        muiTableBodyRowProps: rowProps,
        muiTableBodyCellProps: cellProps,

        renderTopToolbarCustomActions,
    });

    // ── Rendu ─────────────────────────────────────────────────────────────────
    if (isError) {
        return (
            <Alert severity="error">
                Erreur lors du chargement de la synthèse : {messageForError(error)}
            </Alert>
        );
    }

    return (
        <Box sx={{ m: '20px' }}>
            <MaterialReactTable table={table} />
            <DelibererBulkDialog
                open={bulkDialogOpen}
                students={selectedStudents}
                loading={bulkLoading}
                onClose={() => setBulkDialogOpen(false)}
                onConfirm={handleBulkConfirm}
            />
        </Box>
    );
};
