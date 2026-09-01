import { Box, Button, Chip, darken, Tooltip, Typography } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { MRT_Localization_FR } from 'material-react-table/locales/fr';
import { MRT_Localization_EN } from 'material-react-table/locales/en';
import { EtatVideTable } from '../../services/crud/EtatVideTable';
import { ENDPOINT_DELIBERER, ENDPOINT_JURY } from './def';
import { JuryExportButton } from './JuryExportButton';
import { JuryBulletinsExportButton } from './JuryBulletinsExportButton';
import { DelibererButton } from './DelibererButton';
import { DelibererBulkDialog, type BulkStudent } from './DelibererBulkDialog';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';
import { Gavel } from 'lucide-react';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';

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
const BooleanCell = memo(({ value, oui, non }: { value: boolean | null | undefined; oui: string; non: string }) => {
    if (value === null || value === undefined)
        return <Typography variant="body2" color="text.disabled">—</Typography>;
    return <Typography variant="body2">{value ? oui : non}</Typography>;
});

/** Cellule Entier pour afficher un nombre entier ou — */
const IntegerCell = memo(({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined)
        return <Typography variant="body2" color="text.disabled">—</Typography>;
    return <Typography variant="body2">{value}</Typography>;
});

// ─────────────────────────────────────────────────────────────────────────────
// Rendus de colonnes — `Cell` et `Header` sont appelés par MRT comme de
// simples fonctions, pas montés comme des composants ; les écrire ici plutôt
// que dans le corps du composant ne change donc rien au rendu. Mais six
// colonnes de synthèse répétaient le même entête à l'infobulle près, et douze
// arrtêtes enveloppaient un composant déjà mémoïsé dans une flèche neuve.
// ─────────────────────────────────────────────────────────────────────────────

type CelluleJury = NonNullable<MRT_ColumnDef<StudentEntry>['Cell']>;
type DeliberationParEleve = ReadonlyMap<number, { delibere: boolean; compteCumul: boolean }>;

/** L'entête des colonnes de synthèse : une infobulle sur un libellé court. */
const enteteInfobulle = (titre: string, libelle: string, multiligne = false) => () => (
    <Tooltip title={titre}>
        <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, ...(multiligne ? { whiteSpace: 'pre-line' } : {}) }}>
                {libelle}
            </Typography>
        </Box>
    </Tooltip>
);

const celluleGpa: CelluleJury = ({ cell }) => <GpaCell value={cell.getValue<number | null>()} />;
const celluleEntier: CelluleJury = ({ cell }) => <IntegerCell value={cell.getValue<number | null>()} />;
function celluleBooleen(t: TFunction<'jury'>): CelluleJury {
    return ({ cell }) => <BooleanCell value={cell.getValue<boolean | null>()} oui={t('commun.oui')} non={t('commun.non')} />;
}
const celluleEctsEchec: CelluleJury = ({ cell }) => <EctsEchecCell value={cell.getValue<number>()} />;

const celluleEctsValides: CelluleJury = ({ cell }) => (
    <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {cell.getValue<number>()}
    </Typography>
);

const celluleGrade: CelluleJury = ({ cell }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <GradeBadge grade={cell.getValue<string | null>()} />
    </Box>
);

/** L'entête d'un groupe d'UE : le nom complet en infobulle s'il est tronqué. */
const enteteUe = (ue: { nom: string; ects: number }) => () => {
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
};

/**
 * La cellule de statut : le seul rendu de colonne qui dépende de l'état de
 * l'écran — les délibérations déjà prises, les dossiers incomplets, le droit
 * d'écrire. On les passe en arguments plutôt que de les capter au vol.
 */
const celluleStatut = (
    periodeId: string,
    deliberationByUser: DeliberationParEleve,
    dossiersIncomplets: ReadonlyMap<number, string[]>,
    peutDeliberer: boolean,
    t: TFunction<'jury'>,
): CelluleJury => ({ row }) => {
    const info = deliberationByUser.get(row.original.userID);
    const nom = `${row.original.juryStat.lastName ?? ''} ${row.original.juryStat.firstName ?? ''}`.trim();
    const incompletes = dossiersIncomplets.get(row.original.userID);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {info?.delibere ? (
                <Chip
                    label={info.compteCumul ? t('statut.delibere') : t('statut.redoublant')}
                    size="small"
                    color={info.compteCumul ? 'success' : 'warning'}
                    sx={{ fontSize: '0.68rem', height: 20 }}
                />
            ) : incompletes ? (
                // « En attente » dirait qu'il ne manque qu'une décision.
                // Ici c'est une note qui manque, et le jury doit le voir.
                <Tooltip title={`${t('statut.nonEvalueePrefixe')}${incompletes.join(', ')}`}>
                    <Chip
                        label={t('statut.incomplet')}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ fontSize: '0.68rem', height: 20 }}
                    />
                </Tooltip>
            ) : (
                <Chip label={t('statut.enAttente')} size="small" variant="outlined" sx={{ fontSize: '0.68rem', height: 20 }} />
            )}
            {peutDeliberer && (
                <DelibererButton
                    periodeId={periodeId}
                    userId={row.original.userID}
                    userName={nom}
                    isDelibere={info?.delibere ?? false}
                    compteCumulActuel={info?.compteCumul}
                    uesNonEvaluees={incompletes}
                />
            )}
        </Box>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Constantes stables hors du composant
