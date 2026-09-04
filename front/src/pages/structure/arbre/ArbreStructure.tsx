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
 *
 * Depuis le lot 12, l'arbre est écrit ici même — le paquet d'arbre MUI (x)
 * est déposé.
 * Le balisage reproduit celui que MUI rendait, parce que quatre fichiers e2e
 * s'y appuient (corbeille, navigation, hierarchieE2E) :
 *  - `ul role="tree"` porteur de l'aria-label ;
 *  - `li role="treeitem"` avec `aria-expanded` (seulement si dépliable),
 *    `aria-disabled` sur les nœuds inertes, et — c'est le choix MUI, affirmé
 *    par navigation.spec.ts — `aria-checked` true/false pour la sélection
 *    (pas `aria-selected`), absent des nœuds inertes ;
 *  - les enfants dans un `ul role="group"`, monté seulement déplié ;
 *  - tabindex tournant : un seul nœud tabbable (le focalisé, sinon le
 *    sélectionné, sinon le premier), les flèches déplacent le focus.
 * Non repris de MUI : la recherche à la frappe (typeahead), qu'aucun test ni
 * usage ne couvrait.
 *
 * Deux gestes restent distincts, comme avant : le chevron déplie (et rien
 * d'autre — sélectionner en dépliant changerait d'URL), l'étiquette
 * sélectionne. Entrée et Espace sélectionnent aussi : dans un maître-détail
 * où sélectionner navigue, Entrée doit faire ce que fait le clic.
 */

import {
    createContext, use, useCallback, useMemo, useRef, useState,
    type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FieldValues } from 'react-hook-form';
import { ChevronRight, Folder } from 'lucide-react';

import { cn } from '@/lib/utils';
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
    readonly selection: string | null;
    /** Le nœud tabbable du tabindex tournant (focalisé, sinon sélectionné). */
    readonly tabbable: string | null;
    readonly selectionner: (chemin: string) => void;
    readonly basculer: (chemin: string) => void;
    readonly focaliser: (chemin: string) => void;
}

const ContexteArbre = createContext<ValeurContexteArbre | null>(null);

function useContexteArbre(): ValeurContexteArbre {
    const valeur = use(ContexteArbre);
    if (valeur === null) throw new Error('Un nœud d’arbre doit être rendu sous ArbreStructure');
    return valeur;
}

/** Un élément de collection, réduit à ce que l'arbre en montre. */
interface Noeud {
    readonly identifiant: string;
    readonly nom: string;
}

/** Le texte d'une ligne : la taille et l'interligne du `body2` MUI (14 px / 20 px). */
const CLASSES_TEXTE = 'text-sm leading-5';

function Etiquette({ icone: Icone, texte }: { icone: IconeAction; texte: string }) {
    return (
        <div className="flex min-w-0 items-center gap-1.5 py-0.5">
            <Icone size={20} className="shrink-0 text-muted-foreground" />
            <span className={cn(CLASSES_TEXTE, 'truncate')} title={texte}>{texte}</span>
        </div>
    );
}

interface PropsLigneArbre {
    /** Chemin du nœud — son itemId, qui est aussi son URL de détail. */
    readonly chemin: string;
    readonly ariaLabel?: string;
    readonly etiquette: ReactNode;
    /** Inerte : ni focalisable, ni sélectionnable (attente, échec, vide en lecture). */
    readonly desactive?: boolean;
    /** Premier nœud de l'arbre : tab y entre tant que rien n'est focalisé ni sélectionné. */
    readonly premier?: boolean;
    readonly depliable?: boolean;
    readonly deplie?: boolean;
    readonly enfants?: ReactNode;
}

/**
 * Le `li role="treeitem"` — l'ancien `TreeItem` MUI, réduit à ce que l'arbre
 * utilise. Le focus vit sur le `li` lui-même (jamais sur un enfant), les
 * touches sont traitées par délégation sur la racine `role="tree"`.
 */
