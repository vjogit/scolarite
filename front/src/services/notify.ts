import { toast } from 'sonner';

/**
 * Notifications applicatives.
 *
 * Le projet recopiait `autoHideDuration` à chaque appel, avec cinq valeurs
 * différentes sans règle. Les durées vivent ici, une seule fois.
 *
 * Socle : `sonner` (le `<Toaster>` est monté par `layouts/dashboard.tsx`,
 * position haut/centre — la même ancre que l'ancien snackbar). L'API est
 * impérative : `toast` s'appelle de n'importe où, sans hook ni contexte —
 * les callbacks de mutation n'ont plus d'objet `notifications` à transporter.
 */

/** Un succès se lit d'un coup d'œil : il n'a pas à s'attarder. */
export const NOTIFY_SUCCESS_MS = 4000;

/** Une erreur se lit vraiment, et parfois se recopie. */
export const NOTIFY_ERROR_MS = 7000;

/** Succès partiel : la liste des cas non traités demande du temps de lecture. */
export const NOTIFY_WARNING_MS = 8000;

export function notifySuccess(message: string): void {
    toast.success(message, { duration: NOTIFY_SUCCESS_MS });
}

export function notifyError(message: string): void {
    toast.error(message, { duration: NOTIFY_ERROR_MS });
}

export function notifyWarning(message: string): void {
    toast.warning(message, { duration: NOTIFY_WARNING_MS });
}

/**
 * Refus qui demande une décision, et non un simple constat.
 *
 * Sans limite de durée : le message porte une liste — les lignes d'une fiche
 * refusée, avec les noms et les valeurs en cause — qu'il faut lire, parfois
 * recopier, et souvent comparer au fichier ouvert à côté. Les sept secondes
 * d'une erreur ordinaire l'effaceraient avant qu'on l'ait parcourue, et
 * l'utilisateur relancerait l'import à l'aveugle. `Infinity` est le contrat
 * documenté de sonner pour « reste jusqu'à fermeture explicite » ; le bouton
 * de fermeture est global au `<Toaster>`.
 */
export function notifyBlocking(message: string): void {
    toast.error(message, { duration: Infinity });
}

/**
 * Annulation réussie. Sévérité `warning` pour signaler le retour en arrière,
 * mais durée d'un succès : il n'y a rien à lire au-delà du fait lui-même.
 */
export function notifyUndone(message: string): void {
    toast.warning(message, { duration: NOTIFY_SUCCESS_MS });
}

/**
 * Résultat d'un import : succès complet, ou avertissement si des lignes
 * n'ont pas pu être traitées. Évite de répéter le ternaire sur la sévérité.
 */
export function notifyPartialSuccess(message: string, complet: boolean): void {
    if (complet) {
        notifySuccess(message);
    } else {
        notifyWarning(message);
    }
}
