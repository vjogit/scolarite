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
import type {
    ColumnDef,
    RowSelectionState,
    Table as TableTanstack,
} from '@tanstack/react-table';
import { DataTable } from '../../services/crud/DataTable';
import { useEtatTablePersistant } from '../../services/crud/usePersistentTableState';
import { EtatVideTable } from '../../services/crud/EtatVideTable';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { ENDPOINT_DELIBERER, ENDPOINT_JURY } from './def';
import { JuryExportButton } from './JuryExportButton';
import { JuryBulletinsExportButton } from './JuryBulletinsExportButton';
import { DelibererButton } from './DelibererButton';
import { DelibererBulkDialog, type BulkStudent } from './DelibererBulkDialog';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';
import { CircleAlert, Gavel, Maximize2, Minimize2 } from 'lucide-react';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuelles
// ─────────────────────────────────────────────────────────────────────────────

/** Le tiret d'une valeur absente — le `text.disabled` MUI. */
const Absent = () => <span className="text-sm text-muted-foreground">—</span>;

/** Rendu d'un grade : rouge si F, normal sinon */
function GradeBadge({ grade }: { grade: string | null | undefined }) {
    if (!grade) return <Absent />;
    const isF = grade === 'F';
    return (
        <span className={cn('text-sm', isF && 'font-bold text-destructive')}>
            {grade}
        </span>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Cell renderers mémoïsés — définis hors du composant pour éviter
// de nouvelles références à chaque render et casser la mémoïsation
// ─────────────────────────────────────────────────────────────────────────────

/** Cellule GPA */
const GpaCell = memo(({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined) return <Absent />;
    return <span className="text-sm">{value.toFixed(2)}</span>;
});

/** Cellule ECTS non validés */
const EctsEchecCell = memo(({ value }: { value: number }) => (
    <span className={cn('text-sm', value > 0 ? 'font-bold text-destructive' : 'text-success')}>
        {value}
    </span>
));

/** Cellule Booléenne pour afficher Oui/Non ou — */
const BooleanCell = memo(({ value, oui, non }: { value: boolean | null | undefined; oui: string; non: string }) => {
    if (value === null || value === undefined) return <Absent />;
    return <span className="text-sm">{value ? oui : non}</span>;
});

/** Cellule Entier pour afficher un nombre entier ou — */
const IntegerCell = memo(({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined) return <Absent />;
    return <span className="text-sm">{value}</span>;
});

// ─────────────────────────────────────────────────────────────────────────────
// Rendus de colonnes — `cell` et `header` sont appelés par la table comme de
// simples fonctions, pas montés comme des composants ; les écrire ici plutôt
// que dans le corps du composant ne change donc rien au rendu. Mais six
// colonnes de synthèse répétaient le même entête à l'infobulle près, et douze
// arrtêtes enveloppaient un composant déjà mémoïsé dans une flèche neuve.
// ─────────────────────────────────────────────────────────────────────────────

type CelluleJury = NonNullable<ColumnDef<StudentEntry>['cell']>;

/**
 * Les pastilles de statut — les `Chip` MUI, teintées sur les tokens de
 * sévérité (lot 2) comme les alertes : fond /15 + texte de la teinte pour
 * l'ancien « plein », contour de la teinte pour l'ancien « outlined ». Les
 * deux modes suivent les tokens.
 */
const CLASSES_BADGE_SUCCES = 'border-transparent bg-success/15 text-success';
const CLASSES_BADGE_AVERTISSEMENT = 'border-transparent bg-warning/15 text-warning';
const CLASSES_BADGE_AVERTISSEMENT_CONTOUR = 'border-warning/50 text-warning';
type DeliberationParEleve = ReadonlyMap<number, { delibere: boolean; compteCumul: boolean }>;

/** L'entête des colonnes de synthèse : une infobulle sur un libellé court. */
const enteteInfobulle = (titre: string, libelle: string, multiligne = false) => () => (
    <Tooltip>
        <TooltipTrigger render={<div className="text-center" />}>
            <span className={cn('text-xs font-bold', multiligne && 'whitespace-pre-line')}>
                {libelle}
            </span>
        </TooltipTrigger>
        <TooltipContent>{titre}</TooltipContent>
    </Tooltip>
);

const celluleGpa: CelluleJury = ({ cell }) => <GpaCell value={cell.getValue<number | null>()} />;
const celluleEntier: CelluleJury = ({ cell }) => <IntegerCell value={cell.getValue<number | null>()} />;
function celluleBooleen(t: TFunction<'jury'>): CelluleJury {
    return ({ cell }) => <BooleanCell value={cell.getValue<boolean | null>()} oui={t('commun.oui')} non={t('commun.non')} />;
}
const celluleEctsEchec: CelluleJury = ({ cell }) => <EctsEchecCell value={cell.getValue<number>()} />;

const celluleEctsValides: CelluleJury = ({ cell }) => (
    <span className="text-sm font-medium">
        {cell.getValue<number>()}
    </span>
);

const celluleGrade: CelluleJury = ({ cell }) => (
    <div className="flex justify-center">
        <GradeBadge grade={cell.getValue<string | null>()} />
    </div>
);

/** L'entête d'un groupe d'UE : le nom complet en infobulle s'il est tronqué. */
const enteteUe = (ue: { nom: string; ects: number }) => () => {
    const tronque = ue.nom.length > 40;
    const displayName = tronque ? `${ue.nom.substring(0, 39)}…` : ue.nom;
    const contenu = (
        <>
            <span className="block text-xs font-bold">{displayName}</span>
            <span className="text-xs opacity-80">{ue.ects} ECTS</span>
        </>
    );
    if (!tronque) return <div className="text-center leading-[1.3]">{contenu}</div>;
    return (
        <Tooltip>
            <TooltipTrigger render={<div className="text-center leading-[1.3]" />}>
                {contenu}
            </TooltipTrigger>
            <TooltipContent>{ue.nom}</TooltipContent>
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
        <div className="flex items-center gap-1">
            {info?.delibere ? (
                <Badge className={info.compteCumul ? CLASSES_BADGE_SUCCES : CLASSES_BADGE_AVERTISSEMENT}>
                    {info.compteCumul ? t('statut.delibere') : t('statut.redoublant')}
                </Badge>
            ) : incompletes ? (
                // « En attente » dirait qu'il ne manque qu'une décision.
                // Ici c'est une note qui manque, et le jury doit le voir.
                <Tooltip>
                    <TooltipTrigger render={<Badge variant="outline" className={CLASSES_BADGE_AVERTISSEMENT_CONTOUR} />}>
                        {t('statut.incomplet')}
                    </TooltipTrigger>
                    <TooltipContent>{`${t('statut.nonEvalueePrefixe')}${incompletes.join(', ')}`}</TooltipContent>
                </Tooltip>
            ) : (
                <Badge variant="outline">{t('statut.enAttente')}</Badge>
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
        </div>
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
        const toutDelibere = nbDeliberes === nbTotal && nbTotal > 0;
        const libellePleinEcran = pleinEcran ? t('quitterPleinEcran') : t('pleinEcran');
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                    {data?.hierarchy?.periode}
                </span>
                <Badge variant={toutDelibere ? 'default' : 'outline'} className={cn(toutDelibere && CLASSES_BADGE_SUCCES)}>
                    {t('compteurDeliberes', { delibere: nbDeliberes, total: nbTotal })}
                </Badge>
                {nbIncomplets > 0 && (
                    <Tooltip>
                        <TooltipTrigger render={<Badge variant="outline" className={CLASSES_BADGE_AVERTISSEMENT_CONTOUR} />}>
                            {t('dossiersIncomplets', { count: nbIncomplets })}
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltipDossiersIncomplets')}</TooltipContent>
                    </Tooltip>
                )}
                {selectedStudents.length > 0 && (
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => { setBulkDialogOpen(true); }}
                    >
                        <Gavel />
                        {t('delibererSelection', { count: selectedStudents.length })}
                    </Button>
                )}
                <JuryExportButton periodeId={periodeId} />
                <JuryBulletinsExportButton periodeId={periodeId} />
                <Tooltip>
                    <TooltipTrigger
                        render={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={libellePleinEcran}
                                onClick={() => { setPleinEcran(actif => !actif); }}
                            />
                        )}
                    >
                        {pleinEcran ? <Minimize2 /> : <Maximize2 />}
                    </TooltipTrigger>
                    <TooltipContent>{libellePleinEcran}</TooltipContent>
                </Tooltip>
            </div>
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
            <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                    {t('erreurChargementSynthese', { erreur: messageForError(error) })}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="m-5">
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
        </div>
    );
};
