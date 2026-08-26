import appFr from '../../src/i18n/locales/fr/app.json' with { type: 'json' };
import corbeilleFr from '../../src/i18n/locales/fr/corbeille.json' with { type: 'json' };
import noteFr from '../../src/i18n/locales/fr/note.json' with { type: 'json' };
import crudFr from '../../src/i18n/locales/fr/crud.json' with { type: 'json' };
import registreFr from '../../src/i18n/locales/fr/registre.json' with { type: 'json' };
import programmeFr from '../../src/i18n/locales/fr/programme.json' with { type: 'json' };

/**
 * Substitution `{{cle}}` minimale — l'équivalent du `t()` d'i18next pour les
 * specs, qui n'ont pas de contexte React. Un libellé renommé dans les JSON
 * casse la compilation de la spec (import nommé absent), pas son exécution
 * à 3 h du matin : voir décision (e).
 */
export function interpoler(gabarit: string, valeurs: Record<string, string>): string {
    return Object.entries(valeurs).reduce(
        (texte, [cle, valeur]) => texte.replaceAll(`{{${cle}}}`, valeur),
        gabarit,
    );
}

export const app = appFr;
export const corbeille = corbeilleFr;
export const note = noteFr;
export const crud = crudFr;
export const registre = registreFr;
export const programme = programmeFr;

/** Le libellé d'un niveau du fil de contexte, sélectionné ou non. */
export function libelleNiveau(niveau: keyof typeof appFr.niveaux, nom: string): string {
    return interpoler(app.selecteurNiveau.ariaLabelNiveau, { libelle: app.niveaux[niveau], nom });
}
