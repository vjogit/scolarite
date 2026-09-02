/**
 * Le socle table du projet : TanStack Table rendu en shadcn (lot 7).
 *
 * MRT tournait déjà sur TanStack Table — le moteur ne change pas, seules la
 * couche de rendu et l'API disparaissent. Ce composant est générique et a
 * vocation à servir toutes les tables de l'application, celles de la couche
 * crud (via `ListTanstack`) comme, plus tard, `GroupeUserPage` et
 * `JuryPeriode`.
 *
 * Périmètre volontairement calé sur ce que MRT montrait réellement ici :
 * recherche globale, filtres par colonne, menu des colonnes, tri au clic sur
 * l'en-tête (le menu ⋮ par colonne de MRT disparaît — tout ce qu'il offrait
 * existe ailleurs), pagination, sélection, en-tête collant, squelette de
 * chargement. Densité et plein écran : abandonnés (décision du lot 7), le
 * rendu unique est calé sur l'ancien défaut « compact ».
 *
 * Le lot 10 (JuryPeriode) y ajoute quatre capacités, toutes **opt-in** — un
 * écran qui ne les déclare pas rend exactement comme avant : `gelColonnes`
 * (colonnes collées à gauche au défilement horizontal), `sansPagination`
 * (toutes les lignes rendues, pas de pied de pagination), `redimensionnement`
 * (poignées sur les en-têtes — chaque colonne doit alors déclarer `size`),
 * et `peutSelectionnerLigne` (sélection refusée ligne par ligne : la case
 * reste visible mais inerte, jamais retirée en silence). Les en-têtes
 * groupés (`columns` imbriqués TanStack) sont rendus sur deux rangées.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type Column,
    type ColumnDef,
    type Header as HeaderTanstack,
    type OnChangeFn,
    type Row,
    type RowData,
    type RowSelectionState,
    type Table as TableTanstack,
} from '@tanstack/react-table';
import {
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    ChevronLeft,
    ChevronRight,
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
    Columns3,
    Funnel,
    Search,
    X,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EtatTablePersistant } from './usePersistentTableState';

/**
 * Ce que les colonnes du projet peuvent déclarer en plus du contrat TanStack.
 * C'est ici que passe ce que MRT prenait par `muiTableHeadCellProps`/
 * `muiTableBodyCellProps` : des classes, plus de `sx`.
 */
declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        /** Classes de la cellule de corps. */
        className?: string;
        /** Classes de la cellule d'en-tête. */
        headerClassName?: string;
        /** Libellé texte de la colonne quand `header` n'est pas une chaîne
         *  (en-tête à infobulle) — menu des colonnes et placeholder de filtre. */
        libelle?: string;
    }
}

/** Tailles de page offertes — resserrées sur l'usage (MRT en listait huit). */
const TAILLES_PAGE = [10, 25, 50, 100];

/** Nombre de lignes du squelette de chargement. */
const LIGNES_SQUELETTE = 5;

