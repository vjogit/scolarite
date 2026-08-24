/**
 * D'où vient une note calculée.
 *
 * Les axes matière et UE rendent trois nombres que rien ne distinguait à
 * l'écran, et le serveur le savait déjà : `note_read_matiere.sql` et
 * `note_read_ue.sql` renvoient une colonne `provenance` depuis leur écriture,
 * avec ce commentaire — « elle n'entre dans aucun calcul, elle nomme celui qui
 * a eu lieu ». Le front ne la lisait nulle part.
 *
 * Les trois cas ne se déduisent pas de la valeur seule :
 *
 * - la moyenne pondérée de la session 1, le cas ordinaire ;
 * - le seuil `echelle[5]` attribué à un rattrapage validé, qui ne correspond à
 *   aucune copie — un élève noté 5 puis rattrapé à 11 s'affiche 8 — et qu'une
 *   moyenne ordinaire peut atteindre exactement ;
 * - l'absence de note, faute d'un contrôle évalué. C'est une règle métier, pas
 *   une saisie oubliée, et une cellule vide dit exactement le contraire.
 */

/** Valeurs émises par le serveur, telles quelles. */
export type Provenance = 'moyenne' | 'rattrapage' | 'non_evaluee';

/**
 * Ce que le lecteur doit comprendre du seuil de rattrapage. Partagé par la
 * cellule et par l'axe Élève, qui montre la même règle sur ses contrôles.
 */
export const ORIGINE_RATTRAPAGE =
    'Seuil de validation attribué après un rattrapage validé : cette valeur ne correspond à aucune copie.';

/** Le libellé d'une valeur absente. Jamais une cellule vide, jamais « N.E. ». */
export const LIBELLE_NON_EVALUEE = 'Non évaluée';

/**
 * Deux décimales, séparateur français : « 8,00 ».
 *
 * `toFixed(2)`, recopié sur les quatre écrans, écrivait « 8.00 » à côté de
 * chips qui affichaient déjà « Coeff. 1,5 » par `formatNombre`.
 */
export const formatNote = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
