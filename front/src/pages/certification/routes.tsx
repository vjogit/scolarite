/**
 * Routes du workflow Certifications.
 *
 * Le seul workflow qui ne descend pas toute la hiérarchie : `WORKFLOW_CERTIFICATION`
 * s'arrête à la promotion, sous laquelle deux écrans frères se greffent.
 */

import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { Award, Globe } from 'lucide-react';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CERTIFICATION } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';
import i18n from '../../i18n/config';

import { FORMATION, PROMOTION } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { TOEIC, MOBILITE, CERTIFICATION_WORKFLOW } from './def';
import { CrudToeic } from './Toic';
import { CrudMobiliteInternationale } from './MobiliteInternationale';

/** Niveau traversé pour atteindre la promotion : pas de barre d'outils. */
const TRAVERSEE: ReglagesNiveau = {
    workflow: CERTIFICATION_WORKFLOW,
    isAction: true,
    isTopToolbar: false,
};

/** Les deux écrans terminaux, eux, portent leur propre barre d'outils. */
const CERTIFICATION: ReglagesNiveau = {
    workflow: CERTIFICATION_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

/**
 * Les deux certifications d'une promotion. Elles avaient leur propre menu —
 * `CertificationMenu` — devenu inutile : le menu commun des listes les porte
 * comme n'importe quelle autre action, et sous les mêmes libellés que le fil
 * de contexte.
 */
function actionToeic(): ActionNavigation<FieldValues> {
    return {
        id: 'toeic',
        libelle: 'TOEIC',
        icone: Award,
        segment: TOEIC,
    };
}

function actionMobilite(t?: TFunction<'certification'>): ActionNavigation<FieldValues> {
    const traduire = t ?? i18n.getFixedT(null, 'certification');
    return {
        id: 'mobilite',
        // Fermeture et non chaîne : cette action est créée une seule fois, au
        // chargement du module — une chaîne figerait la langue de démarrage.
        libelle: () => traduire('actionMobiliteLibelle'),
        icone: Globe,
        segment: MOBILITE,
    };
}

export function createCertificationHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CERTIFICATION, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, {
                ...TRAVERSEE,
                actionsLigne: [actionToeic(), actionMobilite()],
            }),
        },
        greffes: [
            { segment: TOEIC, parent: PROMOTION, composant: enrober(CrudToeic, CERTIFICATION) },
            { segment: MOBILITE, parent: PROMOTION, composant: enrober(CrudMobiliteInternationale, CERTIFICATION) },
        ],
    });
}
