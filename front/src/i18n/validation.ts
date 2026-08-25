import i18n from './config';
import type validationFr from './locales/fr/validation.json';

type CleValidation = keyof typeof validationFr;

/**
 * Message d'erreur zod paresseux : une fonction, pas une chaîne. Les schémas
 * zod (`z.object`, `.min()`, `.refine()`…) sont construits une fois, souvent
 * au chargement du module — un message posé en chaîne à cet instant gèlerait
 * dans la langue active à ce moment-là. Zod appelle `error` à la validation,
 * pas à la déclaration : ce qu'il lit est donc toujours à jour.
 */
export function messageValidation(cle: CleValidation, options?: Record<string, unknown>): () => string {
    return () => i18n.t(cle, { ns: 'validation', ...options });
}
