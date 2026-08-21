/**
 * Routes du workflow Certifications.
 *
 * Le seul workflow qui ne descend pas toute la hiérarchie : `WORKFLOW_CERTIFICATION`
 * s'arrête à la promotion, sous laquelle deux écrans frères se greffent.
 */

import type { FieldValues } from 'react-hook-form';
import PublicIcon from '@mui/icons-material/Public';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CERTIFICATION } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';

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
const ACTION_TOEIC: ActionNavigation<FieldValues> = {
    id: 'toeic',
    libelle: 'TOEIC',
    icone: WorkspacePremiumIcon,
    segment: TOEIC,
};

const ACTION_MOBILITE: ActionNavigation<FieldValues> = {
    id: 'mobilite',
    libelle: 'Mobilité internationale',
    icone: PublicIcon,
    segment: MOBILITE,
};

export function createCertificationHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CERTIFICATION, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, {
                ...TRAVERSEE,
                actionsLigne: [ACTION_TOEIC, ACTION_MOBILITE],
            }),
        },
        greffes: [
            { segment: TOEIC, parent: PROMOTION, composant: enrober(CrudToeic, CERTIFICATION) },
            { segment: MOBILITE, parent: PROMOTION, composant: enrober(CrudMobiliteInternationale, CERTIFICATION) },
        ],
    });
}
