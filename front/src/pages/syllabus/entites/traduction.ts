/**
 * La traduction du contenu syllabus (lot 6) : la fiche d'une matière et la
 * description d'une UE, en anglais. Le français fait référence — la traduction
 * est un dérivé stocké, que le serveur dit périmé quand les textes de sa
 * source ont changé (signalé, jamais bloquant).
 *
 * Contrat des routes : comme la fiche, la traduction « existe » toujours (GET
 * en `version: 0` quand rien n'a été traduit) ; le PUT est un upsert sous
 * verrou optimiste, qui porte le `statut` (`relue` : le rédacteur dispose ;
 * `automatique` : l'écran enregistre ce que la machine a proposé) et la source
 * que l'auteur a lue (`version_source`, `empreinte_source`, livrées par le
 * GET) ; la proposition traduit UN champ de la source enregistrée sans rien
 * écrire — une fiche entière dépasserait les délais du serveur, l'écran
 * enchaîne.
 */

import { apiInstance } from '../../../services/api';
import { handleAxiosError } from '../../../services/crud/def';
import { MATIERE, UES } from '../../structure/def';
import { ENDPOINT_SYLLABUS_MATIERE, ENDPOINT_SYLLABUS_UE, SYLLABUS } from '../def';
import { RUBRIQUES } from './syllabus';

/** La seule langue cible ; le schéma n'en ferme pas d'autre. */
export const LANGUE_TRADUCTION = 'en';
export const TRADUCTION = 'traduction';

export type NatureTraduction = typeof MATIERE | typeof UES;
export type StatutTraduction = 'automatique' | 'relue';

/** Un champ traduisible : une rubrique de la fiche, ou la description de l'UE. */
export type CleTraduction = typeof RUBRIQUES[number] | 'description';

/** Les textes traduits, par champ. */
export type TextesTraduits = Partial<Record<CleTraduction, string | null>>;

/** Ce que le serveur dit d'une traduction, au-delà de ses textes. */
export interface EtatTraduction {
    version: number;
    statut: StatutTraduction | '';
    modele: string | null;
    traduit_le: string | null;
    perimee: boolean;
    /** La source courante, à renvoyer telle quelle au PUT ; 0 et vide si elle n'a jamais été écrite. */
    source_version: number;
    source_empreinte: string;
    /** Un traducteur est configuré : sans lui, le bouton « Traduire » n'est pas offert. */
    traduction_automatique: boolean;
}

/** La traduction telle que l'écran la tient : l'état, et les textes à part. */
export interface Traduction extends EtatTraduction {
    textes: TextesTraduits;
}

/** Les champs traduisibles de chaque nature, dans l'ordre de l'écran. */
export const CHAMPS_TRADUCTION: Record<NatureTraduction, readonly CleTraduction[]> = {
    [MATIERE]: RUBRIQUES,
    [UES]: ['description'],
};

/** Le serveur livre une ligne à plat (état et textes mêlés) : les textes sont rangés à part. */
function ranger(nature: NatureTraduction, ligne: EtatTraduction & Record<string, unknown>): Traduction {
    const textes: TextesTraduits = {};
    for (const cle of CHAMPS_TRADUCTION[nature]) {
        const valeur = ligne[cle];
        textes[cle] = typeof valeur === 'string' ? valeur : null;
    }
    return {
        version: ligne.version,
        statut: ligne.statut,
        modele: ligne.modele ?? null,
        traduit_le: ligne.version > 0 ? ligne.traduit_le : null,
        perimee: ligne.perimee,
        source_version: ligne.source_version,
        source_empreinte: ligne.source_empreinte,
        traduction_automatique: ligne.traduction_automatique,
        textes,
    };
}

export interface Proposition {
    champ: string;
    texte: string;
    source_empreinte: string;
}

export interface EcritureTraduction {
    version: number;
    statut: StatutTraduction;
    version_source: number;
    empreinte_source: string;
    textes: TextesTraduits;
}

function racine(nature: NatureTraduction, id: string): string {
    const base = nature === MATIERE ? ENDPOINT_SYLLABUS_MATIERE : ENDPOINT_SYLLABUS_UE;
    return `${base}/${id}/${TRADUCTION}/${LANGUE_TRADUCTION}`;
}

export function cleTraduction(nature: NatureTraduction, id: string) {
    return [SYLLABUS, TRADUCTION, nature, id, LANGUE_TRADUCTION] as const;
}

export async function fetchTraduction(nature: NatureTraduction, id: string): Promise<Traduction> {
    try {
        const reponse = await apiInstance.get<EtatTraduction & Record<string, unknown>>(racine(nature, id));
        return ranger(nature, reponse.data);
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

export async function enregistrerTraduction(nature: NatureTraduction, id: string, ecriture: EcritureTraduction): Promise<Traduction> {
    const { textes, ...reste } = ecriture;
    try {
        const reponse = await apiInstance.put<EtatTraduction & Record<string, unknown>>(racine(nature, id), { ...textes, ...reste });
        return ranger(nature, reponse.data);
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

export async function proposerTraduction(nature: NatureTraduction, id: string, champ: CleTraduction): Promise<Proposition> {
    try {
        const reponse = await apiInstance.post<Proposition>(`${racine(nature, id)}/proposition`, { champ });
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}
