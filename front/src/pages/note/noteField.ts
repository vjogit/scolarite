import { z } from 'zod';
import { formatNombre } from '../../services/format';

/**
 * Définition partagée du champ « note », jusqu'ici recopiée à l'identique dans
 * les quatre écrans de notes.
 *
 * Le barème vit sur la promotion, à côté des échelles qui sont déjà exprimées
 * dans l'unité des notes. Il n'est donc connu qu'après la requête qui le
 * rapporte : tant qu'il vaut `undefined`, seule la borne basse s'applique.
 * C'est délibéré — annoncer « entre 0 et 20 » avant de savoir si le barème est
 * bien 20 vaudrait moins que de ne rien annoncer.
 */
export const createNoteField = (bareme?: number) => {
    const message = bareme != null
        ? `La note doit être comprise entre 0 et ${formatNombre.format(bareme)}`
        : "La note doit être positive";

    const champ = z.number().min(0, message);

    return (bareme != null ? champ.max(bareme, message) : champ).nullable().optional();
};

/**
 * Libellé du champ de saisie. Le barème est porté par l'étiquette plutôt que
 * par un adornment : sur un `type="number"`, le suffixe se retrouverait collé
 * aux flèches de l'incrémenteur.
 */
export const libelleNote = (bareme?: number) =>
    bareme != null ? `Note (/${formatNombre.format(bareme)})` : 'Note';

/**
 * Attributs `min`/`max` du champ HTML. Sans valeur de garantie — ils n'empêchent
 * pas une saisie hors plage — mais ils alignent les flèches de l'incrémenteur
 * sur la plage réelle.
 */
export const bornesNote = (bareme?: number): { min: number; max?: number } =>
    bareme != null ? { min: 0, max: bareme } : { min: 0 };
