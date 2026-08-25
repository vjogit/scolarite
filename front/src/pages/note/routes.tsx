/**
 * Routes du workflow Notes.
 *
 * Le cas limite du lot : au-delà de la descente hiérarchique décrite par
 * `WORKFLOW_NOTE`, le workflow prolonge la structure (UE, matière, contrôle,
 * élève) puis greffe un écran de notes sous chacun de ces cinq derniers
 * niveaux. Ce sont cinq greffes de même segment `note` sur cinq parents
 * distincts — et ces cinq parents *sont* les axes de l'écran unifié : l'axe
 * d'un écran de notes est le segment qui porte le dernier identifiant avant
 * `note`. Voir `axes.ts`, qui le lit et l'écrit par `chainons.ts`.
 *
 * `eleve` est le seul segment ajouté. Les quatre autres axes gardent leur URL
 * mot pour mot : rien à rediriger de ce côté, et `ecransTerminaux` reste
 * `[NOTE]` — l'axe n'est pas un écran terminal, c'est le chaînon qui le porte.
 */

import type { FieldValues } from 'react-hook-form';
import GradingIcon from '@mui/icons-material/Grading';
import ListAltIcon from '@mui/icons-material/ListAlt';
import i18n from '../../i18n/config';

import { creerRoutesHierarchie, enrober, type ReglagesNiveau } from '../../services/context/routesHierarchie';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import type { ActionNavigation } from '../../services/crud/actions';

import { FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE } from '../structure/def';
import { CrudFormation } from '../structure/Formation';
import { CrudPromotion } from '../structure/Promotion';
import { CrudOption } from '../structure/Options';
import { CrudPeriode } from '../structure/Periode';
import { ACTION_UES } from '../structure/entites/periode';
import { CrudUe } from '../structure/Ue';
import { ACTION_MATIERES } from '../structure/entites/ue';
import { CrudMatiere } from '../structure/Matiere';

import { CONTROLE, ELEVE, NOTE, NOTE_WORKFLOW } from './def';
import { CrudControle } from './Controle';
import { AxeNotePeriode } from './NotePeriode';
import { AxeNoteUniteEnseignement } from './NoteUniteEnseignement';
import { AxeNoteMatiere } from './NoteMatiere';
import { CrudNoteControle } from './NoteControle';
import { AxeNoteEleve } from './NoteEleveAxe';

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

/** Seul l'écran des notes d'un contrôle expose les actions de ligne. */
const NOTES_SAISIES: ReglagesNiveau = {
    workflow: NOTE_WORKFLOW,
    isAction: true,
    isTopToolbar: true,
};

/**
 * L'action dominante du workflow, à tous ses niveaux : promue hors du menu,
 * là où les autres écrans laissent « Voir ». Elle mène à l'axe correspondant au
 * niveau de la ligne, puisque c'est ce niveau qui porte l'écran de notes.
 */
function actionNotes(): ActionNavigation<FieldValues> {
    return {
        id: 'notes',
        libelle: i18n.t('routes.gererLesNotes', { ns: 'note' }),
        icone: GradingIcon,
        segment: NOTE,
        directe: true,
    };
}

/** Descente vers les contrôles de la matière, propre au workflow. */
function actionControles(): ActionNavigation<FieldValues> {
    return {
        id: 'controles',
        libelle: i18n.t('routes.gererLesControles', { ns: 'note' }),
        icone: ListAltIcon,
        segment: CONTROLE,
    };
}

export function createNoteHierarchyRoutes() {
    return creerRoutesHierarchie(WORKFLOW_NOTE, {
        niveaux: {
            [FORMATION]: enrober(CrudFormation, TRAVERSEE),
            [PROMOTION]: enrober(CrudPromotion, TRAVERSEE),
            [OPTION]: enrober(CrudOption, TRAVERSEE),
            [PERIODE]: enrober(CrudPeriode, {
                ...TRAVERSEE,
                isTopToolbar: true,
                actionsLigne: [actionNotes(), ACTION_UES()],
            }),
        },
        greffes: [
            {
                segment: UES, parent: PERIODE,
                composant: enrober(CrudUe, { ...TRAVERSEE, actionsLigne: [actionNotes(), ACTION_MATIERES()] }),
            },
            {
                segment: MATIERE, parent: UES,
                composant: enrober(CrudMatiere, { ...TRAVERSEE, actionsLigne: [actionNotes(), actionControles()] }),
            },
            {
                // Le contrôle est le seul niveau de structure éditable ici, et
                // il ajoute lui-même ses actions de fiche.
                segment: CONTROLE, parent: MATIERE,
                composant: enrober(CrudControle, {
                    workflow: NOTE_WORKFLOW,
                    isAction: true,
                    isTopToolbar: true,
                    actionsLigne: [actionNotes()],
                }),
            },
            {
                // L'axe Élève sans élève : le choix reste à faire. Même écran
                // que ci-dessous, qui affiche alors son sélecteur seul.
                segment: ELEVE, parent: PERIODE, ecran: AxeNoteEleve,
            },

            // Les cinq axes. Seul celui du contrôle est un CRUD : il a des
            // routes d'écriture, donc un formulaire, donc les quatre modes.
            // Les quatre autres n'exposent qu'une lecture côté serveur ; leur
            // greffer un cycle CRUD y ouvrait `new`, `:id` et `:id/edit` —
            // douze routes atteignables par URL qui ne pouvaient que tomber sur
            // un verbe absent.
            { segment: NOTE, parent: PERIODE, ecran: AxeNotePeriode },
            { segment: NOTE, parent: UES, ecran: AxeNoteUniteEnseignement },
            { segment: NOTE, parent: MATIERE, ecran: AxeNoteMatiere },
            { segment: NOTE, parent: ELEVE, ecran: AxeNoteEleve },
            { segment: NOTE, parent: CONTROLE, composant: enrober(CrudNoteControle, NOTES_SAISIES) },
        ],
    });
}
