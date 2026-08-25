/**
 * Les niveaux de la hiérarchie partagée entre les workflows.
 *
 * Cinq workflows descendent la même hiérarchie mais pas jusqu'à la même
 * profondeur, et chacun la prolonge ensuite avec ses propres entités (UE,
 * matière, contrôle, groupe…). Seuls les quatre niveaux ci-dessous sont
 * communs à plusieurs workflows : eux seuls constituent le contexte partagé,
 * le reste tombe dès qu'on change de tâche.
 */

import type { TFunction } from 'i18next';
import i18n from '../../i18n/config';
import {
    FORMATION, PROMOTION, OPTION, PERIODE,
    ENDPOINT_FORMATION, ENDPOINT_PROMOTION, ENDPOINT_OPTION, ENDPOINT_PERIODE,
} from '../../pages/structure/def';

/** Du plus général au plus précis : l'ordre porte la relation de parenté. */
export const NIVEAUX = [FORMATION, PROMOTION, OPTION, PERIODE] as const;

export type Niveau = typeof NIVEAUX[number];

/** Les identifiants restent des chaînes : ils viennent de l'URL et y retournent. */
export type ContexteHierarchique = Partial<Record<Niveau, string>>;

export function estNiveau(segment: string): segment is Niveau {
    return (NIVEAUX as readonly string[]).includes(segment);
}

/**
 * Toutes les entités de la hiérarchie exposent un `name` ; c'est ce que
 * résolvent aussi les `nameResolver` du fil d'Ariane.
 */
export interface EntiteNommee {
    name: string;
}

export const ENDPOINT_PAR_NIVEAU: Readonly<Record<Niveau, string>> = {
    [FORMATION]: ENDPOINT_FORMATION,
    [PROMOTION]: ENDPOINT_PROMOTION,
    [OPTION]: ENDPOINT_OPTION,
    [PERIODE]: ENDPOINT_PERIODE,
};

export function libelleNiveau(niveau: Niveau, t?: TFunction<'app'>): string {
    const traduire = t ?? (i18n.t as unknown as TFunction<'app'>);
    switch (niveau) {
        case FORMATION: return traduire('niveaux.formation');
        case PROMOTION: return traduire('niveaux.promotion');
        case OPTION: return traduire('niveaux.option');
        case PERIODE: return traduire('niveaux.periode');
    }
}
