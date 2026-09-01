import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { DatasourceListe } from './def';
import type { FieldValues } from 'react-hook-form';
import { MaterialReactTable, useMaterialReactTable, type MRT_Row, type MRT_TableInstance } from 'material-react-table';
import { MRT_Localization_FR } from 'material-react-table/locales/fr';
import { MRT_Localization_EN } from 'material-react-table/locales/en';
import { alpha, darken } from '@mui/material';
import { Alert, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { ArrowLeft, CircleAlert, SquarePlus, Trash2 } from 'lucide-react';
import { usePersistentTableState } from './usePersistentTableState';
import { parentListPath } from './useRootPath';
import { useCrudContext } from './useCrudContext';
import { useDroits } from '../context/droits';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { libelleCreation, messageListeVide } from './entityMessages';
import { useSuppressionCrud } from './suppression';
import { EtatVideTable } from './EtatVideTable';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { actionsDeLaLigne, cibleAction, estNavigation, type ActionLigne } from './actions';
import { MenuActionsLigne } from './MenuActionsLigne';



interface Props<D extends FieldValues> {
  /**
   * `DatasourceListe` et non `Datasource` : la liste ne lit ni le schéma, ni la
   * valeur vierge, ni le rendu du formulaire. L'exiger fermait cet écran aux
   * axes de consultation, qui n'ont pas de formulaire à décrire.
   */
  datasource: DatasourceListe<D>
}

/** Durée de la mise en évidence de la ligne revenant d'un enregistrement. */
const HIGHLIGHT_MS = 2000;

/** État de navigation posé par le formulaire au retour sur la liste. */
function highlightIdFromState(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>).highlightId;
  return typeof value === 'number' ? value : null;
}


