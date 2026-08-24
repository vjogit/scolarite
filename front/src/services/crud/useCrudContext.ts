import { use } from 'react';

import { CrudContext } from './CrudContext';

/** Le contexte CRUD courant. Lève si l'écran est monté hors du fournisseur. */
export const useCrudContext = () => {
    const context = use(CrudContext);
    if (!context) {
        throw new Error("Écran monté hors du fournisseur : il faut un <CrudContext> au-dessus.");
    }
    return context;
};
