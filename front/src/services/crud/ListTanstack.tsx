/**
 * La liste du nouveau socle (lot 7) : l'orchestration de `ListMrt` — requête,
 * suppression, droits, mise en évidence — branchée sur `DataTable` (TanStack
 * Table rendu en shadcn) au lieu de MaterialReactTable.
 *
 * Servie par le commutateur `List.tsx` aux écrans déclarés en `colonnes`.
 * La duplication d'orchestration avec `ListMrt` est temporaire et assumée :
 * elle meurt avec lui, au dernier écran migré.
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { DatasourceListe } from './def';
import type { FieldValues } from 'react-hook-form';
import type { RowSelectionState, Table as TableTanstack } from '@tanstack/react-table';
import { Alert, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { ArrowLeft, CircleAlert, SquarePlus, Trash2 } from 'lucide-react';
import { useEtatTablePersistant } from './usePersistentTableState';
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
import { DataTable } from './DataTable';

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

/**
 * Classes de la ligne mise en évidence — la transposition en tokens de
 * l'ancien `alpha(palette.primary.main, 0.14 | 0.24)`. Le fondu de sortie est
 * porté par le `transition-colors` de `TableRow`.
 */
const CLASSES_LIGNE_EN_EVIDENCE = 'bg-primary/15 dark:bg-primary/25 motion-reduce:transition-none';

/** État de navigation posé par le formulaire au retour sur la liste. */
function highlightIdFromState(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>).highlightId;
  return typeof value === 'number' ? value : null;
}

export function CrudListTanstack<D extends FieldValues>({ datasource }: Props<D>) {
  const { t } = useTranslation('crud');
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
  const [open, setOpen] = useState(false);
  // La sélection vit ici, pas dans la table : indexée par l'identifiant
  // d'entité (`getRowId`), elle survit au tri et au filtre, et la suppression
  // la remet à zéro sans passer par une instance de moteur.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Les actions d'écriture découlent des rôles réels, pas d'un mode : un
  // utilisateur sans le rôle d'écriture de l'écran ne voit aucune d'entre elles.
  const { peutEcrire } = useDroits();
  const ecritureAutorisee = peutEcrire(datasource);

  const etat = useEtatTablePersistant(datasource.queryKey);

  // READ : Récupération des données
  const { data, isLoading, isError } = useQuery({
    queryKey: datasource.queryKey,
    queryFn: datasource.fetchAll
  });

  // DELETE : le geste commun, partagé avec l'arbre de la structure.
  const mutation = useSuppressionCrud(datasource);

  // La modale ne connaît que les objets : la sélection est résolue ici.
  const objets = useMemo(
    () => (data ?? []).filter((ligne) => rowSelection[String(datasource.getId(ligne))] === true),
    [data, rowSelection, datasource],
  );

  // Ferme la modale ; « Annuler » conserve la sélection (parité MRT).
  const handleClose = () => { setOpen(false); };

  // Exécute la suppression réelle
  const handleConfirmDelete = () => {
    const ids = objets.map((objet) => datasource.getId(objet));
    const noms = objets.map((objet) => datasource.getName(objet));

    // Un seul appel API, un seul onSuccess, un seul fetchAll
    mutation.mutate({ ids, noms });

    setRowSelection({});
    handleClose();
  };

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

  const actionsLigne = useCallback((ligne: D) => {
    const actions = actionsDeLaLigne(
      datasource.actionsLigne ?? [],
      ligne,
      ecritureAutorisee,
      t,
    );

    return (
      <MenuActionsLigne
        actions={actions}
        nomLigne={datasource.getName(ligne)}
        onChoisir={(action) => { executer(action, ligne); }}
      />
    );
  }, [datasource, ecritureAutorisee, executer, t]);

  const barreOutils = useCallback(({ lignesVisibles }: { lignesVisibles: () => D[] }) => {
    if (!datasource.isTopToolbar) return null;

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
                  onClick={() => { if (objets.length > 0) setOpen(true); }}
                  disabled={objets.length === 0}>
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('actions.supprimerSelection')}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    );

    if (datasource.actionsBarreOutils) {
      return datasource.actionsBarreOutils({ defaultActions, peutEcrire: ecritureAutorisee, lignesVisibles });
    }
    return defaultActions;
  }, [datasource, ecritureAutorisee, navigate, objets.length, rootPath, t]);

  // L'invite de création reprend mot pour mot les conditions du bouton
  // « Ajouter » de la barre — `ecritureAutorisee` couvre déjà `isReadOnly` —
  // et vise la même route. Un compte en consultation voit le message seul.
  const etatVide = useCallback((table: TableTanstack<D>) => (
    <EtatVideTable
      table={table}
      message={messageListeVide(datasource, t)}
      action={datasource.isAction && ecritureAutorisee
        ? { libelle: libelleCreation(datasource, t), onClick: () => { void navigate(`${rootPath}/new`); } }
        : undefined}
    />
  ), [datasource, ecritureAutorisee, navigate, rootPath, t]);

  // La ligne peut être absente de la vue (pagination, filtre, tri) : on ne
  // touche alors à rien. Déplacer la table à l'insu de l'utilisateur serait
  // pire que l'absence de mise en évidence, l'état de table étant persisté.
  const classeLigne = useCallback((ligne: D) => (
    highlightId !== null && datasource.getId(ligne) === highlightId
      ? CLASSES_LIGNE_EN_EVIDENCE
      : undefined
  ), [datasource, highlightId]);

  const getRowId = useCallback((ligne: D) => String(datasource.getId(ligne)), [datasource]);

  // La sélection de lignes ne sert qu'à la suppression : elle suit le droit
  // d'écriture, pas un mode.
  const selection = useMemo(
    () => ecritureAutorisee ? { rowSelection, onRowSelectionChange: setRowSelection } : undefined,
    [ecritureAutorisee, rowSelection],
  );

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
        <DataTable<D>
          colonnes={datasource.colonnes ?? []}
          donnees={data ?? []}
          enChargement={isLoading}
          etat={etat}
          getRowId={getRowId}
          selection={selection}
          actionsLigne={datasource.isAction ? actionsLigne : undefined}
          barreOutils={barreOutils}
          etatVide={etatVide}
          classeLigne={classeLigne}
        />
      </div>
      {/* Modale de confirmation : nomme les objets et détaille la cascade */}
      <DeleteConfirmDialog
        open={open}
        entite={datasource}
        objets={objets}
        onClose={handleClose}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
