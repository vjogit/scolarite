import { useState, useEffect } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import type {
  MRT_ColumnFiltersState,
  MRT_SortingState,
  MRT_PaginationState,
  MRT_VisibilityState,
  MRT_DensityState,
} from 'material-react-table';
import type {
  ColumnFiltersState,
  SortingState,
  PaginationState,
  VisibilityState,
} from '@tanstack/react-table';

/**
 * Colonnes techniques, masquées à l'ouverture de toutes les listes.
 *
 * `id` et `version` existent pour le serveur — clé primaire et verrou
 * optimiste — et n'apprennent rien à qui lit une liste ; elles occupaient
 * jusqu'ici les deux premières colonnes de chaque écran. Elles restent
 * disponibles dans le menu « colonnes » de la barre d'outils, et le choix de
 * les réafficher se persiste comme n'importe quel autre.
 */
const COLONNES_TECHNIQUES: MRT_VisibilityState = { id: false, version: false };

/**
 * Une valeur relue de `sessionStorage`, ou le repli si elle manque ou ne se
 * relit pas. `JSON.parse` rend `any` : la conversion vers le type attendu est
 * donc une affirmation, faite ici une fois plutôt qu'à chaque état.
 *
 * Le `catch` n'est pas décoratif : une entrée écrite par une version
 * précédente, ou tronquée, ferait échouer le rendu initial de la table.
 */
function relire<T>(cle: string, repli: T): T {
    const brut = sessionStorage.getItem(cle);
    if (brut === null) return repli;
    try {
        return JSON.parse(brut) as T;
    } catch {
        return repli;
    }
}

export function usePersistentTableState(queryKey: QueryKey) {
  const key = JSON.stringify(queryKey);
  const filtersKey         = `${key}_col_filters`;
  const globalFilterKey    = `${key}_global_filter`;
  const sortingKey         = `${key}_sorting`;
  const paginationKey      = `${key}_pagination`;
  const showSearchKey      = `${key}_show_search`;
  const showFiltersKey     = `${key}_show_filters`;
  const columnVisKey       = `${key}_col_visibility`;
  const densityKey         = `${key}_density`;

  const [columnFilters, setColumnFilters] = useState<MRT_ColumnFiltersState>(() => {
    return relire(filtersKey, []);
  });

  const [globalFilter, setGlobalFilter] = useState<string>(() => {
    return sessionStorage.getItem(globalFilterKey) ?? '';
  });

  const [sorting, setSorting] = useState<MRT_SortingState>(() => {
    return relire(sortingKey, []);
  });

  const [pagination, setPagination] = useState<MRT_PaginationState>(() => {
    return relire(paginationKey, { pageIndex: 0, pageSize: 10 });
  });

  const [showGlobalFilter, setShowGlobalFilter] = useState<boolean>(() => {
    return sessionStorage.getItem(showSearchKey) === 'true';
  });

  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(() => {
    return sessionStorage.getItem(showFiltersKey) === 'true';
  });

  const [columnVisibility, setColumnVisibility] = useState<MRT_VisibilityState>(() => {
    const saved = sessionStorage.getItem(columnVisKey);
    if (!saved) return COLONNES_TECHNIQUES;
    // Le défaut ne vaut que pour les colonnes dont l'utilisateur n'a rien dit :
    // un « id » réaffiché dans cette session le reste.
    return { ...COLONNES_TECHNIQUES, ...(JSON.parse(saved) as MRT_VisibilityState) };
  });

  const [density, setDensity] = useState<MRT_DensityState>(() => {
    // L'assertion doit venir après le repli : appliquée à `getItem`, elle
    // effaçait le `null` et faisait passer le `??` pour inutile.
    const memorisee = sessionStorage.getItem(densityKey);
    return (memorisee ?? 'compact') as MRT_DensityState;
  });

  const [isFullScreen, setIsFullScreen] = useState<boolean>(() => {
    // On ne restaure pas le plein écran : une page rechargée en fullscreen est déroutant
    return false;
  });

  // La clé figure dans les dépendances : elle ne change pas tant que la liste
  // vit, puisque `Crud` remonte celle-ci quand on passe à un autre parent.
  useEffect(() => { sessionStorage.setItem(filtersKey,      JSON.stringify(columnFilters));   }, [columnFilters, filtersKey]);
  useEffect(() => { sessionStorage.setItem(globalFilterKey, globalFilter);                    }, [globalFilter, globalFilterKey]);
  useEffect(() => { sessionStorage.setItem(sortingKey,      JSON.stringify(sorting));         }, [sorting, sortingKey]);
  useEffect(() => { sessionStorage.setItem(paginationKey,   JSON.stringify(pagination));      }, [pagination, paginationKey]);
  useEffect(() => { sessionStorage.setItem(showSearchKey,   String(showGlobalFilter));        }, [showGlobalFilter, showSearchKey]);
  useEffect(() => { sessionStorage.setItem(showFiltersKey,  String(showColumnFilters));       }, [showColumnFilters, showFiltersKey]);
  useEffect(() => { sessionStorage.setItem(columnVisKey,    JSON.stringify(columnVisibility));}, [columnVisibility, columnVisKey]);
  useEffect(() => { sessionStorage.setItem(densityKey,      density);                         }, [density, densityKey]);
  // isFullScreen volontairement non persisté

  return {
    columnFilters,      setColumnFilters,
    globalFilter,       setGlobalFilter,
    sorting,            setSorting,
    pagination,         setPagination,
    showGlobalFilter,   setShowGlobalFilter,
    showColumnFilters,  setShowColumnFilters,
    columnVisibility,   setColumnVisibility,
    density,            setDensity,
    isFullScreen,       setIsFullScreen,
  };
}

