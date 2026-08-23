/**
 * L'état de l'arbre déduit de l'URL, et lui seul.
 *
 * L'URL reste la source de vérité : l'arbre et le panneau en sont une
 * présentation. On en tire la sélection, le dépliage minimal qui la rend
 * visible, et ce que le bandeau doit annoncer. Rien ici ne mémorise : un lien
 * profond collé dans un onglet neuf redonne exactement le même écran, puisque
 * rien d'autre ne l'alimente.
 */

import { useMemo } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';

import { analyserChemin, type Chainon } from '../../../services/context/chainons';
import { DUREE_FRAICHEUR_NOMS } from '../../../services/context/resolution';
import type { CrudMode, EntiteCrud } from '../../../services/crud/def';
import { niveauArbre, type NiveauArbre } from './niveaux';

/** Clé inerte : sans objet à nommer, l'observateur n'a rien à observer. */
const CLE_SANS_OBJET = ['arbre', 'sans-objet'] as const;

/** L'objet dont le nom complète un libellé, et où le chercher. */
export interface ObjetNomme {
    readonly entite: EntiteCrud<FieldValues>;
    readonly identifiant: string;
}

/** Le nœud que le panneau détaille, et tout ce que le bandeau en fait. */
export interface CibleArbre {
    readonly niveau: NiveauArbre;
    readonly identifiant: string;
    /** La collection dont ce nœud est un élément : clé de cache, libellés, suppression. */
    readonly entite: EntiteCrud<FieldValues>;
    /** `rootPath` au sens d'`actions.ts` : le chemin de cette collection. */
    readonly racine: string;
    /** Où remonter la sélection après suppression : le parent, ou sa liste. */
    readonly retour: string;
}

export interface EtatArbre {
    /** Chemin du nœud sélectionné — l'`itemId` de l'arbre est cette URL. */
    readonly selection: string | null;
    /** Chemins des nœuds que la sélection oblige à ouvrir. */
    readonly aDeplier: readonly string[];
    readonly mode: CrudMode;
    /** Renseignée en consultation seulement : c'est là que les actions ont un sens. */
    readonly cible: CibleArbre | null;
    /**
     * De quoi nommer, en tête de panneau, le nœud que l'arbre a sélectionné :
     * son niveau et l'objet à résoudre. Le panneau porte déjà le titre de ce
     * qu'il montre — « Périodes », « Détails » — ; ce qu'il ne dit pas, et que
     * le bandeau ajoute, c'est *de qui*. C'est ce qui rend le parent évident
     * pendant une création. `null` à la racine, où il n'y a pas de nœud.
     */
    readonly titre: { readonly libelle: string; readonly nomme: ObjetNomme } | null;
}

/** L'identifiant du parent dans la chaîne ; la racine n'en a pas. */
function identifiantParent(chainons: readonly Chainon[], rang: number): string {
    return rang === 0 ? '' : chainons[rang - 1]?.identifiant ?? '';
}

export function etatArbre(pathname: string, prefixe: string): EtatArbre {
    const { chainons, segmentTerminal, mode } = analyserChemin(pathname, prefixe);

    const aDeplier: string[] = [];
    let selection: string | null = null;
    let cible: CibleArbre | null = null;

    let cheminParent = `/${prefixe}`;
    let niveauParent: NiveauArbre | null = null;
    let titre: EtatArbre['titre'] = null;

    for (const [rang, chainon] of chainons.entries()) {
        const niveau = niveauArbre(chainon.segment);
        // Segment étranger à l'arbre : la descente s'arrête, la sélection reste
        // sur le dernier nœud connu. C'est le cas des écrans greffés.
        if (niveau === undefined) break;

        const racine = `${cheminParent}/${chainon.segment}`;
        const entite = niveau.entite(identifiantParent(chainons, rang));

        if (niveauParent !== null) {
            aDeplier.push(cheminParent);
            // Une branche annexe passe par son dossier : l'ouvrir aussi.
            const enfant = niveauParent.enfants.find(e => e.segment === chainon.segment);
            if (enfant?.categorie !== undefined) aDeplier.push(racine);
        }

        const chemin = `${racine}/${chainon.identifiant}`;
        selection = chemin;
        cible = {
            niveau,
            identifiant: chainon.identifiant,
            entite,
            racine,
            retour: niveauParent === null ? racine : cheminParent,
        };
        titre = { libelle: niveau.libelle, nomme: { entite, identifiant: chainon.identifiant } };

        cheminParent = chemin;
        niveauParent = niveau;
    }

    // Le chemin s'achève sur un segment nu : c'est une collection qu'on regarde,
    // et le nœud qui la porte doit donc être ouvert pour la montrer.
    if (segmentTerminal !== null && niveauParent !== null) {
        const enfant = niveauParent.enfants.find(e => e.segment === segmentTerminal);
        if (enfant !== undefined) {
            aDeplier.push(cheminParent);
            // Une branche annexe a son dossier : c'est lui, le nœud sélectionné.
            if (enfant.categorie !== undefined) selection = `${cheminParent}/${segmentTerminal}`;
        }
    }

    // Les actions du bandeau visent l'objet que le panneau montre. En liste,
    // en création et en édition, il n'en montre aucun : la liste porte déjà sa
    // barre d'outils, et le formulaire ses propres boutons.
    return {
        selection,
        aDeplier,
        mode,
        cible: mode === 'show' ? cible : null,
        titre,
    };
}

export function useEtatArbre(pathname: string, prefixe: string): EtatArbre {
    return useMemo(() => etatArbre(pathname, prefixe), [pathname, prefixe]);
}

/**
 * Le nom d'un objet, lu dans la liste que l'arbre détient déjà.
 *
 * `enabled: false` s'abonne à l'entrée de cache sans jamais la demander : le
 * titre suit l'arrivée de la liste, mais n'ajoute aucune requête. La liste est
 * là dès que le nœud parent est ouvert, et la sélection l'ouvre toujours.
 */
export function useNomEnCache(nomme: ObjetNomme | null): string | null {
    const { data } = useQuery({
        queryKey: nomme === null ? CLE_SANS_OBJET : nomme.entite.queryKey,
        queryFn: nomme === null ? skipToken : nomme.entite.fetchAll,
        enabled: false,
        staleTime: DUREE_FRAICHEUR_NOMS,
    });

    return useMemo(() => {
        if (nomme === null || data === undefined) return null;
        const trouve = data.find(objet => String(nomme.entite.getId(objet)) === nomme.identifiant);
        return trouve === undefined ? null : nomme.entite.getName(trouve);
    }, [nomme, data]);
}
