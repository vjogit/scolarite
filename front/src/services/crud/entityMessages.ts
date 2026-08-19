import type { FieldValues } from 'react-hook-form';
import type { Datasource } from './def';
import { formatNombre } from '../format';

/**
 * Composition des messages de succès des opérations d'écriture CRUD.
 *
 * Le point délicat est l'accord en genre : `entityLabel` porte l'article
 * (« la formation »), ce qui permet de déduire le genre… sauf en cas
 * d'élision (« l'option »). Le `Datasource` expose alors `entityGender`.
 * Sans genre déterminable on n'invente pas d'accord : on retombe sur une
 * tournure sans nom d'entité, où seul le nom cité reste sujet et où le
 * masculin est la forme neutre correcte.
 */

type Genre = 'm' | 'f';

/** Articles non élidés : le seul cas où le genre se lit dans le libellé. */
const ARTICLES: readonly { readonly prefixe: string; readonly genre: Genre }[] = [
    { prefixe: "la ", genre: 'f' },
    { prefixe: "le ", genre: 'm' },
    { prefixe: "une ", genre: 'f' },
    { prefixe: "un ", genre: 'm' },
];

/** Formes élidées : le nom se dégage, pas le genre. */
const ELISIONS: readonly string[] = ["l'", "l’"];

interface Entite {
    /** Nom nu, majuscule initiale : « Formation ». */
    nom: string;
    genre: Genre;
}

function capitaliser(mot: string): string {
    return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/**
 * Décompose `entityLabel` en nom nu et genre. Renvoie `null` dès que l'un
 * des deux manque : mieux vaut une phrase sans nom d'entité qu'un accord faux.
 */
function analyserLibelle<D extends FieldValues>(datasource: Datasource<D>): Entite | null {
    const libelle = datasource.entityLabel?.trim();
    if (!libelle) return null;

    const minuscule = libelle.toLowerCase();

    for (const { prefixe, genre } of ARTICLES) {
        if (minuscule.startsWith(prefixe)) {
            return {
                nom: capitaliser(libelle.slice(prefixe.length)),
                genre: datasource.entityGender ?? genre,
            };
        }
    }

    for (const elision of ELISIONS) {
        if (minuscule.startsWith(elision)) {
            // Le genre est indéterminable ici : il doit être déclaré.
            if (!datasource.entityGender) return null;
            return {
                nom: capitaliser(libelle.slice(elision.length)),
                genre: datasource.entityGender,
            };
        }
    }

    // Libellé sans article : on l'accepte si le genre est déclaré.
    if (!datasource.entityGender) return null;
    return { nom: capitaliser(libelle), genre: datasource.entityGender };
}

/** « créé » → « créée » au féminin. */
function accorder(participe: string, genre: Genre): string {
    return genre === 'f' ? `${participe}e` : participe;
}

/** « supprimé » → « supprimées » au féminin pluriel. */
function accorderPluriel(participe: string, genre: Genre): string {
    return genre === 'f' ? `${participe}es` : `${participe}s`;
}

/**
 * « Formation « L3 Informatique » créée. », ou « « L3 Informatique » créé. »
 * quand le genre de l'entité n'est pas connu.
 */
function phraseSingulier<D extends FieldValues>(
    datasource: Datasource<D>,
    nom: string,
    participe: string,
): string {
    const entite = analyserLibelle(datasource);
    if (!entite) return `« ${nom} » ${participe}.`;
    return `${entite.nom} « ${nom} » ${accorder(participe, entite.genre)}.`;
}

/** Message de création, sur la donnée renvoyée par le serveur. */
export function messageCreation<D extends FieldValues>(datasource: Datasource<D>, data: D): string {
    return phraseSingulier(datasource, datasource.getName(data), 'créé');
}

/** Message de modification, sur la donnée renvoyée par le serveur. */
export function messageEnregistrement<D extends FieldValues>(datasource: Datasource<D>, data: D): string {
    return phraseSingulier(datasource, datasource.getName(data), 'enregistré');
}

/**
 * « Période « Semestre 5 » supprimée. » / « 3 périodes supprimées. »
 * Les noms sont ceux capturés au moment de la demande de suppression.
 */
export function messageSuppression<D extends FieldValues>(
    datasource: Datasource<D>,
    noms: string[],
): string {
    if (noms.length === 1) {
        return phraseSingulier(datasource, noms[0], 'supprimé');
    }

    const nombre = formatNombre.format(noms.length);
    const entite = analyserLibelle(datasource);
    const pluriel = datasource.entityLabelPlural;

    if (entite && pluriel) {
        return `${nombre} ${pluriel} ${accorderPluriel('supprimé', entite.genre)}.`;
    }

    // Sans genre sûr, le mot neutre déjà employé par la modale de suppression :
    // masculin, donc accordable sans risque.
    return `${nombre} éléments supprimés.`;
}
