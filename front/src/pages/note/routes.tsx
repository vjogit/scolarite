/**
 * Routes du workflow Notes.
 *
 * Le cas limite du lot : au-delà de la descente hiérarchique décrite par
 * `WORKFLOW_NOTE`, le workflow prolonge la structure (UE, matière, contrôle)
 * puis greffe un écran de notes sous chacun de ces quatre derniers niveaux.
 * Ce sont quatre greffes de même segment `note` sur quatre parents distincts.
 */

import type { FieldValues } from 'react-hook-form';
import GradingIcon from '@mui/icons-material/Grading';
import ListAltIcon from '@mui/icons-material/ListAlt';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';

import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { ACTION_UES, CrudPeriode } from '../structure/Periode';
import { ACTION_MATIERES, CrudUe } from '../structure/Ue';
import { CrudMatiere } from '../structure/Matiere';

import { CONTROLE, NOTE, NOTE_WORKFLOW } from './def';
import { CrudControle } from './Controle';
import { CrudNotePeriode } from './NotePeriode';
import { CrudNoteUniteEnseignement } from './NoteUniteEnseignement';
import { CrudNoteMatiere } from './NoteMatiere';
import { CrudNoteControle } from './NoteControle';

/**
 * On consulte la structure depuis les notes, on ne la modifie pas.
 * `isReadOnly` est ici la propriété critique : le mode édition est mémorisé
 * pour tout le workflow, et l'écran des contrôles permet de l'activer.
 */
const TRAVERSEE: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: true,
    isReadOnly: true,
    isTopToolbar: false,
};

/** Écrans de notes en consultation : aucune action de ligne. */
const NOTES_CONSULTEES: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: false,
    isTopToolbar: true,
};

/** Seul l'écran des notes d'un contrôle expose les actions de ligne. */
const NOTES_SAISIES: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

/**
 * L'action dominante du workflow, à tous ses niveaux : promue hors du menu,
 * là où les autres écrans laissent « Voir ».
 */
const ACTION_NOTES: ActionNavigation<FieldValues> = {
    id: 'notes',
    libelle: 'Gérer les notes',
    icone: GradingIcon,
    segment: NOTE,
    directe: true,
};

/** Descente vers les contrôles de la matière, propre au workflow. */
const ACTION_CONTROLES: ActionNavigation<FieldValues> = {
    id: 'controles',
    libelle: 'Gérer les contrôles',
    icone: ListAltIcon,
    segment: CONTROLE,
};

export function createNoteHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_NOTE, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: enrober(CrudPeriode, {
                ...TRAVERSEE,
                isTopToolbar: true,
                actionsLigne: [ACTION_NOTES, ACTION_UES],
            }),
        },
        greffes: [
            {
                segment: UES, parent: PERIODE,
                composant: enrober(CrudUe, { ...TRAVERSEE, actionsLigne: [ACTION_NOTES, ACTION_MATIERES] }),
            },
            {
                segment: MATIERE, parent: UES,
                composant: enrober(CrudMatiere, { ...TRAVERSEE, actionsLigne: [ACTION_NOTES, ACTION_CONTROLES] }),
            },
            {
                // Le contrôle est le seul niveau de structure éditable ici, et
                // il ajoute lui-même ses actions de fiche.
                segment: CONTROLE, parent: MATIERE,
                composant: enrober(CrudControle, {
                    workflow: NOTE_WORKFLOW,
                    isAction: true,
                    isTopToolbar: true,
                    actionsLigne: [ACTION_NOTES],
                }),
            },

            { segment: NOTE, parent: PERIODE, composant: enrober(CrudNotePeriode, NOTES_CONSULTEES) },
            { segment: NOTE, parent: UES, composant: enrober(CrudNoteUniteEnseignement, NOTES_CONSULTEES) },
            { segment: NOTE, parent: MATIERE, composant: enrober(CrudNoteMatiere, NOTES_CONSULTEES) },
            { segment: NOTE, parent: CONTROLE, composant: enrober(CrudNoteControle, NOTES_SAISIES) },
        ],
    });
}
