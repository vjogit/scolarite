import { createContext } from 'react';

export interface CrudContextType {
    rootPath: string;
    workflow: string;
}

/**
 * Le chemin racine et le workflow courants, pour les écrans qui en dépendent
 * sans les recevoir en props.
 *
 * Depuis React 19 un contexte se rend directement comme fournisseur : c'est
 * pourquoi ce module n'exporte plus d'alias `CrudProvider`, et pourquoi il ne
 * contient que lui — un contexte compte désormais comme un composant, et le
 * hook de lecture vit à côté.
 */
export const CrudContext = createContext<CrudContextType | undefined>(undefined);
