/**
 * L'arbre de la structure : la hiérarchie entière, dépliée à la demande.
 *
 * Chaque nœud monte sa propre requête sur la clé et la fonction du repository
 * du niveau, `enabled` au dépliage : ouvrir un nœud dont la liste a déjà été
 * affichée ne coûte aucune requête, TanStack Query sert la même entrée de
 * cache. La fraîcheur est celle des sélecteurs du fil, sans quoi le second
 * observateur d'une liste la redemanderait aussitôt.
 *
 * L'`itemId` d'un nœud *est* son URL de détail. Sélectionner, c'est donc y
 * naviguer, et la sélection courante se relit dans le `pathname` sans qu'aucun
 * état ne double l'URL.
 *
 * Aucun bouton ne vit dans un nœud : un élément focalisable à l'intérieur d'un
 * `treeitem` casserait le tabindex tournant, et l'arbre cesserait d'être
 * parcourable au clavier. Les actions sont dans le bandeau du panneau.
 */

import {
    createContext, use, useCallback, useMemo,
    type KeyboardEvent, type MouseEvent, type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import { Box, Typography } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';

import { DUREE_FRAICHEUR_NOMS } from '../../../services/context/resolution';
import type { EntiteCrud } from '../../../services/crud/def';
import { libelleCreation, messageListeVide } from '../../../services/crud/entityMessages';
import type { IconeAction } from '../../../services/crud/actions';
import { niveauArbre, NIVEAU_RACINE, type EnfantArbre, type NiveauArbre } from './niveaux';

/**
 * Même fraîcheur que les résolutions de nom du fil de contexte : traverser un
 * écran, puis rouvrir le nœud correspondant, ne redemande jamais une liste que
 * le cache connaît déjà.
 */
const DUREE_FRAICHEUR = DUREE_FRAICHEUR_NOMS;

interface ValeurContexteArbre {
    readonly deplies: ReadonlySet<string>;
    readonly ecritureAutorisee: boolean;
    readonly selectionner: (chemin: string) => void;
}

const ContexteArbre = createContext<ValeurContexteArbre | null>(null);

function useContexteArbre(): ValeurContexteArbre {
    const valeur = use(ContexteArbre);
    if (valeur === null) throw new Error('Un nœud d’arbre doit être rendu sous ArbreStructure');
    return valeur;
}

/**
 * Entrée sélectionne, comme le clic sur l'étiquette.
 *
 * MUI réserve Entrée au dépliage dès qu'un nœud a des enfants, et n'accorde la
 * sélection qu'à Espace. C'est la convention d'un arbre à sélection multiple ;
 * dans un maître-détail, où sélectionner change d'URL, Entrée sur une branche
 * la replierait au lieu de l'ouvrir — le clavier ferait autre chose que la
 * souris. Les flèches gardent le dépliage, Espace garde son sens MUI.
 *
 * L'événement remonte jusqu'aux nœuds ancêtres, qui portent le même gestionnaire
 * sur leur `li` : seul celui qui a réellement le focus doit agir.
 */
function useEntreeSelectionne(chemin: string) {
    const { selectionner } = useContexteArbre();
    return useCallback((evenement: KeyboardEvent<HTMLLIElement> & {
        defaultMuiPrevented?: boolean;
    }) => {
        if (evenement.key !== 'Enter' || evenement.target !== evenement.currentTarget) return;
        evenement.defaultMuiPrevented = true;
        evenement.preventDefault();
        selectionner(chemin);
    }, [chemin, selectionner]);
}

/**
 * Le chevron déplie, et rien d'autre.
 *
 * `expansionTrigger="iconContainer"` déplace bien le dépliage sur le chevron,
 * mais MUI ne stoppe pas la propagation du clic vers le contenu : sans cela,
 * ouvrir une branche sélectionnerait aussi son nœud — donc changerait d'URL —
 * et le dépliage automatique de la sélection rouvrirait aussitôt ce qu'on vient
 * de replier. Deux gestes distincts pour deux effets distincts.
 */
const CHEVRON_SEUL = {
    iconContainer: {
        onClick: (evenement: MouseEvent<HTMLDivElement>) => { evenement.stopPropagation(); },
    },
} as const;

/** Un élément de collection, réduit à ce que l'arbre en montre. */
interface Noeud {
    readonly identifiant: string;
    readonly nom: string;
}

function Etiquette({ icone: Icone, texte }: { icone: IconeAction; texte: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25, minWidth: 0 }}>
            <Icone fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
            <Typography variant="body2" noWrap title={texte}>{texte}</Typography>
        </Box>
    );
}