export interface DataTableProps<D> {
    colonnes: ColumnDef<D>[];
    donnees: D[];
    enChargement?: boolean;
    /** Les sept états persistés en session (`useEtatTablePersistant`). */
    etat: EtatTablePersistant;
    /** Identifiant stable d'une ligne — la sélection y est indexée, elle
     *  survit donc au tri et au filtre. */
    getRowId: (ligne: D) => string;
    /** Sélection contrôlée par l'appelant (absente : pas de colonne à cases). */
    selection?: {
        rowSelection: RowSelectionState;
        onRowSelectionChange: OnChangeFn<RowSelectionState>;
    };
    /** Contenu de la colonne « Actions », en dernière position (parité MRT). */
    actionsLigne?: (ligne: D) => React.ReactNode;
    /** Zone gauche de la barre d'outils. `lignesVisibles` : les lignes
     *  filtrées et triées, avant pagination — paresseux. */
    barreOutils?: (ctx: { lignesVisibles: () => D[] }) => React.ReactNode;
    /** Rendu du corps quand aucune ligne ne reste (vide réel ou filtré). */
    etatVide?: (table: TableTanstack<D>) => React.ReactNode;
    /** Classes supplémentaires d'une ligne (mise en évidence au retour
     *  d'enregistrement). */
    classeLigne?: (ligne: D) => string | undefined;
    /** Ids des colonnes gelées à gauche, dans l'ordre (la colonne
     *  `selection` du socle comprise le cas échéant). Elles restent
     *  visibles au défilement horizontal ; un id absent est ignoré. */
    gelColonnes?: string[];
    /** Coupe la pagination : toutes les lignes filtrées/triées sont rendues
     *  dans le conteneur défilant, le pied ne garde que le compteur de
     *  sélection. Pour les tables dont l'effectif tient sur un écran. */
    sansPagination?: boolean;
    /** Poignées de redimensionnement sur les en-têtes. Chaque colonne de
     *  données doit alors déclarer `size` : la table passe en gabarit fixe
     *  et une colonne sans largeur n'en recevrait aucune. */
    redimensionnement?: boolean;
    /** Sélection refusée ligne par ligne (avec `selection`) : la case d'une
     *  ligne refusée reste visible mais inerte — jamais retirée en silence,
     *  l'utilisateur doit voir qu'elle existe et comprendre qu'elle est
     *  fermée (règle d'ergonomie posée par JuryPeriode). */
    peutSelectionnerLigne?: (ligne: D) => boolean;
}

/** Libellé texte d'une colonne : l'en-tête s'il est une chaîne, sinon le
 *  `meta.libelle` déclaré, sinon l'identifiant. */
function libelleColonne<D>(colonne: Column<D>): string {
    const entete = colonne.columnDef.header;
    if (typeof entete === 'string') return entete;
    return colonne.columnDef.meta?.libelle ?? colonne.id;
}

/** `width` seulement si la colonne déclare une taille : le défaut TanStack
 *  (150) ne doit pas figer les colonnes qui n'ont rien demandé. Avec le
 *  redimensionnement, toutes les largeurs sont posées : elles vivent dans
 *  l'état de la table et suivent la poignée. Sur un en-tête groupé,
 *  `getSize` somme les feuilles. */
function largeurEntete<D>(entete: HeaderTanstack<D, unknown>, redimensionnement: boolean): React.CSSProperties | undefined {
    if (!redimensionnement && entete.column.columnDef.size === undefined) return undefined;
    return { width: entete.getSize() };
}

/** Position d'une colonne gelée : sticky, à l'offset cumulé des gelées qui
 *  la précèdent (calculé par TanStack). Le `z-index` et le fond opaque
 *  viennent des classes (`classesGel`). */
function stylesGel<D>(colonne: Column<D>): React.CSSProperties | undefined {
    if (colonne.getIsPinned() !== 'left') return undefined;
    return { position: 'sticky', left: colonne.getStart('left') };
}

/** Classes d'une cellule gelée. Le fond doit être opaque et porté par la
 *  cellule (le contenu défile dessous) : le survol et la sélection, posés en
 *  translucide sur la ligne, sont donc recomposés ici en couleurs pleines
 *  équivalentes, via le `group` de la ligne. La dernière gelée porte l'ombre
 *  de séparation. */
function classesGel<D>(colonne: Column<D>): string | undefined {
    if (colonne.getIsPinned() !== 'left') return undefined;
    return cn(
        'z-[1] bg-background',
        'group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]',
        'group-data-[state=selected]:bg-muted',
        colonne.getIsLastColumn('left') && 'shadow-[2px_0_4px_-2px_var(--border)]',
    );
}

/** Valeur du filtre d'une colonne — toujours une chaîne ici, les filtres
 *  naissent tous du champ texte ci-dessous. */
function valeurFiltre<D>(colonne: Column<D>): string {
    const brut = colonne.getFilterValue();
    return typeof brut === 'string' ? brut : '';
}

