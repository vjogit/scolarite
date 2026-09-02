import { useState, useEffect } from 'react';
import type { QueryKey } from '@tanstack/react-query';
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
const COLONNES_TECHNIQUES: VisibilityState = { id: false, version: false };

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

/* ------------------------------------------------------------------------- *
 * L'état persistant du socle (lot 7) — TanStack Table.
 *
 * Sept états persistés, contre neuf du temps de MRT (déposé au lot 11) : la
 * densité et le plein écran étaient des fonctionnalités de MRT, abandonnées
 * avec lui (décision du lot 7 — le rendu unique est calé sur l'ancien défaut
 * « compact », et le plein écran n'était déjà pas restauré).
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