/** Nœud inerte : attente de chargement, échec, ou collection encore fermée. */
function NoeudInerte({ itemId, texte }: { itemId: string; texte: string }) {
    return (
        <TreeItem
            itemId={itemId}
            disabled
            label={<Typography variant="body2" sx={{ color: 'text.disabled' }}>{texte}</Typography>}
        />
    );
}

/**
 * L'état vide guidé, transposé dans l'arbre : le constat d'`entityMessages` et
 * l'invite de création d'`EtatVideTable`, réunis dans un nœud sélectionnable
 * qui mène au formulaire. Un `<button>` dans un `role="group"` serait plus
 * proche de la table, mais inatteignable aux flèches ; un nœud, lui, se
 * parcourt et se valide au clavier comme les autres.
 */
function NoeudVide({ chemin, entite }: { chemin: string; entite: EntiteCrud<FieldValues> }) {
    const { ecritureAutorisee } = useContexteArbre();
    const constat = messageListeVide(entite);

    if (!ecritureAutorisee) return <NoeudInerte itemId={`${chemin}#vide`} texte={constat} />;

    const invite = libelleCreation(entite);
    return (
        <TreeItem
            itemId={`${chemin}/new`}
            aria-label={`${constat} ${invite}`}
            label={
                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    {constat} <Box component="span" sx={{ textDecoration: 'underline' }}>{invite}</Box>
                </Typography>
            }
        />
    );
}

interface PropsCollection {
    /** Chemin de la collection : `…/formation/12/promotion`. */
    readonly chemin: string;
    readonly niveau: NiveauArbre;
    /** Identifiant qui filtre la collection ; vide à la racine. */
    readonly identifiantParent: string;
    readonly deplie: boolean;
}

/**
 * Les nœuds d'une collection.
 *
 * Un enfant est toujours rendu, même fermée : c'est lui qui rend le nœud
 * porteur dépliable — `SimpleTreeView` le déduit de la présence d'enfants — et
 * donc lui qui permet d'ouvrir sans avoir rien chargé.
 */
function Collection({ chemin, niveau, identifiantParent, deplie }: PropsCollection): ReactNode {
    const entite = useMemo(
        () => niveau.entite(identifiantParent),
        [niveau, identifiantParent],
    );

    // La projection se fait en aval, par `select` : la fonction de requête
    // reste celle du repository, mot pour mot, sous sa clé partagée.
    const projeter = useCallback(
        (donnees: FieldValues[]): Noeud[] => donnees.map(donnee => ({
            identifiant: String(entite.getId(donnee)),
            nom: entite.getName(donnee),
        })),
        [entite],
    );

    const { data, isError } = useQuery({
        queryKey: entite.queryKey,
        queryFn: entite.fetchAll,
        enabled: deplie,
        staleTime: DUREE_FRAICHEUR,
        select: projeter,
    });

    if (!deplie) return <NoeudInerte itemId={`${chemin}#attente`} texte="…" />;
    if (isError) return <NoeudInerte itemId={`${chemin}#erreur`} texte="Chargement impossible." />;
    if (data === undefined) return <NoeudInerte itemId={`${chemin}#chargement`} texte="Chargement…" />;
    if (data.length === 0) return <NoeudVide chemin={chemin} entite={entite} />;

    return data.map(noeud => (
        <NoeudEntite
            key={noeud.identifiant}
            chemin={`${chemin}/${noeud.identifiant}`}
            niveau={niveau}
            noeud={noeud}
        />
    ));
}