export function DataTable<D>({
    colonnes,
    donnees,
    enChargement = false,
    etat,
    getRowId,
    selection,
    actionsLigne,
    barreOutils,
    etatVide,
    classeLigne,
    gelColonnes,
    sansPagination = false,
    redimensionnement = false,
    peutSelectionnerLigne,
}: DataTableProps<D>) {
    // Hors React Compiler : `useReactTable` rend des fonctions que le
    // compilateur ne peut pas mémoïser sûrement — c'est la voie documentée
    // par TanStack Table, et ce composant mémoïse déjà ce qui compte.
    'use no memo';

    const { t } = useTranslation('crud');

    // Colonnes de présentation — sélection devant, actions derrière — greffées
    // ici pour que chaque écran n'ait à déclarer que ses colonnes de données.
    // `actionsLigne` figure dans les dépendances : l'appelant le mémoïse.
    const avecSelection = selection !== undefined;
    const colonnesCompletes = useMemo((): ColumnDef<D>[] => {
        const resultat: ColumnDef<D>[] = [];
        if (avecSelection) {
            resultat.push({
                id: 'selection',
                header: ({ table }) => (
                    <Checkbox
                        checked={table.getIsAllRowsSelected()}
                        indeterminate={table.getIsSomeRowsSelected()}
                        onCheckedChange={(coche) => { table.toggleAllRowsSelected(coche); }}
                        aria-label={t('table.toutSelectionner')}
                    />
                ),
                cell: ({ row }: { row: Row<D> }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        // Ligne refusée par `peutSelectionnerLigne` : case
                        // inerte, pas absente (voir le prop).
                        disabled={!row.getCanSelect()}
                        onCheckedChange={(coche) => { row.toggleSelected(coche); }}
                        aria-label={t('table.selectionnerLigne')}
                    />
                ),
                size: 36,
                enableSorting: false,
                enableHiding: false,
                enableColumnFilter: false,
                enableGlobalFilter: false,
            });
        }
        resultat.push(...colonnes);
        if (actionsLigne) {
            resultat.push({
                id: 'actions',
                header: t('table.colonneActions'),
                cell: ({ row }: { row: Row<D> }) => actionsLigne(row.original),
                size: 64,
                enableSorting: false,
                enableHiding: false,
                enableColumnFilter: false,
                enableGlobalFilter: false,
            });
        }
        return resultat;
    }, [colonnes, avecSelection, actionsLigne, t]);

    // La mise en garde de la règle vise les composants compilés qui
    // consommeraient ces fonctions non mémoïsables ; le `'use no memo'`
    // ci-dessus exclut justement ce composant de la compilation.
    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable<D>({
        columns: colonnesCompletes,
        data: donnees,
        getRowId,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        ...(sansPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
        // MRT cherchait en « fuzzy » ; le socle fait un contient-la-chaîne,
        // plus strict et plus prévisible (différence assumée au lot 7).
        globalFilterFn: 'includesString',
        // Le prédicat par ligne est respecté par TanStack jusque dans
        // « tout sélectionner » : seules les lignes acceptées basculent.
        enableRowSelection: selection === undefined
            ? false
            : peutSelectionnerLigne
                ? (ligne) => peutSelectionnerLigne(ligne.original)
                : true,
        enableColumnResizing: redimensionnement,
        columnResizeMode: 'onChange',
        state: {
            columnFilters: etat.columnFilters,
            globalFilter: etat.globalFilter,
            sorting: etat.sorting,
            pagination: etat.pagination,
            columnVisibility: etat.columnVisibility,
            rowSelection: selection?.rowSelection ?? {},
            // Le gel est déclaré par l'écran, pas manipulable ni persisté :
            // état contrôlé sans `onColumnPinningChange`.
            columnPinning: { left: gelColonnes ?? [] },
        },
        onColumnFiltersChange: etat.setColumnFilters,
        onGlobalFilterChange: etat.setGlobalFilter,
        onSortingChange: etat.setSorting,
        onPaginationChange: etat.setPagination,
        onColumnVisibilityChange: etat.setColumnVisibility,
        ...(selection ? { onRowSelectionChange: selection.onRowSelectionChange } : {}),
    });

    const lignesVisibles = useCallback(
        () => table.getPrePaginationRowModel().rows.map((ligne) => ligne.original),
        [table],
    );

    // Focus dans le champ de recherche à son ouverture par l'utilisateur —
    // et seulement là : un état restauré de session ne doit pas voler le
    // focus au chargement de la page.
    const refRecherche = useRef<HTMLInputElement>(null);
    const focusDemande = useRef(false);
    useEffect(() => {
        if (etat.showGlobalFilter && focusDemande.current) {
            refRecherche.current?.focus();
        }
        focusDemande.current = false;
    }, [etat.showGlobalFilter]);

    const lignes = table.getRowModel().rows;
    const nbColonnesVisibles = table.getVisibleLeafColumns().length;
    // La dernière rangée d'en-têtes : les colonnes feuilles — la seule à
    // porter les filtres (les rangées au-dessus sont des groupes).
    const groupesEntetes = table.getHeaderGroups();
    const entetesFeuilles = groupesEntetes[groupesEntetes.length - 1]?.headers ?? [];
    const { pageIndex, pageSize } = table.getState().pagination;
    const total = table.getFilteredRowModel().rows.length;
    const de = total === 0 ? 0 : pageIndex * pageSize + 1;
    const a = Math.min(total, (pageIndex + 1) * pageSize);
    const nbSelection = selection ? Object.keys(selection.rowSelection).length : 0;

    return (
        /* `text-foreground` explicite : le texte du body appartient à MUI
           (CssBaseline, couche `mui`) et ne suit pas toujours `.dark` — cette
           surface pose ses deux tokens elle-même pour rester cohérente seule. */
        <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-background text-foreground">
            {/* Barre d'outils : actions de l'écran à gauche, commandes de la
                table à droite — une seule famille de boutons désormais. */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 p-2">
                <div className="flex items-center gap-4">
                    {barreOutils?.({ lignesVisibles })}
                </div>
                <div className="flex items-center gap-1">
                    {etat.showGlobalFilter && (
                        <div className="relative mr-1">
                            <Input
                                ref={refRecherche}
                                value={etat.globalFilter}
                                onChange={(e) => { etat.setGlobalFilter(e.target.value); }}
                                placeholder={t('table.rechercher')}
                                aria-label={t('table.rechercher')}
                                className="h-8 w-48 pr-7"
                            />
                            {etat.globalFilter !== '' && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('table.effacerRecherche')}
                                    onClick={() => { etat.setGlobalFilter(''); }}
                                    className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2 text-muted-foreground"
                                >
                                    <X />
                                </Button>
                            )}
                        </div>
                    )}
                    <Tooltip>
                        <TooltipTrigger
                            render={(
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('table.afficherMasquerRecherche')}
                                    onClick={() => {
                                        focusDemande.current = !etat.showGlobalFilter;
                                        etat.setShowGlobalFilter(!etat.showGlobalFilter);
                                    }}
                                />
                            )}
                        >
                            <Search />
                        </TooltipTrigger>
                        <TooltipContent>{t('table.afficherMasquerRecherche')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger
                            render={(
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('table.afficherMasquerFiltres')}
                                    onClick={() => { etat.setShowColumnFilters(!etat.showColumnFilters); }}
                                />
                            )}
                        >
                            <Funnel />
                        </TooltipTrigger>
                        <TooltipContent>{t('table.afficherMasquerFiltres')}</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger
                                render={(
                                    <DropdownMenuTrigger
                                        render={(
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label={t('table.afficherMasquerColonnes')}
                                            />
                                        )}
                                    />
                                )}
                            >
                                <Columns3 />
                            </TooltipTrigger>
                            <TooltipContent>{t('table.afficherMasquerColonnes')}</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                            {table.getAllLeafColumns().filter((colonne) => colonne.getCanHide()).map((colonne) => (
                                <DropdownMenuCheckboxItem
                                    key={colonne.id}
                                    checked={colonne.getIsVisible()}
                                    onCheckedChange={(visible) => { colonne.toggleVisibility(visible); }}
                                    closeOnClick={false}
                                >
                                    {libelleColonne(colonne)}
                                </DropdownMenuCheckboxItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                closeOnClick={false}
                                onClick={() => { table.toggleAllColumnsVisible(true); }}
                            >
                                {t('table.toutAfficher')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <Table
                    // Gabarit fixe avec le redimensionnement : les largeurs
                    // viennent du `colgroup` (l'état de la table), la largeur
                    // minimale de leur somme — l'excédent du conteneur se
                    // répartit au prorata, le déficit fait défiler.
                    className={cn(redimensionnement && 'table-fixed')}
                    style={redimensionnement ? { minWidth: table.getTotalSize() } : undefined}
                >
                    {redimensionnement && (
                        <colgroup>
                            {table.getVisibleLeafColumns().map((colonne) => (
                                <col key={colonne.id} style={{ width: colonne.getSize() }} />
                            ))}
                        </colgroup>
                    )}
                    <TableHeader className="sticky top-0 z-10 bg-background">
                        {groupesEntetes.map((groupe) => (
                            <TableRow key={groupe.id} className="hover:bg-transparent">
                                {groupe.headers.map((entete) => {
                                    const sens = entete.column.getIsSorted();
                                    return (
                                        <TableHead
                                            key={entete.id}
                                            colSpan={entete.colSpan}
                                            style={{ ...largeurEntete(entete, redimensionnement), ...stylesGel(entete.column) }}
                                            className={cn(
                                                redimensionnement && 'relative',
                                                classesGel(entete.column),
                                                entete.column.columnDef.meta?.headerClassName,
                                            )}
                                            aria-sort={sens === 'asc' ? 'ascending' : sens === 'desc' ? 'descending' : undefined}
                                        >
                                            {entete.isPlaceholder ? null : entete.column.getCanSort() ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="-ml-2.5 gap-1 font-medium"
                                                    onClick={entete.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(entete.column.columnDef.header, entete.getContext())}
                                                    {sens === 'asc' ? <ArrowUp />
                                                        : sens === 'desc' ? <ArrowDown />
                                                            : <ChevronsUpDown className="size-3.5 opacity-40" />}
                                                </Button>
                                            ) : (
                                                flexRender(entete.column.columnDef.header, entete.getContext())
                                            )}
                                            {redimensionnement && !entete.isPlaceholder && entete.column.getCanResize() && (
                                                <div
                                                    onMouseDown={entete.getResizeHandler()}
                                                    onTouchStart={entete.getResizeHandler()}
                                                    onDoubleClick={() => { entete.column.resetSize(); }}
                                                    className={cn(
                                                        'absolute inset-y-1 right-0 w-1 cursor-col-resize touch-none rounded bg-border opacity-0 select-none hover:opacity-100',
                                                        entete.column.getIsResizing() && 'bg-primary opacity-100',
                                                    )}
                                                />
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                        {etat.showColumnFilters && (
                            <TableRow className="hover:bg-transparent">
                                {entetesFeuilles.map((entete) => (
                                    <TableHead
                                        key={`filtre-${entete.id}`}
                                        style={stylesGel(entete.column)}
                                        className={cn('pb-2', classesGel(entete.column))}
                                    >
                                        {entete.column.getCanFilter() && (
                                            <div className="relative">
                                                <Input
                                                    value={valeurFiltre(entete.column)}
                                                    onChange={(e) => { entete.column.setFilterValue(e.target.value); }}
                                                    placeholder={t('table.filtrerPar', { colonne: libelleColonne(entete.column) })}
                                                    aria-label={t('table.filtrerPar', { colonne: libelleColonne(entete.column) })}
                                                    className="h-7 pr-6 text-xs font-normal"
                                                />
                                                {valeurFiltre(entete.column) !== '' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={t('table.effacerFiltre')}
                                                        onClick={() => { entete.column.setFilterValue(''); }}
                                                        className="absolute top-1/2 right-0 size-6 -translate-y-1/2 text-muted-foreground"
                                                    >
                                                        <X className="size-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        )}
                    </TableHeader>
                    <TableBody>
                        {enChargement ? (
                            Array.from({ length: LIGNES_SQUELETTE }, (_, i) => (
                                <TableRow key={`squelette-${String(i)}`} className="hover:bg-transparent">
                                    {Array.from({ length: nbColonnesVisibles }, (__, j) => (
                                        <TableCell key={`squelette-${String(i)}-${String(j)}`}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : lignes.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={nbColonnesVisibles} className="p-0">
                                    {etatVide?.(table)}
                                </TableCell>
                            </TableRow>
                        ) : (
                            lignes.map((ligne) => (
                                <TableRow
                                    key={ligne.id}
                                    data-state={ligne.getIsSelected() ? 'selected' : undefined}
                                    // `group` : les cellules gelées recomposent
                                    // le survol/sélection de la ligne (opaques,
                                    // le translucide du <tr> passe dessous).
                                    className={cn('group', classeLigne?.(ligne.original))}
                                >
                                    {ligne.getVisibleCells().map((cellule) => (
                                        <TableCell
                                            key={cellule.id}
                                            style={stylesGel(cellule.column)}
                                            className={cn(classesGel(cellule.column), cellule.column.columnDef.meta?.className)}
                                        >
                                            {flexRender(cellule.column.columnDef.cell, cellule.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pied : compteur de sélection à gauche, pagination à droite.
                Sans pagination, il ne reste que le compteur — et rien du
                tout quand la table n'a pas de sélection. */}
            {(!sansPagination || selection !== undefined) && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-2 text-sm text-muted-foreground">
                <div>
                    {nbSelection > 0 && t('table.lignesSelectionnees', { nombre: nbSelection, total })}
                </div>
                {!sansPagination && (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="whitespace-nowrap">{t('table.lignesParPage')}</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 px-2 font-normal"
                                        aria-label={t('table.lignesParPage')}
                                    />
                                )}
                            >
                                {pageSize}
                                <ChevronDown className="size-3.5 opacity-60" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {TAILLES_PAGE.map((taille) => (
                                    <DropdownMenuItem
                                        key={taille}
                                        onClick={() => { table.setPageSize(taille); }}
                                        className={cn(taille === pageSize && 'font-medium')}
                                    >
                                        {taille}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <span className="whitespace-nowrap tabular-nums">
                        {t('table.plage', { de, a, total })}
                    </span>
                    <div className="flex items-center">
                        <Button
                            type="button" variant="ghost" size="icon"
                            aria-label={t('table.premierePage')}
                            onClick={() => { table.setPageIndex(0); }}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronsLeft />
                        </Button>
                        <Button
                            type="button" variant="ghost" size="icon"
                            aria-label={t('table.pagePrecedente')}
                            onClick={() => { table.previousPage(); }}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronLeft />
                        </Button>
                        <Button
                            type="button" variant="ghost" size="icon"
                            aria-label={t('table.pageSuivante')}
                            onClick={() => { table.nextPage(); }}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronRight />
                        </Button>
                        <Button
                            type="button" variant="ghost" size="icon"
                            aria-label={t('table.dernierePage')}
                            onClick={() => { table.setPageIndex(table.getPageCount() - 1); }}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronsRight />
                        </Button>
                    </div>
                </div>
                )}
            </div>
            )}
        </div>
    );
}