function LigneArbre({
    chemin, ariaLabel, etiquette, desactive, premier, depliable, deplie, enfants,
}: PropsLigneArbre) {
    const { selection, tabbable, selectionner, basculer, focaliser } = useContexteArbre();
    const ligne = useRef<HTMLLIElement>(null);

    if (desactive === true) {
        return (
            <li role="treeitem" aria-disabled className="list-none">
                <div className="flex items-center gap-1 px-1 py-0.5">
                    <span aria-hidden className="size-4 shrink-0" />
                    {etiquette}
                </div>
            </li>
        );
    }

    const selectionne = selection === chemin;
    const estTabbable = tabbable !== null ? tabbable === chemin : (premier ?? false);

    const surClic = (evenement: MouseEvent) => {
        // Le clic focalise le nœud explicitement : tous les navigateurs ne
        // remontent pas le focus vers l'ancêtre à tabindex.
        ligne.current?.focus();
        evenement.stopPropagation();
        selectionner(chemin);
    };

    const surClicChevron = (evenement: MouseEvent) => {
        // Le chevron déplie, et rien d'autre : sans cet arrêt, ouvrir une
        // branche sélectionnerait aussi son nœud — donc changerait d'URL — et
        // le dépliage automatique de la sélection rouvrirait aussitôt ce qu'on
        // vient de replier. Deux gestes distincts pour deux effets distincts.
        evenement.stopPropagation();
        ligne.current?.focus();
        basculer(chemin);
    };

    return (
        // Les interactions clavier vivent sur la racine `role="tree"`
        // (délégation) ; le clic, ici.
        <li
            ref={ligne}
            role="treeitem"
            data-chemin={chemin}
            aria-label={ariaLabel}
            aria-expanded={depliable === true ? deplie === true : undefined}
            aria-checked={selectionne}
            tabIndex={estTabbable ? 0 : -1}
            onFocus={(evenement) => {
                if (evenement.target === evenement.currentTarget) focaliser(chemin);
            }}
            className="group/noeud list-none outline-none"
        >
            <div
                onClick={surClic}
                className={cn(
                    'flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 select-none',
                    'group-focus-visible/noeud:ring-2 group-focus-visible/noeud:ring-ring/50',
                    selectionne ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted',
                )}
            >
                {depliable === true ? (
                    <span aria-hidden onClick={surClicChevron} className="flex shrink-0 items-center justify-center">
                        <ChevronRight className={cn('size-4 transition-transform', deplie === true && 'rotate-90')} />
                    </span>
                ) : (
                    <span aria-hidden className="size-4 shrink-0" />
                )}
                {etiquette}
            </div>
            {depliable === true && deplie === true && (
                <ul role="group" className="m-0 list-none p-0 pl-3">
                    {enfants}
                </ul>
            )}
        </li>
    );
}