// Tout ce qui est défini ici a une référence stable entre les renders,
// ce qui évite les boucles infinies dans MRT (mrtTheme, muiTableHeadCellProps)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_STUDENTS: StudentEntry[] = [];

/** « 1 élève délibéré. » / « 12 élèves délibérés. » */
function messageDeliberationGroupee(nombre: number, t: TFunction<'jury'>): string {
    return t('deliberationGroupee', { count: nombre, formatted: formatNombre.format(nombre) });
}

const TABLE_THEME = (theme: Theme) => ({
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

const fetchSynthese = async (periodeId: string | undefined, t: TFunction<'jury'>): Promise<JuryData> => {
    if (!periodeId) throw new Error(t('erreurPeriodeIdObligatoire'));
    try {
        const rep = await apiInstance.get<JuryData>(`${ENDPOINT_JURY}/data/${periodeId}`);
        return rep.data;
    } catch (error: unknown) {
        throw handleAxiosError(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export const JuryPeriode = () => {
    const { periodeId } = useParams();
    const queryClient = useQueryClient();
    const { t, i18n: i18nInstance } = useTranslation('jury');

    // Consulter la synthèse et exporter sont des lectures ; délibérer, annuler
    // et la sélection qui y mène exigent le rôle d'écriture du jury.
    const { possedeRole } = useDroits();
    const peutDeliberer = possedeRole(Role.JURY_ECRITURE);

    const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['syntheseJury', periodeId],
        queryFn: () => fetchSynthese(periodeId, t),
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
    const nbTotal = data?.students.length ?? 0;

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
                header: t('colonnes.statut'),
                size: 110,
                enableSorting: false,
                enableColumnFilter: false,
                accessorFn: (row) => deliberationByUser.get(row.userID)?.delibere ?? false,
                Cell: periodeId ? celluleStatut(periodeId, deliberationByUser, dossiersIncomplets, peutDeliberer, t) : () => null,
                muiTableHeadCellProps: { sx: { fontWeight: 700 } },
            },
            {
                id: 'lastName',
                header: t('colonnes.nom'),
                size: 140,
                accessorFn: (row) => row.juryStat.lastName,
                muiTableHeadCellProps: { sx: { fontWeight: 700 } },
            },
            {
                id: 'firstName',
                header: t('colonnes.prenom'),
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
            Header: enteteUe(ue),
            columns: [
                {
                    id: `ue_${ue.id}_grade`,
                    header: t('colonnes.grade'),
                    size: 140,
                    accessorFn: (row) => data.statsUe[row.userID]?.[ue.id]?.grade_lettre,
                    Cell: celluleGrade,
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
                header: t('colonnes.gpaAca'),
                Header: enteteInfobulle(t('colonnes.gpaAcaInfobulle'), t('colonnes.gpaAca')),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_academique_periode,
                Cell: celluleGpa,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
            {
                id: 'gpa',
                header: t('colonnes.gpa'),
                Header: enteteInfobulle(t('colonnes.gpaInfobulle'), t('colonnes.gpa')),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_periode,
                Cell: celluleGpa,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
             {
                id: 'toeic',
                header: t('colonnes.toeic'),
                Header: enteteInfobulle(t('colonnes.toeicInfobulle'), t('colonnes.toeic')),
                size: 100,
                accessorFn: (row) => row.juryStat.toeic,
                Cell: celluleEntier,
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
             {
                id: 'mobilite_valide',
                header: t('colonnes.mobilite'),
                Header: enteteInfobulle(t('colonnes.mobiliteInfobulle'), t('colonnes.mobilite')),
                size: 100,
                accessorFn: (row) => row.juryStat.mobilite_valide,
                Cell: celluleBooleen(t),
                muiTableHeadCellProps: { sx: { fontWeight: 700, borderLeft: '2px solid', borderLeftColor: 'divider' } },
                muiTableBodyCellProps: { sx: { textAlign: 'center', borderLeft: '2px solid', borderLeftColor: 'divider' } },
            },
            {
                id: 'ects_acquis',
                header: t('colonnes.ectsValides'),
                Header: enteteInfobulle(t('colonnes.ectsValidesInfobulle'), t('colonnes.ectsValides'), true),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_valides,
                Cell: celluleEctsValides,
                muiTableBodyCellProps: { sx: { textAlign: 'center' } },
            },
            {
                id: 'ects_non_valides',
                header: t('colonnes.ectsEchecs'),
                Header: enteteInfobulle(t('colonnes.ectsEchecsInfobulle'), t('colonnes.ectsEchecs'), true),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_periode - row.juryStat.total_ects_valides,
                Cell: celluleEctsEchec,
                muiTableBodyCellProps: { sx: { textAlign: 'center' } },
            },
        ];

        return [...baseCols, ...ueCols, ...endCols];
    }, [data, deliberationByUser, dossiersIncomplets, periodeId, peutDeliberer, t]);

    // ── Données mémoïsées — évite un nouveau [] à chaque render ─────────────
    const students = useMemo(() => data?.students ?? EMPTY_STUDENTS, [data?.students]);

    // ── Élèves sélectionnés non encore délibérés ──────────────────────────────
    const selectedStudents = useMemo<BulkStudent[]>(() => {
        return Object.keys(rowSelection)
            // Une ligne sélectionnée puis disparue des données laisse un trou :
            // le prédicat de type le dit au compilateur, là où un `s &&` ne
            // faisait que l'écarter à l'exécution.
            .map(idx => students[Number(idx)])
            .filter((s): s is StudentEntry => s !== undefined)
            .filter(s => !deliberationByUser.get(s.userID)?.delibere)
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
            notifySuccess(messageDeliberationGroupee(entries.length, t));
            void queryClient.invalidateQueries({ queryKey: ['jury-deliberations', periodeId] });
            setRowSelection({});
            setBulkDialogOpen(false);
        } catch {
            notifyError(t('erreurDeliberationGroupee'));
        } finally {
            setBulkLoading(false);
        }
    }, [periodeId, queryClient, t]);

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const renderTopToolbarCustomActions = useCallback(() => {
        if (!periodeId) return null;
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    {data?.hierarchy?.periode}
                </Typography>
                <Chip
                    label={t('compteurDeliberes', { delibere: nbDeliberes, total: nbTotal })}
                    size="small"
                    color={nbDeliberes === nbTotal && nbTotal > 0 ? 'success' : 'default'}
                    variant={nbDeliberes === nbTotal && nbTotal > 0 ? 'filled' : 'outlined'}
                />
                {nbIncomplets > 0 && (
                    <Tooltip title={t('tooltipDossiersIncomplets')}>
                        <Chip
                            label={t('dossiersIncomplets', { count: nbIncomplets })}
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
                        startIcon={<Gavel size={18} />}
                        onClick={() => { setBulkDialogOpen(true); }}
                    >
                        {t('delibererSelection', { count: selectedStudents.length })}
                    </Button>
                )}
                <JuryExportButton periodeId={periodeId} />
                <JuryBulletinsExportButton periodeId={periodeId} />
            </Box>
        );
    }, [periodeId, data, nbDeliberes, nbTotal, nbIncomplets, selectedStudents, t]);

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
        localization: i18nInstance.language.startsWith('en') ? MRT_Localization_EN : MRT_Localization_FR,
        // Écran de synthèse : l'effectif vient de la structure, on n'y crée
        // pas d'élève. Le message constate, sans inviter.
        renderEmptyRowsFallback: ({ table }) => (
            <EtatVideTable table={table} message={t('aucunEleve')} />
        ),
        state: { isLoading, rowSelection },
        onRowSelectionChange: setRowSelection,

        // Un dossier incomplet n'est pas délibérable : sa case reste inerte
        // plutôt que d'être silencieusement retirée de la sélection. La
        // sélection ne sert qu'à la délibération groupée : sans le droit
        // d'écriture du jury, elle disparaît.
        enableRowSelection: peutDeliberer
            ? (row: MRT_Row<StudentEntry>) => !dossiersIncomplets.has(row.original.userID)
            : false,
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
                {t('erreurChargementSynthese', { erreur: messageForError(error) })}
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
                onClose={() => { setBulkDialogOpen(false); }}
                onConfirm={(entries) => { void handleBulkConfirm(entries); }}
            />
        </Box>
    );
};
