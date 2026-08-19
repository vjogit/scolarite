import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, type BlockerFunction, type Location } from 'react-router';

/**
 * Garde contre la perte d'une saisie non enregistrée.
 *
 * Trois sorties possibles relèvent de trois mécanismes distincts :
 *
 * - navigation interne (menu, fil d'Ariane, retour navigateur) : `useBlocker`,
 *   qui suspend la navigation le temps d'une confirmation ;
 * - fermeture d'onglet ou rechargement : `beforeunload`, dont seul le
 *   navigateur maîtrise le dialogue ;
 * - sortie volontaire depuis le composant (bouton « Annuler ») :
 *   `requestNavigation`, qui fait passer l'action par la même modale.
 *
 * Le hook prend un booléen et non un `formState` : la grille de saisie des
 * notes aura le même besoin avec un état modifié qui ne viendra pas de
 * react-hook-form.
 */
export interface UnsavedChangesGuard {
    /** Vrai quand une sortie est suspendue : la modale doit être affichée. */
    isBlocked: boolean;
    /** « Rester sur la page » : la sortie demandée est abandonnée. */
    cancelLeave: () => void;
    /** « Quitter sans enregistrer » : la sortie demandée est exécutée. */
    confirmLeave: () => void;
    /** Sortie décidée par le composant : passe par la modale si la garde est armée. */
    requestNavigation: (leave: () => void) => void;
    /** Désarme la garde pour la navigation qui suit immédiatement. */
    allowNavigation: () => void;
}

/**
 * Une navigation qui ne change pas d'URL ne fait perdre aucune saisie : le
 * formulaire n'est pas démonté. La bloquer produirait une modale sans objet,
 * par exemple sur le `navigate(..., { replace: true })` que la liste utilise
 * pour consommer son état de navigation.
 */
function isSameLocation(a: Location, b: Location): boolean {
    return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

export function useUnsavedChangesGuard(hasUnsavedChanges: boolean): UnsavedChangesGuard {
    // Référence et non état : le contournement doit être visible par la
    // fonction de blocage à l'instant où react-router l'appelle, c'est-à-dire
    // au milieu d'un `navigate()` synchrone, avant tout nouveau rendu. Un
    // `useState` — ou un `reset()` de react-hook-form — ne serait pris en
    // compte qu'au rendu suivant, donc trop tard.
    const bypassRef = useRef(false);

    // Sortie demandée par le composant, mise en attente de la confirmation.
    const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

    const shouldBlock = useCallback<BlockerFunction>(
        ({ currentLocation, nextLocation }) => {
            if (bypassRef.current) return false;
            if (isSameLocation(currentLocation, nextLocation)) return false;
            return hasUnsavedChanges;
        },
        [hasUnsavedChanges],
    );

    const blocker = useBlocker(shouldBlock);

    useEffect(() => {
        // Désarmée, la garde ne pose aucun écouteur.
        if (!hasUnsavedChanges) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            // Les navigateurs imposent leur propre texte depuis longtemps :
            // toute chaîne personnalisée serait ignorée. `preventDefault` suffit
            // à déclencher le dialogue, `returnValue` couvre les moteurs qui
            // s'en tiennent encore à l'ancienne convention.
            event.preventDefault();
            // `returnValue` est marqué déprécié, mais reste le seul déclencheur
            // pris en compte par les moteurs restés à l'ancienne convention.
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        // Retrait systématique : en `StrictMode` l'effet est monté deux fois en
        // développement, un écouteur resterait sinon accroché à la fenêtre.
        return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
    }, [hasUnsavedChanges]);

    const allowNavigation = useCallback(() => {
        bypassRef.current = true;
    }, []);

    const cancelLeave = useCallback(() => {
        setPendingNavigation(null);
        if (blocker.state === 'blocked') blocker.reset();
    }, [blocker]);

    const confirmLeave = useCallback(() => {
        // L'utilisateur a tranché : la garde ne doit plus s'interposer, ni sur
        // la navigation relancée ici, ni sur celles qu'elle enchaîne.
        bypassRef.current = true;

        if (pendingNavigation) {
            setPendingNavigation(null);
            pendingNavigation();
            return;
        }
        if (blocker.state === 'blocked') blocker.proceed();
    }, [blocker, pendingNavigation]);

    const requestNavigation = useCallback(
        (leave: () => void) => {
            if (!hasUnsavedChanges) {
                leave();
                return;
            }
            // Une fonction passée à `setState` serait interprétée comme une mise
            // à jour fonctionnelle : il faut la renvoyer depuis un initialiseur.
            setPendingNavigation(() => leave);
        },
        [hasUnsavedChanges],
    );

    return {
        isBlocked: blocker.state === 'blocked' || pendingNavigation !== null,
        cancelLeave,
        confirmLeave,
        requestNavigation,
        allowNavigation,
    };
}
