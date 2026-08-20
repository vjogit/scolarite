import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import type { Datasource } from './def';
import type { FieldValues } from 'react-hook-form';
import { MaterialReactTable, useMaterialReactTable, type MRT_Row, type MRT_TableInstance } from 'material-react-table';
import { alpha, Alert, Box, darken, IconButton, Tooltip, Typography } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { usePersistentTableState } from './usePersistentTableState';
import { parentListPath } from './useRootPath';
import { useCrudContext } from './CrudContext';
import { useDroits } from '../context/droits';
import { useState, useEffect, useCallback } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNotifications } from '@toolpad/core/useNotifications';
import { blockingMessageFor, messageForError } from '../errorMessages';
import { notifyError, notifySuccess } from '../notify';
import { messageSuppression } from './entityMessages';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';



interface Props<D extends FieldValues> {
  datasource: Datasource<D>
}

/** Encombrement d'une `IconButton` MUI de densité par défaut, en pixels. */
const BOUTON_RETOUR_PX = 40;

/** Durée de la mise en évidence de la ligne revenant d'un enregistrement. */
const HIGHLIGHT_MS = 2000;

/** État de navigation posé par le formulaire au retour sur la liste. */
function highlightIdFromState(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>).highlightId;
  return typeof value === 'number' ? value : null;
}

/** Identifiants à supprimer, accompagnés des noms à annoncer au succès. */
interface DeleteVariables {
  ids: number[];
  noms: string[];
}


export function CrudList<D extends FieldValues>({ datasource }: Props<D>) {
  const { rootPath } = useCrudContext();
  // Source unique de vérité : le bouton retour n'existe que si un parent existe.
  const parentPath = parentListPath(rootPath);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const notifications = useNotifications();
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

  // DELETE : Mutation pour supprimer.
  // Les noms transitent par les variables de mutation : la modale se ferme et
  // vide `selectedRows` avant la résolution, ils ne seraient plus lisibles dans
  // `onSuccess`.
  const mutation = useMutation({
    mutationFn: ({ ids }: DeleteVariables) => datasource.delete(ids),
    onSuccess: (_result, { noms }) => {
      // Invalide le cache et force un rafraîchissement automatique de la liste
      queryClient.invalidateQueries({ queryKey: datasource.queryKey });
      notifySuccess(notifications, messageSuppression(datasource, noms));
    },
    onError: (error) => {
      // Le serveur peut refuser la suppression (409 BUSINESS_CONFLICT) même si
      // la modale l'a autorisée : le message doit remonter à l'utilisateur.
      notifyError(notifications, blockingMessageFor(error) ?? messageForError(error));
    },
  });


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

  const renderRowActions = useCallback(({ row, table }: { row: MRT_Row<D>, table: MRT_TableInstance<D> }) => {
    if (!datasource.isAction) return null

    const defaultActions = (
      <Box sx={{ display: 'flex', gap: '1rem' }}>
        {/* « Voir » est toujours présent : consulter le détail d'une ligne ne
            dépend d'aucun droit d'écriture. */}
        <Tooltip title="Voir">
          <span>
            <IconButton onClick={() => navigate(`${rootPath}/${datasource.getId(row.original)}`)}>
              <VisibilityIcon />
            </IconButton>
          </span>
        </Tooltip>

        {ecritureAutorisee && (
          <Tooltip title="Éditer">
            <span>
              <IconButton onClick={() => navigate(`${rootPath}/${datasource.getId(row.original)}/edit`)}>
                <EditIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box >
    );

    // Si la datasource fournit une fonction personnalisée, on l'utilise en lui passant les actions par défaut
    if (datasource.renderRowActions) {
      return datasource.renderRowActions({ row, table, defaultActions, peutEcrire: ecritureAutorisee });
    }

    return defaultActions;
  }, [datasource, ecritureAutorisee, navigate, rootPath]);

  const renderTopToolbarCustomActions = useCallback(({ table }: { table: MRT_TableInstance<D> }) => {
    if (!datasource.isTopToolbar) return null

    const defaultActions = (
      <Box sx={{ display: 'flex', gap: '1rem' }}>
        {datasource.isAction && ecritureAutorisee && (
          <>
            <Tooltip title="Ajouter">
              <span>
                <IconButton onClick={() => navigate(`${rootPath}/new`)}>
                  <AddBoxIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Supprimer">
              <span>
                <IconButton
                  color="error"
                  onClick={() => handleOpenModal(table)}
                  disabled={table.getSelectedRowModel().flatRows.length === 0}>
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      </Box>
    );

    if (datasource.renderTopToolbarCustomActions) {
      return datasource.renderTopToolbarCustomActions({ table, defaultActions, peutEcrire: ecritureAutorisee });
    }
    return defaultActions;
  }, [ecritureAutorisee, navigate, datasource, handleOpenModal, rootPath]);

  const table = useMaterialReactTable({
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
    data: data ? data : [], //data must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
    mrtTheme: (theme) => ({
      baseBackgroundColor: theme.palette.mode === 'dark' ?
        darken(theme.palette.background.default, 0.05) : theme.palette.background.default,
    }),
    renderTopToolbarCustomActions,
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

  if (isError) return <Alert severity="error">Erreur lors du chargement</Alert>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1, flexShrink: 0 }}>
        {parentPath ? (
          <Tooltip title="Retour">
            <IconButton aria-label="Retour" onClick={() => navigate(parentPath)}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
        ) : (
          // Sans parent, la place du bouton reste réservée : le titre garde la
          // même abscisse d'un écran à l'autre. `BOUTON_RETOUR_PX` est la taille
          // d'une `IconButton` de densité par défaut (icône 24 + 2 × 8 de marge).
          <Box aria-hidden sx={{ width: BOUTON_RETOUR_PX, flexShrink: 0 }} />
        )}
        <Typography variant="h6" sx={{ flex: 1 }}>{datasource.title}</Typography>

      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <MaterialReactTable table={table} />
      </Box>
      {/* Modale de confirmation : nomme les objets et détaille la cascade */}
      <DeleteConfirmDialog
        open={open}
        datasource={datasource}
        selectedRows={selectedRows}
        onClose={handleClose}
        onConfirm={() => handleConfirmDelete(table)}
      />
    </Box>
  )

}