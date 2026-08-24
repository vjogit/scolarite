import type { useNotifications } from '@toolpad/core/useNotifications';

/**
 * Notifications applicatives.
 *
 * Le projet recopiait `autoHideDuration` à chaque appel, avec cinq valeurs
 * différentes sans règle. Les durées vivent ici, une seule fois.
 *
 * API sous forme de fonctions plutôt que de hook : tous les appelants
 * disposent déjà de `useNotifications()`, et ces appels vivent dans des
 * callbacks de mutation ou des `useCallback` où l'ajout d'un hook
 * supplémentaire n'apporterait rien.
 */

type Notifications = ReturnType<typeof useNotifications>;

/** Un succès se lit d'un coup d'œil : il n'a pas à s'attarder. */
export const NOTIFY_SUCCESS_MS = 4000;

/** Une erreur se lit vraiment, et parfois se recopie. */
export const NOTIFY_ERROR_MS = 7000;

/** Succès partiel : la liste des cas non traités demande du temps de lecture. */
export const NOTIFY_WARNING_MS = 8000;

export function notifySuccess(notifications: Notifications, message: string): void {
    notifications.show(message, { severity: 'success', autoHideDuration: NOTIFY_SUCCESS_MS });
}

export function notifyError(notifications: Notifications, message: string): void {
    notifications.show(message, { severity: 'error', autoHideDuration: NOTIFY_ERROR_MS });
}

export function notifyWarning(notifications: Notifications, message: string): void {
    notifications.show(message, { severity: 'warning', autoHideDuration: NOTIFY_WARNING_MS });
}

/**
 * Refus qui demande une décision, et non un simple constat.
 *
 * Sans durée : le message porte une liste — les lignes d'une fiche refusée,
 * avec les noms et les valeurs en cause — qu'il faut lire, parfois recopier,
 * et souvent comparer au fichier ouvert à côté. Les sept secondes d'une erreur
 * ordinaire l'effaceraient avant qu'on l'ait parcourue, et l'utilisateur
 * relancerait l'import à l'aveugle.
 */
export function notifyBlocking(notifications: Notifications, message: string): void {
    notifications.show(message, { severity: 'error' });
}

/**
 * Annulation réussie. Sévérité `warning` pour signaler le retour en arrière,
 * mais durée d'un succès : il n'y a rien à lire au-delà du fait lui-même.
 */
export function notifyUndone(notifications: Notifications, message: string): void {
    notifications.show(message, { severity: 'warning', autoHideDuration: NOTIFY_SUCCESS_MS });
}

/**
 * Résultat d'un import : succès complet, ou avertissement si des lignes
 * n'ont pas pu être traitées. Évite de répéter le ternaire sur la sévérité.
 */
export function notifyPartialSuccess(
    notifications: Notifications,
    message: string,
    complet: boolean,
): void {
    if (complet) {
        notifySuccess(notifications, message);
    } else {
        notifyWarning(notifications, message);
    }
}