/** Le dossier d'une branche annexe : les groupes sous une option. */
function NoeudCategorie({ chemin, enfant, identifiantParent }: {
    chemin: string;
    enfant: EnfantArbre;
    identifiantParent: string;
}) {
    const { deplies } = useContexteArbre();
    const surEntree = useEntreeSelectionne(chemin);
    const niveau = niveauArbre(enfant.segment);
    if (niveau === undefined) return null;

    return (
        <TreeItem
            itemId={chemin}
            slotProps={CHEVRON_SEUL}
            onKeyDown={surEntree}
            aria-label={enfant.categorie ?? niveau.libellePluriel}
            label={<Etiquette icone={FolderIcon} texte={enfant.categorie ?? niveau.libellePluriel} />}
        >
            <Collection
                chemin={chemin}
                niveau={niveau}
                identifiantParent={identifiantParent}
                deplie={deplies.has(chemin)}
            />
        </TreeItem>
    );
}

function enfantsDuNoeud({ chemin, niveau, identifiant, deplie }: {
    chemin: string;
    niveau: NiveauArbre;
    identifiant: string;
    deplie: boolean;
}): ReactNode[] {
    return niveau.enfants.map(enfant => {
        const cheminEnfant = `${chemin}/${enfant.segment}`;
        if (enfant.categorie !== undefined) {
            return (
                <NoeudCategorie
                    key={enfant.segment}
                    chemin={cheminEnfant}
                    enfant={enfant}
                    identifiantParent={identifiant}
                />
            );
        }
        const niveauEnfant = niveauArbre(enfant.segment);
        if (niveauEnfant === undefined) return null;
        return (
            <Collection
                key={enfant.segment}
                chemin={cheminEnfant}
                niveau={niveauEnfant}
                identifiantParent={identifiant}
                deplie={deplie}
            />
        );
    });
}

function NoeudEntite({ chemin, niveau, noeud }: {
    chemin: string;
    niveau: NiveauArbre;
    noeud: Noeud;
}) {
    const { deplies } = useContexteArbre();
    const surEntree = useEntreeSelectionne(chemin);
    const deplie = deplies.has(chemin);

    return (
        <TreeItem
            itemId={chemin}
            slotProps={CHEVRON_SEUL}
            onKeyDown={surEntree}
            // Hors contexte visuel, le nom seul ne dit pas de quoi il est le
            // nom : le niveau le précède, comme dans le fil de contexte.
            aria-label={`${niveau.libelle} ${noeud.nom}`}
            label={<Etiquette icone={niveau.icone} texte={noeud.nom} />}
        >
            {/* Une feuille n'a pas d'enfants du tout : un tableau vide ferait
                rendre à MUI un `role="group"` sans contenu. */}
            {niveau.enfants.length === 0
                ? null
                : enfantsDuNoeud({ chemin, niveau, identifiant: noeud.identifiant, deplie })}
        </TreeItem>
    );
}

interface Props {
    /** Chemin de la collection racine : `/catalog_context/formation`. */
    readonly cheminRacine: string;
    readonly selection: string | null;
    readonly deplies: readonly string[];
    readonly ecritureAutorisee: boolean;
    readonly onDeplier: (chemins: string[]) => void;
    readonly onSelectionner: (chemin: string) => void;
}

export function ArbreStructure({
    cheminRacine, selection, deplies, ecritureAutorisee, onDeplier, onSelectionner,
}: Props) {
    const valeur = useMemo<ValeurContexteArbre>(
        () => ({ deplies: new Set(deplies), ecritureAutorisee, selectionner: onSelectionner }),
        [deplies, ecritureAutorisee, onSelectionner],
    );

    return (
        <ContexteArbre value={valeur}>
            <SimpleTreeView
                aria-label="Arborescence de la structure"
                selectedItems={selection}
                onSelectedItemsChange={(_evenement, itemId) => {
                    if (itemId !== null && itemId !== selection) onSelectionner(itemId);
                }}
                expandedItems={deplies}
                onExpandedItemsChange={(_evenement, itemIds) => { onDeplier(itemIds); }}
                // Le chevron déplie, l'étiquette sélectionne : deux gestes
                // distincts pour deux effets distincts, dont l'un navigue.
                expansionTrigger="iconContainer"
                sx={{ py: 1 }}
            >
                <Collection
                    chemin={cheminRacine}
                    niveau={NIVEAU_RACINE}
                    identifiantParent=""
                    deplie
                />
            </SimpleTreeView>
        </ContexteArbre>
    );
}