/** Nœud inerte : attente de chargement, échec, ou collection encore fermée. */
function NoeudInerte({ texte }: { texte: string }) {
    return (
        <LigneArbre
            chemin=""
            desactive
            etiquette={<span className={cn(CLASSES_TEXTE, 'text-muted-foreground')}>{texte}</span>}
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
function NoeudVide({ chemin, entite, premier }: {
    chemin: string;
    entite: EntiteCrud<FieldValues>;
    premier?: boolean;
}) {
    const { ecritureAutorisee } = useContexteArbre();
    const { t } = useTranslation('crud');
    const constat = messageListeVide(entite, t);

    if (!ecritureAutorisee) return <NoeudInerte texte={constat} />;

    const invite = libelleCreation(entite, t);
    return (
        <LigneArbre
            chemin={`${chemin}/new`}
            premier={premier}
            ariaLabel={`${constat} ${invite}`}
            etiquette={
                <span className={cn(CLASSES_TEXTE, 'text-muted-foreground italic')}>
                    {constat} <span className="underline">{invite}</span>
                </span>
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
    /** Racine de l'arbre : son premier nœud est le point d'entrée de tab. */
    readonly racine?: boolean;
}

/**
 * Les nœuds d'une collection. Elle n'est montée que dépliée (le `ul
 * role="group"` d'un nœud replié n'existe pas) : sa requête part au premier
 * dépliage, et la re-déplier ressert l'entrée de cache.
 */
function Collection({ chemin, niveau, identifiantParent, racine }: PropsCollection): ReactNode {
    const { t } = useTranslation('crud');
    const entite = useMemo(
        () => niveau.entite(identifiantParent, t),
        [niveau, identifiantParent, t],
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
        staleTime: DUREE_FRAICHEUR,
        select: projeter,
    });

    if (isError) return <NoeudInerte texte={t('arbre.chargementImpossible')} />;
    if (data === undefined) return <NoeudInerte texte={t('form.chargement')} />;
    if (data.length === 0) return <NoeudVide chemin={chemin} entite={entite} premier={racine} />;

    return data.map((noeud, index) => (
        <NoeudEntite
            key={noeud.identifiant}
            chemin={`${chemin}/${noeud.identifiant}`}
            niveau={niveau}
            noeud={noeud}
            premier={racine === true && index === 0}
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
    const niveau = niveauArbre(enfant.segment);
    if (niveau === undefined) return null;
    const deplie = deplies.has(chemin);

    return (
        <LigneArbre
            chemin={chemin}
            ariaLabel={enfant.categorie ?? niveau.libellePluriel}
            etiquette={<Etiquette icone={Folder} texte={enfant.categorie ?? niveau.libellePluriel} />}
            depliable
            deplie={deplie}
            enfants={
                <Collection
                    chemin={chemin}
                    niveau={niveau}
                    identifiantParent={identifiantParent}
                />
            }
        />
    );
}

function enfantsDuNoeud({ chemin, niveau, identifiant }: {
    chemin: string;
    niveau: NiveauArbre;
    identifiant: string;
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
            />
        );
    });
}

function NoeudEntite({ chemin, niveau, noeud, premier }: {
    chemin: string;
    niveau: NiveauArbre;
    noeud: Noeud;
    premier?: boolean;
}) {
    const { deplies } = useContexteArbre();
    const deplie = deplies.has(chemin);

    return (
        <LigneArbre
            chemin={chemin}
            premier={premier}
            // Hors contexte visuel, le nom seul ne dit pas de quoi il est le
            // nom : le niveau le précède, comme dans le fil de contexte.
            ariaLabel={`${niveau.libelle} ${noeud.nom}`}
            etiquette={<Etiquette icone={niveau.icone} texte={noeud.nom} />}
            // Une feuille n'est pas dépliable du tout : ni chevron, ni
            // aria-expanded — le `role="group"` vide que rendait MUI en moins.
            depliable={niveau.enfants.length > 0}
            deplie={deplie}
            enfants={enfantsDuNoeud({ chemin, niveau, identifiant: noeud.identifiant })}
        />
    );
}

/** Les nœuds focalisables de l'arbre, dans l'ordre du document — l'ordre visuel. */
function noeudsVisibles(arbre: RefObject<HTMLUListElement | null>): HTMLElement[] {
    return Array.from(
        arbre.current?.querySelectorAll<HTMLElement>('[role="treeitem"]:not([aria-disabled])') ?? [],
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
    const { t } = useTranslation('crud');
    const arbre = useRef<HTMLUListElement>(null);
    const [focalise, setFocalise] = useState<string | null>(null);

    const basculer = useCallback((chemin: string) => {
        onDeplier(deplies.includes(chemin)
            ? deplies.filter(ouvert => ouvert !== chemin)
            : [...deplies, chemin]);
    }, [deplies, onDeplier]);

    const valeur = useMemo<ValeurContexteArbre>(
        () => ({
            deplies: new Set(deplies),
            ecritureAutorisee,
            selection,
            tabbable: focalise ?? selection,
            selectionner: onSelectionner,
            basculer,
            focaliser: setFocalise,
        }),
        [deplies, ecritureAutorisee, selection, focalise, onSelectionner, basculer],
    );

    /**
     * Le clavier de l'arbre, par délégation depuis la racine : flèches haut et
     * bas entre nœuds visibles, droite déplie puis descend, gauche replie
     * puis remonte au parent, Début/Fin aux extrémités, Entrée et Espace
     * sélectionnent. Le nœud courant est la cible de l'événement — le focus
     * ne vit que sur les `li role="treeitem"`.
     */
    const surClavier = (evenement: KeyboardEvent<HTMLUListElement>) => {
        const cible = evenement.target;
        if (!(cible instanceof HTMLElement) || cible.getAttribute('role') !== 'treeitem') return;
        const chemin = cible.dataset.chemin;
        if (chemin === undefined) return;

        switch (evenement.key) {
            case 'ArrowDown': {
                const noeuds = noeudsVisibles(arbre);
                noeuds[noeuds.indexOf(cible) + 1]?.focus();
                break;
            }
            case 'ArrowUp': {
                const noeuds = noeudsVisibles(arbre);
                noeuds[noeuds.indexOf(cible) - 1]?.focus();
                break;
            }
            case 'ArrowRight': {
                const etat = cible.getAttribute('aria-expanded');
                if (etat === 'false') basculer(chemin);
                else if (etat === 'true') {
                    cible.querySelector<HTMLElement>('[role="treeitem"]:not([aria-disabled])')?.focus();
                }
                break;
            }
            case 'ArrowLeft': {
                if (cible.getAttribute('aria-expanded') === 'true') basculer(chemin);
                else cible.parentElement?.closest<HTMLElement>('[role="treeitem"]')?.focus();
                break;
            }
            case 'Home': noeudsVisibles(arbre)[0]?.focus(); break;
            case 'End': noeudsVisibles(arbre).at(-1)?.focus(); break;
            case 'Enter': case ' ': onSelectionner(chemin); break;
            default: return;
        }
        evenement.preventDefault();
        evenement.stopPropagation();
    };

    return (
        <ContexteArbre value={valeur}>
            {/* Les touches sont traitées par délégation (voir `surClavier`) :
                les `li` sont les éléments interactifs. */}
            <ul
                ref={arbre}
                role="tree"
                aria-label={t('arbre.ariaLabel')}
                onKeyDown={surClavier}
                className="m-0 list-none p-0 py-2"
            >
                <Collection
                    chemin={cheminRacine}
                    niveau={NIVEAU_RACINE}
                    identifiantParent=""
                    racine
                />
            </ul>
        </ContexteArbre>
    );
}
