/**
 * Où atterrit le clavier dans un formulaire.
 *
 * On interroge le DOM plutôt que `setFocus` de react-hook-form, et c'est un
 * choix, pas un contournement. Deux raisons se cumulent :
 *
 * - `Form.tsx` ne connaît pas les champs de l'écran : `datasource.render()`
 *   les produit et ne les déclare nulle part. Pour demander le « premier »,
 *   il faudrait lire `control._fields`, une API privée dont l'ordre est celui
 *   de l'enregistrement, pas celui du rendu.
 * - Les champs montés sous `Controller` — les `DatePicker`, les
 *   `Autocomplete`, les `Select` — n'enregistrent aucune `ref` auprès du
 *   formulaire. `setFocus` y échoue en silence.
 *
 * L'ordre du DOM est exactement l'ordre de lecture, et il couvre les deux
 * familles de champs. Un seul mécanisme sert donc l'ouverture du formulaire
 * et le retour d'une erreur serveur.
 */

/**
 * Ce qu'un utilisateur peut atteindre au clavier pour saisir. Les champs
 * cachés, désactivés ou en lecture seule sont écartés : `show` n'appelle
 * jamais ces fonctions, mais un formulaire d'édition peut porter un champ
 * figé, et il ne doit pas capter le focus initial.
 */
const CHAMPS_SAISISSABLES = [
    'input:not([type="hidden"]):not([disabled]):not([readonly])',
    'textarea:not([disabled]):not([readonly])',
    'select:not([disabled])',
].join(', ');

/** Premier champ saisissable du formulaire, dans l'ordre de lecture. */
export function premierChampSaisissable(formulaire: HTMLElement | null): HTMLElement | null {
    return formulaire?.querySelector<HTMLElement>(CHAMPS_SAISISSABLES) ?? null;
}

/**
 * Premier champ en erreur, dans l'ordre de lecture — et non dans celui,
 * arbitraire, de la réponse du serveur.
 *
 * Deux repères, parce qu'un seul ne suffit pas :
 *
 * - le `name`, que pose `register` — c'est le cas courant ;
 * - `aria-invalid`, que MUI met sur l'`input` d'un champ en erreur. Les
 *   `DatePicker` montés sous `Controller` ne transmettent pas `field.name` à
 *   leur `input` : ils sont introuvables par le nom, mais l'écran leur passe
 *   déjà `error`, donc l'attribut est là. Sans ce second repère, un refus
 *   serveur portant sur une date ne déplacerait rien.
 *
 * Un seul parcours, pour que l'ordre de lecture arbitre entre les deux.
 *
 * `null` si rien ne correspond : le serveur peut refuser sur un champ que
 * l'écran n'affiche pas. On laisse alors le focus où il est, plutôt que de le
 * poser au hasard.
 *
 * À appeler après le rendu que provoque `setError` : `aria-invalid` n'existe
 * pas encore avant.
 */
export function premierChampEnErreur(
    formulaire: HTMLElement | null,
    noms: readonly string[],
): HTMLElement | null {
    if (!formulaire || noms.length === 0) return null;

    const attendus = new Set(noms);
    const candidats = formulaire.querySelectorAll<HTMLElement>(CHAMPS_SAISISSABLES);

    for (const champ of candidats) {
        const nom = champ.getAttribute('name');
        if (nom !== null && attendus.has(nom)) return champ;
        if (champ.getAttribute('aria-invalid') === 'true') return champ;
    }
    return null;
}