export function CrudList<D extends FieldValues>({ datasource }: Props<D>) {
  const { t, i18n } = useTranslation('crud');
  const { rootPath } = useCrudContext();
  // Source unique de vérité : le bouton retour n'existe que si un parent existe.
  const parentPath = parentListPath(rootPath);
  const navigate = useNavigate();
  const location = useLocation();
  // Ligne à mettre en évidence au retour d'un enregistrement. Lue au montage :
  // liste et formulaire sont des routes distinctes, la liste est donc remontée
  // à chaque retour. Éviter un setState dans l'effet évite un rendu en cascade.
  const [highlightId, setHighlightId] = useState<number | null>(
    () => highlightIdFromState(location.state),
  );
  // État pour gérer la visibilité de la modale et les lignes sélectionnées
  const [open, setOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<MRT_Row<D>[]>([]);
  // Les actions d'écriture découlent des rôles réels, pas d'un mode : un
  // utilisateur sans le rôle d'écriture de l'écran ne voit aucune d'entre elles.
  const { peutEcrire } = useDroits();
  const ecritureAutorisee = peutEcrire(datasource);
  // 2. Dans le composant, remplacer les 4 useState + 4 useEffect par :
  const {
    columnFilters, setColumnFilters,
    globalFilter, setGlobalFilter,
    sorting, setSorting,
    pagination, setPagination,
    showGlobalFilter, setShowGlobalFilter,
    showColumnFilters, setShowColumnFilters,
    columnVisibility, setColumnVisibility,
    density, setDensity,
    isFullScreen, setIsFullScreen,
  } = usePersistentTableState(datasource.queryKey);

  // READ : Récupération des données
  const { data, isLoading, isError } = useQuery({
    queryKey: datasource.queryKey,
    queryFn: datasource.fetchAll
  });

  // DELETE : le geste commun, partagé avec l'arbre de la structure.
  const mutation = useSuppressionCrud(datasource);

  // La modale ne connaît plus les lignes de la table, seulement les objets.
  const objets = useMemo(() => selectedRows.map(row => row.original), [selectedRows]);


  // Ferme la modale
  const handleClose = () => {
    setOpen(false);
    setSelectedRows([]);
  };

  // Exécute la suppression réelle
  const handleConfirmDelete = (table: MRT_TableInstance<D>) => {
    const ids = selectedRows.map(row => datasource.getId(row.original));
    const noms = selectedRows.map(row => datasource.getName(row.original));

    // Un seul appel API, un seul onSuccess, un seul fetchAll
    mutation.mutate({ ids, noms });

    table.resetRowSelection();
    handleClose();
  };

  // Ouvre la modale et mémorise les lignes à supprimer
  const handleOpenModal = useCallback((table: MRT_TableInstance<D>) => {
    const rows = table.getSelectedRowModel().flatRows;
    if (rows.length > 0) {
      setSelectedRows(rows);
      setOpen(true);
    }
  }, []);

  // Les actions déclarées par l'écran, exécutées ici : navigation construite
  // depuis `rootPath` et la ligne, ou rappel de l'écran. Aucun écran ne
  // manipule d'URL ni ne monte de composant à hooks dans sa colonne.
  const executer = useCallback((action: ActionLigne<D>, ligne: D) => {
    if (estNavigation(action)) {
      void navigate(cibleAction(action, rootPath, datasource.getId(ligne)));
      return;
    }
    action.onSelect(ligne);
  }, [datasource, navigate, rootPath]);

  const renderRowActions = useCallback(({ row }: { row: MRT_Row<D> }) => {
    if (!datasource.isAction) return null;

    const actions = actionsDeLaLigne(
      datasource.actionsLigne ?? [],
      row.original,
      ecritureAutorisee,
      t,
    );

    return (
      <MenuActionsLigne
        actions={actions}
        nomLigne={datasource.getName(row.original)}
        onChoisir={(action) => { executer(action, row.original); }}
      />
    );
  }, [datasource, ecritureAutorisee, executer, t]);

  const renderTopToolbarCustomActions = useCallback(({ table }: { table: MRT_TableInstance<D> }) => {
    if (!datasource.isTopToolbar) return null

    // `aria-label` explicite sur le bouton, et non sur le `Tooltip` : le
    // déclencheur de l'infobulle est un `<span>` — le relais qui la fait
    // survivre sur un bouton désactivé, insensible au survol. Sans cet
    // attribut, les deux commandes présentes sur toutes les listes n'ont
    // aucun nom accessible.
    const defaultActions = (
      <div className="flex gap-4">
        {datasource.isAction && ecritureAutorisee && (
          <>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={libelleCreation(datasource, t)}
                  onClick={() => { void navigate(`${rootPath}/new`); }}>
                  <SquarePlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{libelleCreation(datasource, t)}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={t('actions.supprimerSelection')}
                  onClick={() => { handleOpenModal(table); }}
                  disabled={table.getSelectedRowModel().flatRows.length === 0}>
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('actions.supprimerSelection')}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    );

    if (datasource.renderTopToolbarCustomActions) {
      return datasource.renderTopToolbarCustomActions({ table, defaultActions, peutEcrire: ecritureAutorisee });
    }
    return defaultActions;
  }, [ecritureAutorisee, navigate, datasource, handleOpenModal, rootPath, t]);

  // L'invite de création reprend mot pour mot les conditions du bouton
  // « Ajouter » de la barre — `ecritureAutorisee` couvre déjà `isReadOnly` —
  // et vise la même route. Un compte en consultation voit le message seul.
  const renderEmptyRowsFallback = useCallback(({ table }: { table: MRT_TableInstance<D> }) => (
    <EtatVideTable
      table={table}
      message={messageListeVide(datasource, t)}
      action={datasource.isAction && ecritureAutorisee
        ? { libelle: libelleCreation(datasource, t), onClick: () => { void navigate(`${rootPath}/new`); } }
        : undefined}
    />
  ), [datasource, ecritureAutorisee, navigate, rootPath, t]);

  const table = useMaterialReactTable({
    // Les commandes internes de la table — recherche, filtres, colonnes,
    // densité, plein écran, pagination — tirent d'ici leurs infobulles et
    // leurs noms accessibles, anglais par défaut.
    localization: i18n.language === 'en' ? MRT_Localization_EN : MRT_Localization_FR,
    initialState: {
      isLoading,
      density: 'compact', // 'compact' | 'comfortable' | 'spacious'
    },
    state: {
      isLoading,
      columnFilters,
      globalFilter,
      sorting,
      pagination,
      showGlobalFilter,
      showColumnFilters,
      columnVisibility,
      density,
      isFullScreen,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onShowGlobalFilterChange: setShowGlobalFilter,
    onShowColumnFiltersChange: setShowColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onDensityChange: setDensity,
    onIsFullScreenChange: setIsFullScreen,
    columns: datasource.columns,
    data: data ?? [], //data must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
    mrtTheme: (theme) => ({
      baseBackgroundColor: theme.palette.mode === 'dark' ?
        darken(theme.palette.background.default, 0.05) : theme.palette.background.default,
    }),
    renderTopToolbarCustomActions,
    renderEmptyRowsFallback,
    enableRowActions: datasource.isAction,
    positionActionsColumn: 'last',
    renderRowActions,
    // La sélection de lignes ne sert qu'à la suppression : elle suit le droit
    // d'écriture, pas un mode.
    enableRowSelection: ecritureAutorisee,
    enableStickyHeader: true,
    enableStickyFooter: true,
    muiTablePaperProps: {
      sx: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      },
    },
    muiTableContainerProps: {
      sx: {
        flex: 1,
        overflow: 'auto',
      },
    },
    // La ligne peut être absente de la vue (pagination, filtre, tri) : on ne
    // touche alors à rien. Déplacer la table à l'insu de l'utilisateur serait
    // pire que l'absence de mise en évidence, l'état de table étant persisté.
    muiTableBodyRowProps: ({ row }) => {
      if (highlightId === null || datasource.getId(row.original) !== highlightId) return {};
      return {
        sx: (theme) => ({
          backgroundColor: alpha(
            theme.palette.primary.main,
            theme.palette.mode === 'dark' ? 0.24 : 0.14,
          ),
          transition: theme.transitions.create('background-color', {
            duration: theme.transitions.duration.standard,
          }),
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }),
      };
    },
  });

  // L'identifiant est consommé une seule fois : on l'efface de l'historique
  // aussitôt lu, pour qu'un rechargement ou un retour navigateur ne rejoue pas
  // la mise en évidence.
  useEffect(() => {
    if (highlightIdFromState(location.state) === null) return;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  // Minuterie séparée : la remettre dans l'effet ci-dessus la ferait annuler
  // par le `navigate` de consommation, qui change immédiatement `location`.
  useEffect(() => {
    if (highlightId === null) return;
    const timer = setTimeout(() => { setHighlightId(null); }, HIGHLIGHT_MS);
    return () => { clearTimeout(timer); };
  }, [highlightId]);

  if (isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{t('list.chargementEchec')}</AlertTitle>
      </Alert>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        {parentPath ? (
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('actions.retour')}
                  onClick={() => { void navigate(parentPath); }}
                />
              )}
            >
              <ArrowLeft />
            </TooltipTrigger>
            <TooltipContent>{t('actions.retour')}</TooltipContent>
          </Tooltip>
        ) : (
          // Sans parent, la place du bouton reste réservée : le titre garde la
          // même abscisse d'un écran à l'autre. `w-8` est la taille d'un
          // bouton d'icône shadcn (`size-8`).
          <div aria-hidden className="w-8 shrink-0" />
        )}
        <h2 className="flex-1 text-xl font-medium">{datasource.title}</h2>

      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MaterialReactTable table={table} />
      </div>
      {/* Modale de confirmation : nomme les objets et détaille la cascade */}
      <DeleteConfirmDialog
        open={open}
        entite={datasource}
        objets={objets}
        onClose={handleClose}
        onConfirm={() => { handleConfirmDelete(table); }}
      />
    </div>
  )

}