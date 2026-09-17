import appFr from '../../src/i18n/locales/fr/app.json' with { type: 'json' };
import corbeilleFr from '../../src/i18n/locales/fr/corbeille.json' with { type: 'json' };
import noteFr from '../../src/i18n/locales/fr/note.json' with { type: 'json' };
import crudFr from '../../src/i18n/locales/fr/crud.json' with { type: 'json' };
import registreFr from '../../src/i18n/locales/fr/registre.json' with { type: 'json' };
import programmeFr from '../../src/i18n/locales/fr/programme.json' with { type: 'json' };
import structureFr from '../../src/i18n/locales/fr/structure.json' with { type: 'json' };
import errorsFr from '../../src/i18n/locales/fr/errors.json' with { type: 'json' };
import syllabusFr from '../../src/i18n/locales/fr/syllabus.json' with { type: 'json' };

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
export const structure = structureFr;
export const errors = errorsFr;
export const syllabus = syllabusFr;

/**
 * Le titre de la modale de suppression d'une entité nommée — la composition
 * exacte de `DeleteConfirmDialog` (libellé avec article + espace, puis nom).
 */
export function titreSuppression(nomAvecArticle: string, nom: string): string {
    return interpoler(crud.deleteDialog.titreUn, { libelle: `${nomAvecArticle} `, nom });
}

/**
 * Une ligne d'impact de suppression telle que la modale l'écrit : la clé
 * `impact.<nature>` de crud.json accordée au nombre (`_one` pour 1, `_other`
 * au-delà), le nombre formaté comme le fait i18next en français.
 */
export function ligneImpact(nature: string, nombre: number): string {
    const cle = `${nature}_${nombre === 1 ? 'one' : 'other'}` as keyof typeof crud.impact;
    const gabarit = crud.impact[cle];
    if (typeof gabarit !== 'string') throw new Error(`clé d'impact inconnue : ${cle}`);
    return gabarit.replaceAll('{{count, number}}', new Intl.NumberFormat('fr').format(nombre));
}

/** Le nom seul d'une ligne d'impact (« liaison UE ↔ compétence »), pour affirmer une absence quel que soit le nombre. */
export function nomImpact(nature: string, nombre: number): string {
    return ligneImpact(nature, nombre).replace(/^[\d\u202f\u00a0 ]+/, '');
}

/** Le libellé d'un niveau du fil de contexte, sélectionné ou non. */
export function libelleNiveau(niveau: keyof typeof appFr.niveaux, nom: string): string {
    return interpoler(app.selecteurNiveau.ariaLabelNiveau, { libelle: app.niveaux[niveau], nom });
}
