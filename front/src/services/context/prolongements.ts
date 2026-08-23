/**
 * Les prolongements des workflows au-delà de la hiérarchie partagée.
 *
 * Les quatre niveaux de `niveaux.ts` sont communs à tous les workflows ; en
 * dessous, chacun poursuit avec ses propres segments — UE, matière, contrôle,
 * groupe, ou de simples écrans terminaux comme `toeic` ou `jury`. Ce module
 * décrit ces segments pour le fil de contexte, à partir des mêmes repositories
 * que les listes CRUD : c'est ce qui remplace les `entityMap` que chaque
 * layout recopiait.
 *
 * Trois degrés d'équipement, du plus riche au plus pauvre :
 *
 * - `depot` et `resoudre` : un vrai niveau, nom résolu et menu des frères —
 *   la contrainte de `freres.ts` s'applique, le dépôt reprend la fonction de
 *   requête du repository mot pour mot ;
 * - `resoudre` seul : le nom s'affiche mais rien ne se choisit — le détail
 *   d'une note, dont les frères n'auraient pas de sens dans un menu ;
 * - ni l'un ni l'autre : un libellé inerte — les écrans terminaux.
 */

import type { QueryKey } from '@tanstack/react-query';

import { CATALOG_WORKFLOW, MEMBRES } from '../../pages/catalog/def';
import { CERTIFICATION_WORKFLOW, MOBILITE, TOEIC } from '../../pages/certification/def';
import { JURY, JURY_WORKFLOW } from '../../pages/jury/def';
import {
    CONTROLE, ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE, NOTE_WORKFLOW,
} from '../../pages/note/def';
import { createControleRepository } from '../../pages/note/entites/controle';
import { PROGRAMME, PROGRAMME_WORKFLOW } from '../../pages/programme/def';
import {
    ENDPOINT_GROUPE, ENDPOINT_MATIERE, ENDPOINT_UES, GROUPE, MATIERE, UES,
} from '../../pages/structure/def';
import { createGroupeRepository } from '../../pages/structure/entites/groupe';
import { createMatiereRepository } from '../../pages/structure/entites/matiere';
import { createUeRepository } from '../../pages/structure/entites/ue';
import { depot, type DepotFreres } from './freres';
import type { EntiteNommee } from './niveaux';

/** Résolution du nom d'une entité profonde : où la chercher, quoi en lire. */
export interface ResolveurNom {
    readonly endpoint: string;
    /** Clé de la requête de détail, partagée avec les écrans qui la font déjà. */
    readonly cle: (identifiant: string) => QueryKey;
    /** `null` quand la donnée ne porte pas de nom affichable. */
    readonly projeter: (donnee: unknown) => string | null;
}

/**
 * Fabrique un résolveur typé. Le transtypage est sûr par le même argument que
 * dans `freres.ts` : la donnée sous cette clé vient de ce même endpoint, donc
 * ce que `projeter` reçoit est bien un `D`.
 */
function resolveur<D>(segment: string, endpoint: string, nom: (donnee: D) => string): ResolveurNom {
    return {
        endpoint,
        cle: identifiant => [segment, identifiant],
        projeter: donnee => {
            const libelle = nom(donnee as D);
            return libelle.length > 0 ? libelle : null;
        },
    };
}

function resolveurNomme(segment: string, endpoint: string): ResolveurNom {
    return resolveur<EntiteNommee>(segment, endpoint, donnee => donnee.name);
}

export interface SegmentProlonge {
    readonly segment: string;
    readonly libelle: string;
    /** Dépôt des frères filtrés par le parent ; absent, pas de menu. */
    readonly depot?: (identifiantParent: string) => DepotFreres;
    /** Résolution du nom d'un identifiant ; absent, le segment reste un libellé. */
    readonly resoudre?: ResolveurNom;
}

const SEGMENT_UE: SegmentProlonge = {
    segment: UES,
    libelle: 'UE',
    depot: periodeId => depot(createUeRepository(periodeId)),
    resoudre: resolveurNomme(UES, ENDPOINT_UES),
};

const SEGMENT_MATIERE: SegmentProlonge = {
    segment: MATIERE,
    libelle: 'Matière',
    depot: ueId => depot(createMatiereRepository(ueId)),
    resoudre: resolveurNomme(MATIERE, ENDPOINT_MATIERE),
};

const SEGMENT_CONTROLE: SegmentProlonge = {
    segment: CONTROLE,
    libelle: 'Contrôle',
    depot: matiereId => depot(createControleRepository(matiereId)),
    resoudre: resolveurNomme(CONTROLE, ENDPOINT_CONTROLE),
};

const SEGMENT_GROUPE: SegmentProlonge = {
    segment: GROUPE,
    libelle: 'Groupe',
    depot: optionId => depot(createGroupeRepository(optionId)),
    resoudre: resolveurNomme(GROUPE, ENDPOINT_GROUPE),
};

/** Le détail d'une note se nomme par son élève ; pas de frères en menu. */
const SEGMENT_NOTE: SegmentProlonge = {
    segment: NOTE,
    libelle: 'Notes',
    resoudre: resolveur<{ firstName?: string | null; lastName?: string | null }>(
        NOTE, ENDPOINT_NOTE_CONTROLE,
        donnee => [donnee.firstName, donnee.lastName].filter(Boolean).join(' '),
    ),
};

const SEGMENTS_PAR_WORKFLOW: Readonly<Record<string, readonly SegmentProlonge[]>> = {
    [CATALOG_WORKFLOW]: [
        SEGMENT_UE, SEGMENT_MATIERE, SEGMENT_GROUPE,
        { segment: MEMBRES, libelle: 'Membres' },
    ],
    [NOTE_WORKFLOW]: [SEGMENT_UE, SEGMENT_MATIERE, SEGMENT_CONTROLE, SEGMENT_NOTE],
    [JURY_WORKFLOW]: [{ segment: JURY, libelle: 'Jury' }],
    [PROGRAMME_WORKFLOW]: [{ segment: PROGRAMME, libelle: 'Programme' }],
    [CERTIFICATION_WORKFLOW]: [
        { segment: TOEIC, libelle: 'TOEIC' },
        { segment: MOBILITE, libelle: 'Mobilité internationale' },
    ],
};

const VIDE: ReadonlyMap<string, SegmentProlonge> = new Map();

const PAR_WORKFLOW = new Map<string, ReadonlyMap<string, SegmentProlonge>>(
    Object.entries(SEGMENTS_PAR_WORKFLOW).map(([workflow, segments]) => [
        workflow,
        new Map(segments.map(segment => [segment.segment, segment])),
    ]),
);

/** Les segments prolongés d'un workflow, indexés par segment d'URL. */
export function prolongementsDuWorkflow(idWorkflow: string): ReadonlyMap<string, SegmentProlonge> {
    return PAR_WORKFLOW.get(idWorkflow) ?? VIDE;
}
