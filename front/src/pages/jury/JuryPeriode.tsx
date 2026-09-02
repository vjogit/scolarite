import { Box, Button, Chip, Tooltip, Typography } from '@mui/material';
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
import type {
    ColumnDef,
    RowSelectionState,
    Table as TableTanstack,
} from '@tanstack/react-table';
import { DataTable } from '../../services/crud/DataTable';
import { useEtatTablePersistant } from '../../services/crud/usePersistentTableState';
import { EtatVideTable } from '../../services/crud/EtatVideTable';
import { Button as BoutonTable } from '../../components/ui/button';
import { ENDPOINT_DELIBERER, ENDPOINT_JURY } from './def';
import { JuryExportButton } from './JuryExportButton';
import { JuryBulletinsExportButton } from './JuryBulletinsExportButton';
import { DelibererButton } from './DelibererButton';
import { DelibererBulkDialog, type BulkStudent } from './DelibererBulkDialog';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';
import { Gavel, Maximize2, Minimize2 } from 'lucide-react';
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
// de nouvelles références à chaque render et casser la mémoïsation
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
// Rendus de colonnes — `cell` et `header` sont appelés par la table comme de
// simples fonctions, pas montés comme des composants ; les écrire ici plutôt
// que dans le corps du composant ne change donc rien au rendu. Mais six
// colonnes de synthèse répétaient le même entête à l'infobulle près, et douze
// arrtêtes enveloppaient un composant déjà mémoïsé dans une flèche neuve.
// ─────────────────────────────────────────────────────────────────────────────

type CelluleJury = NonNullable<ColumnDef<StudentEntry>['cell']>;
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
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'inherit' }}>
                    {displayName}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8, color: 'inherit' }}>
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
// Le motif d'origine (les boucles infinies de MRT) est parti avec lui, mais
// la stabilité référentielle reste utile : ces valeurs entrent dans des mémos
// et des hooks, une référence neuve à chaque render les invaliderait.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_STUDENTS: StudentEntry[] = [];

/** Les quatre colonnes gelées à gauche — la case de sélection du socle
 *  comprise : au défilement horizontal sur N colonnes d'UE, on doit toujours
 *  savoir de quel élève on lit la note. */
const COLONNES_GELEES = ['selection', 'statut', 'lastName', 'firstName'];

/** Tri initial par nom — un tri mémorisé en session l'emporte. */
const DEFAUTS_ETAT = { sorting: [{ id: 'lastName', desc: false }] };

