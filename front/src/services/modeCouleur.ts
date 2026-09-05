/**
 * La source unique du mode clair/sombre (lot 17 — l'inversion annoncée par
 * l'invariant 12 : Tailwind/shadcn décident, plus personne ne suit).
 *
 * Trois valeurs, comme le `useColorScheme` MUI qu'il remplace : `light`,
 * `dark`, `system`. `system` se résout par `prefers-color-scheme`. Le
 * résultat, `estSombre`, est ce que `layouts/dashboard.tsx` pose en classe
 * `.dark` sur `<html>` — le seul endroit qui décide ; tout le reste (les
 * tokens de `index.css`, le thème du toaster) suit cette classe ou cette
 * valeur, jamais une seconde lecture de la préférence système.
 *
 * Deux magasins externes, chacun lu par `useSyncExternalStore` :
 *  - la préférence enregistrée, dans `localStorage`. Le composant s'abonne à
 *    l'événement `storage` (un autre onglet change de mode → celui-ci suit,
 *    ce que MUI faisait aussi) et aux écritures de `setMode` du même onglet ;
 *  - la préférence système, par `matchMedia`. Le composant s'y ABONNE plutôt
 *    que de la lire au rendu : lire `window.matchMedia(...).matches` pendant
 *    le rendu marchait du temps de MUI, mais seulement parce que
 *    `useColorScheme` s'y abonnait pour son compte et provoquait le rendu —
 *    le composant dépendait d'un abonnement posé par un voisin (constaté au
 *    lot 3). Ici l'abonnement est le sien.
 *
 * La clé de persistance est `mode-couleur` depuis le 5 septembre 2026, jour
 * où la bascule est entrée dans l'en-tête (`BasculeModeCouleur.tsx`, seul
 * consommateur de `setMode`). Jusque-là elle s'appelait `mui-mode`, le nom
 * que MUI posait depuis le lot 3 (`toolpad-mode` avant lui), gardé au lot 17
 * pour ne déconnecter aucune préférence : au chargement du module, une
 * valeur encore rangée sous l'ancienne clé est reprise sous la nouvelle,
 * puis l'ancienne est effacée.
 */

import { useSyncExternalStore } from 'react';

export type ModeCouleur = 'light' | 'dark' | 'system';

const CLE_MODE = 'mode-couleur';
const ANCIENNE_CLE_MODE = 'mui-mode';
const REQUETE_SOMBRE = '(prefers-color-scheme: dark)';

function estMode(valeur: unknown): valeur is ModeCouleur {
    return valeur === 'light' || valeur === 'dark' || valeur === 'system';
}

/** Repli quand `localStorage` est indisponible (navigation privée verrouillée). */
let modeMemoire: ModeCouleur = 'system';

/** Reprise, une fois, d'une préférence rangée sous l'ancienne clé `mui-mode`. */
function reprendreAncienneCle(): void {
    try {
        const ancienne = localStorage.getItem(ANCIENNE_CLE_MODE);
        if (ancienne === null) return;
        if (localStorage.getItem(CLE_MODE) === null && estMode(ancienne)) {
            localStorage.setItem(CLE_MODE, ancienne);
        }
        localStorage.removeItem(ANCIENNE_CLE_MODE);
    } catch {
        // Sans magasin, rien à reprendre.
    }
}
reprendreAncienneCle();

function lireMode(): ModeCouleur {
    try {
        const valeur = localStorage.getItem(CLE_MODE);
        return estMode(valeur) ? valeur : 'system';
    } catch {
        return modeMemoire;
    }
}

const abonnesMode = new Set<() => void>();

function abonnerMode(notifier: () => void): () => void {
    abonnesMode.add(notifier);
    const surStorage = (evenement: StorageEvent) => {
        // `key === null` : le magasin entier a été vidé.
        if (evenement.key === null || evenement.key === CLE_MODE) notifier();
    };
    window.addEventListener('storage', surStorage);
    return () => {
        abonnesMode.delete(notifier);
        window.removeEventListener('storage', surStorage);
    };
}

function ecrireMode(mode: ModeCouleur): void {
    modeMemoire = mode;
    try {
        localStorage.setItem(CLE_MODE, mode);
    } catch {
        // Le repli mémoire ci-dessus tient lieu de persistance pour la session.
    }
    abonnesMode.forEach((notifier) => { notifier(); });
}

function lireSysteme(): boolean {
    return window.matchMedia(REQUETE_SOMBRE).matches;
}

function abonnerSysteme(notifier: () => void): () => void {
    const requete = window.matchMedia(REQUETE_SOMBRE);
    requete.addEventListener('change', notifier);
    return () => { requete.removeEventListener('change', notifier); };
}

export function useModeCouleur() {
    const mode = useSyncExternalStore(abonnerMode, lireMode);
    const systemeSombre = useSyncExternalStore(abonnerSysteme, lireSysteme);
    const estSombre = mode === 'system' ? systemeSombre : mode === 'dark';
    return { mode, estSombre, setMode: ecrireMode };
}