/* ------------------------------------------------------------------------- *
 * Nouveau socle (lot 7) — TanStack Table sans MRT.
 *
 * Sept états persistés, contre neuf avant : la densité et le plein écran
 * étaient des fonctionnalités de MRT, abandonnées avec lui (décision du
 * lot 7 — le rendu unique est calé sur l'ancien défaut « compact », et le
 * plein écran n'était déjà pas restauré).
 *
 * Une seule clé par table, versionnée, portant un objet unique — contre huit
 * clés par table avant. Les anciennes entrées restent orphelines dans le
 * `sessionStorage` : jamais relues, aucune migration — l'état meurt avec
 * l'onglet, un utilisateur à session ouverte perd une fois ses filtres.
 * ------------------------------------------------------------------------- */

/** Forme mémorisée. Toute rupture de forme incrémente la version de la clé. */
interface EtatTableMemorise {
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  sorting: SortingState;
  pagination: PaginationState;
  columnVisibility: VisibilityState;
  showGlobalFilter: boolean;
  showColumnFilters: boolean;
}

const VERSION_ETAT_TABLE = 'v1';

export type EtatTablePersistant = ReturnType<typeof useEtatTablePersistant>;

/**
 * @param defauts État de départ d'un écran quand la session n'a rien mémorisé
 * (un tri initial, par exemple) — jamais prioritaire sur ce que l'utilisateur
 * a fait : une valeur mémorisée l'emporte toujours. Lu au montage seulement.
 */
export function useEtatTablePersistant(queryKey: QueryKey, defauts?: Partial<EtatTableMemorise>) {
  const cle = `table:${VERSION_ETAT_TABLE}:${JSON.stringify(queryKey)}`;

  // Relu une seule fois, au montage : la clé ne change pas tant que la liste
  // vit (`Crud` remonte celle-ci quand on passe à un autre parent).
  const [initial] = useState(() => relire<Partial<EtatTableMemorise>>(cle, {}));

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initial.columnFilters ?? defauts?.columnFilters ?? []);
  const [globalFilter, setGlobalFilter] = useState<string>(initial.globalFilter ?? defauts?.globalFilter ?? '');
  const [sorting, setSorting] = useState<SortingState>(initial.sorting ?? defauts?.sorting ?? []);
  const [pagination, setPagination] = useState<PaginationState>(
    initial.pagination ?? defauts?.pagination ?? { pageIndex: 0, pageSize: 10 },
  );
  const [showGlobalFilter, setShowGlobalFilter] = useState<boolean>(initial.showGlobalFilter ?? defauts?.showGlobalFilter ?? false);
  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(initial.showColumnFilters ?? defauts?.showColumnFilters ?? false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    // Le défaut ne vaut que pour les colonnes dont l'utilisateur n'a rien
    // dit : un « id » réaffiché dans cette session le reste.
    { ...COLONNES_TECHNIQUES, ...(defauts?.columnVisibility ?? {}), ...(initial.columnVisibility ?? {}) },
  );

  useEffect(() => {
    const etat: EtatTableMemorise = {
      columnFilters, globalFilter, sorting, pagination,
      columnVisibility, showGlobalFilter, showColumnFilters,
    };
    sessionStorage.setItem(cle, JSON.stringify(etat));
  }, [cle, columnFilters, globalFilter, sorting, pagination, columnVisibility, showGlobalFilter, showColumnFilters]);

  return {
    columnFilters,      setColumnFilters,
    globalFilter,       setGlobalFilter,
    sorting,            setSorting,
    pagination,         setPagination,
    showGlobalFilter,   setShowGlobalFilter,
    showColumnFilters,  setShowColumnFilters,
    columnVisibility,   setColumnVisibility,
  };
}