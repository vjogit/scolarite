/**
 * Routes du workflow Structure.
 *
 * La descente hiérarchique vient de `WORKFLOW_CATALOG` : ni les chemins ni
 * l'ordre des niveaux ne sont écrits ici.
 */

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';

import { CATALOG_WORKFLOW, MEMBRES } from './def';
import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { ACTION_GROUPES, ACTION_PERIODES } from '../structure/entites/option';
import { CrudUe } from '../structure/Ue';
import { CrudMatiere } from '../structure/Matiere';
import { CrudGroupe } from '../structure/Groupe';
import { GroupeUserPage } from '../structure/GroupeUserPage';
import { CustomCrudPeriode } from './CustomCrudPeriode';

/** Le catalogue est le workflow d'édition : rien n'y est en lecture seule. */
const EDITION: ReglagesNiveau = {
    workflow: CATALOG_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

/** Segment des membres d'un groupe, seul écran hors CRUD du workflow. */
export function createCatalogHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_CATALOG, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, EDITION),
            [PROMOTION]: enrober(CrudPromotion, EDITION),
            [OPTION]: enrober(CrudOption, { ...EDITION, actionsLigne: [ACTION_GROUPES(), ACTION_PERIODES()] }),
            [PERIODE]: CustomCrudPeriode,
        },
        greffes: [
            { segment: UES, parent: PERIODE, composant: enrober(CrudUe, EDITION) },
            { segment: MATIERE, parent: UES, composant: enrober(CrudMatiere, EDITION) },
            { segment: GROUPE, parent: OPTION, composant: enrober(CrudGroupe, EDITION) },
            { segment: MEMBRES, parent: GROUPE, ecran: GroupeUserPage },
        ],
    });
}
