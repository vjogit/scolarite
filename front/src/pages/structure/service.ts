import i18n from '../../i18n/config';

export const ECHELLE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

/**
 * `errorMessage` est un rappel et non une chaîne : appelé ici, à la
 * validation, il relit la langue active plutôt que de figer celle du moment
 * où l'appelant a construit son schéma.
 */
export function IsValidEchelle(value: string, regex : RegExp, errorMessage : () => string): string | null {

    value = value.replace(/\s/g, '')
    // Vérifier d'abord le format général (optionnel, si vous le faites ailleurs)
    if (!regex.test(value)) {
        return errorMessage()
    }

    const pairs = value.split(',');
    let previousValue = Infinity; // Initialiser avec une valeur infiniment grande

    for (const pair of pairs) {
        const parts = pair.split('=');
        if (parts.length !== 2) {
            return i18n.t('echelleFormatPaire', { ns: 'validation' })
        }
        const currentValue = parseFloat(parts[1] ?? '');
        if (isNaN(currentValue) || currentValue >= previousValue) {
            return i18n.t('echelleNombreInvalideOuDecroissant', { ns: 'validation' })
        }
        previousValue = currentValue;
    }

    return null; // Tous les nombres sont décroissants
}