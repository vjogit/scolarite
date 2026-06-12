
export const ECHELLE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function IsValidEchelle(value: string, regex : RegExp, errorMessage : string): string | null {

    value = value.replace(/\s/g, '')
    // Vérifier d'abord le format général (optionnel, si vous le faites ailleurs)
    if (!regex.test(value)) {
        return errorMessage
    }

    const pairs = value.split(',');
    let previousValue = Infinity; // Initialiser avec une valeur infiniment grande

    for (const pair of pairs) {
        const parts = pair.split('=');
        if (parts.length !== 2) {
            return "Format incorrect pour une paire"
        }
        const currentValue = parseFloat(parts[1]);
        if (isNaN(currentValue) || currentValue >= previousValue) {
            return "Un nombre n'est pas valide ou les nombres ne sont pas décroissant"
        }
        previousValue = currentValue;
    }

    return null; // Tous les nombres sont décroissants
}