/** « 1 élève délibéré. » / « 12 élèves délibérés. » */
function messageDeliberationGroupee(nombre: number, t: TFunction<'jury'>): string {
    return t('deliberationGroupee', { count: nombre, formatted: formatNombre.format(nombre) });
}

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
    const { t } = useTranslation('jury');

    // Consulter la synthèse et exporter sont des lectures ; délibérer, annuler
    // et la sélection qui y mène exigent le rôle d'écriture du jury.
    const { possedeRole } = useDroits();
    const peutDeliberer = possedeRole(Role.JURY_ECRITURE);

    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    // Plein écran local à cet écran (le socle l'a abandonné au lot 7 ; ici il
    // a un sens réel — synthèse large à colonnes dynamiques). Non persisté,
    // comme avant : une page rechargée en plein écran serait déroutante.
    const [pleinEcran, setPleinEcran] = useState(false);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['syntheseJury', periodeId],
        queryFn: () => fetchSynthese(periodeId, t),
        staleTime: 5 * 60 * 1000,
    });

    // Même clé que la requête : l'état de table est persisté par période.
    const etat = useEtatTablePersistant(['syntheseJury', periodeId], DEFAUTS_ETAT);

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
    const colonnes = useMemo<ColumnDef<StudentEntry>[]>(() => {
        if (!data?.hierarchy) return [];

        // A. Colonnes identité (gelées à gauche via COLONNES_GELEES)
        const baseCols: ColumnDef<StudentEntry>[] = [
            {
                id: 'statut',
                header: t('colonnes.statut'),
                size: 110,
                enableSorting: false,
                enableColumnFilter: false,
                accessorFn: (row) => deliberationByUser.get(row.userID)?.delibere ?? false,
                cell: periodeId ? celluleStatut(periodeId, deliberationByUser, dossiersIncomplets, peutDeliberer, t) : () => null,
            },
            {
                id: 'lastName',
                header: t('colonnes.nom'),
                size: 140,
                accessorFn: (row) => row.juryStat.lastName,
            },
            {
                id: 'firstName',
                header: t('colonnes.prenom'),
                size: 130,
                accessorFn: (row) => row.juryStat.firstName,
            },
        ];

        // B. Colonnes UE dynamiques — groupe par UE (nom + ECTS) sur la
        // rangée du haut, le grade en colonne feuille. Les bordures qui
        // séparent les blocs passent par `meta` (classes, plus de `sx`).
        const ueCols: ColumnDef<StudentEntry>[] = data.hierarchy.ues.map((ue) => ({
            id: `ue_group_${ue.id}`,
            header: enteteUe(ue),
            meta: {
                libelle: ue.nom,
                headerClassName: 'border-r-2 bg-primary text-center text-primary-foreground',
            },
            columns: [
                {
                    id: `ue_${ue.id}_grade`,
                    header: t('colonnes.grade'),
                    size: 140,
                    accessorFn: (row) => data.statsUe[row.userID]?.[ue.id]?.grade_lettre,
                    cell: celluleGrade,
                    meta: {
                        libelle: ue.nom,
                        headerClassName: 'border-r-2 text-center',
                        className: 'border-r-2 text-center',
                    },
                },
            ],
        }));

        // C. Colonnes synthèse (GPA, ECTS)
        const endCols: ColumnDef<StudentEntry>[] = [
            {
                id: 'gpa_academique_periode',
                header: enteteInfobulle(t('colonnes.gpaAcaInfobulle'), t('colonnes.gpaAca')),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_academique_periode,
                cell: celluleGpa,
                meta: {
                    libelle: t('colonnes.gpaAca'),
                    headerClassName: 'border-l-2',
                    className: 'border-l-2 text-center',
                },
            },
            {
                id: 'gpa',
                header: enteteInfobulle(t('colonnes.gpaInfobulle'), t('colonnes.gpa')),
                size: 100,
                accessorFn: (row) => row.juryStat.gpa_periode,
                cell: celluleGpa,
                meta: {
                    libelle: t('colonnes.gpa'),
                    headerClassName: 'border-l-2',
                    className: 'border-l-2 text-center',
                },
            },
            {
                id: 'toeic',
                header: enteteInfobulle(t('colonnes.toeicInfobulle'), t('colonnes.toeic')),
                size: 100,
                accessorFn: (row) => row.juryStat.toeic,
                cell: celluleEntier,
                meta: {
                    libelle: t('colonnes.toeic'),
                    headerClassName: 'border-l-2',
                    className: 'border-l-2 text-center',
                },
            },
            {
                id: 'mobilite_valide',
                header: enteteInfobulle(t('colonnes.mobiliteInfobulle'), t('colonnes.mobilite')),
                size: 100,
                accessorFn: (row) => row.juryStat.mobilite_valide,
                cell: celluleBooleen(t),
                meta: {
                    libelle: t('colonnes.mobilite'),
                    headerClassName: 'border-l-2',
                    className: 'border-l-2 text-center',
                },
            },
            {
                id: 'ects_acquis',
                header: enteteInfobulle(t('colonnes.ectsValidesInfobulle'), t('colonnes.ectsValides'), true),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_valides,
                cell: celluleEctsValides,
                meta: {
                    libelle: t('colonnes.ectsValidesInfobulle'),
                    className: 'text-center',
                },
            },
            {
                id: 'ects_non_valides',
                header: enteteInfobulle(t('colonnes.ectsEchecsInfobulle'), t('colonnes.ectsEchecs'), true),
                size: 140,
                accessorFn: (row) => row.juryStat.total_ects_periode - row.juryStat.total_ects_valides,
                cell: celluleEctsEchec,
                meta: {
                    libelle: t('colonnes.ectsEchecsInfobulle'),
                    className: 'text-center',
                },
            },
        ];

        return [...baseCols, ...ueCols, ...endCols];
    }, [data, deliberationByUser, dossiersIncomplets, periodeId, peutDeliberer, t]);

    // ── Données mémoïsées — évite un nouveau [] à chaque render ─────────────
    const students = useMemo(() => data?.students ?? EMPTY_STUDENTS, [data?.students]);

    const getRowId = useCallback((eleve: StudentEntry) => String(eleve.userID), []);

    // Un dossier incomplet n'est pas délibérable : sa case reste inerte
    // plutôt que d'être silencieusement retirée de la sélection (le socle
    // la rend désactivée). La sélection ne sert qu'à la délibération
    // groupée : sans le droit d'écriture du jury, elle disparaît.
    const peutSelectionnerLigne = useCallback(
        (eleve: StudentEntry) => !dossiersIncomplets.has(eleve.userID),
        [dossiersIncomplets],
    );

    // ── Élèves sélectionnés non encore délibérés ──────────────────────────────
    const selectedStudents = useMemo<BulkStudent[]>(() => {
        // La sélection est indexée par userID (`getRowId`) : itérer les élèves
        // présents écarte naturellement une ligne sélectionnée puis disparue
        // des données — le « trou » de l'ancienne indexation par position.
        return students
            .filter(s => rowSelection[String(s.userID)])
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

    // ── Barre d'outils : le bandeau MUI (compteurs, exports) + le plein écran ─
    const barreOutils = useCallback(() => {
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
                <Tooltip title={pleinEcran ? t('quitterPleinEcran') : t('pleinEcran')}>
                    <BoutonTable
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={pleinEcran ? t('quitterPleinEcran') : t('pleinEcran')}
                        onClick={() => { setPleinEcran(actif => !actif); }}
                    >
                        {pleinEcran ? <Minimize2 /> : <Maximize2 />}
                    </BoutonTable>
                </Tooltip>
            </Box>
        );
    }, [periodeId, data, nbDeliberes, nbTotal, nbIncomplets, selectedStudents, pleinEcran, t]);

    // Écran de synthèse : l'effectif vient de la structure, on n'y crée
    // pas d'élève. Le message constate, sans inviter.
    const etatVide = useCallback((table: TableTanstack<StudentEntry>) => (
        <EtatVideTable table={table} message={t('aucunEleve')} />
    ), [t]);

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
            <div className={pleinEcran
                ? 'fixed inset-0 z-50 flex flex-col bg-background p-4'
                : 'flex max-h-[75vh] flex-col'}
            >
                <DataTable<StudentEntry>
                    colonnes={colonnes}
                    donnees={students}
                    enChargement={isLoading}
                    etat={etat}
                    getRowId={getRowId}
                    selection={peutDeliberer ? { rowSelection, onRowSelectionChange: setRowSelection } : undefined}
                    peutSelectionnerLigne={peutSelectionnerLigne}
                    gelColonnes={COLONNES_GELEES}
                    sansPagination
                    redimensionnement
                    barreOutils={barreOutils}
                    etatVide={etatVide}
                />
            </div>
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
