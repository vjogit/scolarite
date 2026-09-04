/**
 * Description des workflows : ce que chacun sait faire de la hiérarchie.
 *
 * Un descripteur répond à deux questions que le reste du lot pose sans cesse :
 * jusqu'à quel niveau ce workflow descend-il, et sur quel écran arrive-t-on
 * une fois ce niveau atteint. C'est de là que sort la troncature du contexte
 * quand on passe d'une tâche à l'autre.
 */

import type { TFunction } from 'i18next';
import i18n from '../../i18n/config';
import { CATALOG_WORKFLOW } from '../../pages/catalog/def';
import { CERTIFICATION_WORKFLOW, MOBILITE, TOEIC } from '../../pages/certification/def';
import { JURY, JURY_WORKFLOW } from '../../pages/jury/def';
import { NOTE, NOTE_WORKFLOW } from '../../pages/note/def';
import { PROGRAMME, PROGRAMME_WORKFLOW } from '../../pages/programme/def';
import { SALLE_WORKFLOW } from '../../pages/salle/def';
import { FORMATION, PROMOTION, UES } from '../../pages/structure/def';
import { Role, USER_WORKFLOW } from '../../pages/user/def';
import { NIVEAUX, type Niveau } from './niveaux';

export interface DescripteurWorkflow {
    /** Segment de route qui identifie le workflow ; sert aussi de clé de mémorisation. */
    readonly id: string;
    /** Préfixe de route complet, sans slash initial : `resultat/note_workflow`. */
    readonly chemin: string;
    /** Libellé de l'onglet dans la barre de navigation entre tâches. */
    readonly libelle: string;
    /** Niveaux de la hiérarchie partagée que ce workflow expose, dans l'ordre. */
    readonly niveaux: readonly Niveau[];
    /**
     * Écrans atteignables sous le dernier niveau. Vide quand le workflow
     * s'arrête sur une liste. Plusieurs entrées quand le workflow propose des
     * écrans frères : le premier fait office de défaut.
     */
    readonly ecransTerminaux: readonly string[];
    /**
     * Rôles donnant accès au workflow — c'est un droit de lecture. Toute
     * lecture du serveur exige `CONSULTATION` : c'est donc la valeur partout.
     * L'écriture ne se décide pas ici : elle est portée par chaque écran, via
     * `roleEcriture` sur sa `Datasource`, car un même workflow traverse des
     * entités aux rôles d'écriture différents.
     */
    readonly rolesRequis: readonly string[];
    /**
     * Comment le workflow donne à voir la position dans la hiérarchie.
     *
     * `fil` — le défaut — affiche le fil de contexte, qui résout le nom des
     * quatre niveaux partagés. `arbre` signifie qu'une autre présentation les
     * montre déjà, avec leurs frères et leurs branches : le fil y serait la
     * redondance que sa fusion avec le rappel de contexte avait supprimée, et
     * les résolutions de nom qui l'alimentent n'auraient plus de destinataire.
     */
    readonly presentationContexte?: 'fil' | 'arbre';
}

const HIERARCHIE_COMPLETE: readonly Niveau[] = NIVEAUX;

export const WORKFLOW_CATALOG: DescripteurWorkflow = {
    id: CATALOG_WORKFLOW,
    chemin: CATALOG_WORKFLOW,
    libelle: 'Structure',
    niveaux: HIERARCHIE_COMPLETE,
    // Sous la période, le catalogue enchaîne sur les unités d'enseignement.
    ecransTerminaux: [UES],
    rolesRequis: [Role.CONSULTATION],
    // Seul workflow dont la tâche propre est de construire la hiérarchie : il
    // la montre en entier, en arbre, et se passe donc du fil.
    presentationContexte: 'arbre',
};

export const WORKFLOW_NOTE: DescripteurWorkflow = {
    id: NOTE_WORKFLOW,
    chemin: `resultat/${NOTE_WORKFLOW}`,
    libelle: 'Notes',
    niveaux: HIERARCHIE_COMPLETE,
    ecransTerminaux: [NOTE],
    rolesRequis: [Role.CONSULTATION],
};

export const WORKFLOW_PROGRAMME: DescripteurWorkflow = {
    id: PROGRAMME_WORKFLOW,
    chemin: `planning/${PROGRAMME_WORKFLOW}`,
    libelle: 'Programme',
    niveaux: HIERARCHIE_COMPLETE,
    ecransTerminaux: [PROGRAMME],
    rolesRequis: [Role.CONSULTATION],
};

export const WORKFLOW_JURY: DescripteurWorkflow = {
    id: JURY_WORKFLOW,
    chemin: `resultat/${JURY_WORKFLOW}`,
    libelle: 'Jury',
    niveaux: HIERARCHIE_COMPLETE,
    ecransTerminaux: [JURY],
    rolesRequis: [Role.CONSULTATION],
};

export const WORKFLOW_CERTIFICATION: DescripteurWorkflow = {
    id: CERTIFICATION_WORKFLOW,
    chemin: `resultat/${CERTIFICATION_WORKFLOW}`,
    libelle: 'Certifications',
    // Les certifications s'arrêtent à la promotion : ni option ni période.
    niveaux: [FORMATION, PROMOTION],
    // Deux écrans frères sous la promotion ; on retient le dernier visité,
    // TOEIC par défaut.
    ecransTerminaux: [TOEIC, MOBILITE],
    rolesRequis: [Role.CONSULTATION],
};

/** Workflows sans contexte hiérarchique : ni barre d'onglets, ni troncature. */
export const WORKFLOW_SALLE: DescripteurWorkflow = {
    id: SALLE_WORKFLOW,
    chemin: `planning/${SALLE_WORKFLOW}`,
    libelle: 'Salles',
    niveaux: [],
    ecransTerminaux: [],
    rolesRequis: [Role.CONSULTATION],
};

export const WORKFLOW_USER: DescripteurWorkflow = {
    id: USER_WORKFLOW,
    chemin: USER_WORKFLOW,
    libelle: 'Utilisateurs',
    niveaux: [],
    ecransTerminaux: [],
    rolesRequis: [Role.CONSULTATION],
};

/** Ordre d'affichage de la barre de navigation entre tâches. */
/**
 * Dans l'ordre des onglets : les tâches du quotidien d'abord, la construction
 * de la hiérarchie en dernier — décidé le 4 septembre 2026.
 */
export const WORKFLOWS_HIERARCHIQUES: readonly DescripteurWorkflow[] = [
    WORKFLOW_PROGRAMME,
    WORKFLOW_NOTE,
    WORKFLOW_JURY,
    WORKFLOW_CERTIFICATION,
    WORKFLOW_CATALOG,
];

export const TOUS_LES_WORKFLOWS: readonly DescripteurWorkflow[] = [
    ...WORKFLOWS_HIERARCHIQUES,
    WORKFLOW_SALLE,
    WORKFLOW_USER,
];

/** Le libellé d'onglet d'un workflow, dans la langue active. */
export function libelleWorkflow(workflow: DescripteurWorkflow, t?: TFunction<'app'>): string {
    const traduire = t ?? i18n.getFixedT(null, 'app');
    switch (workflow.id) {
        case CATALOG_WORKFLOW: return traduire('workflows.structure');
        case NOTE_WORKFLOW: return traduire('workflows.notes');
        case PROGRAMME_WORKFLOW: return traduire('workflows.programme');
        case JURY_WORKFLOW: return traduire('workflows.jury');
        case CERTIFICATION_WORKFLOW: return traduire('workflows.certifications');
        case SALLE_WORKFLOW: return traduire('workflows.salles');
        case USER_WORKFLOW: return traduire('workflows.utilisateurs');
        default: return workflow.libelle;
    }
}

/**
 * Le workflow dont la route couvre ce chemin, ou `null` hors de tout workflow.
 * On retient le préfixe le plus long : `planning/programme_context` doit
 * l'emporter sur un éventuel `planning`.
 */
export function trouverWorkflow(pathname: string): DescripteurWorkflow | null {
    let trouve: DescripteurWorkflow | null = null;

    for (const workflow of TOUS_LES_WORKFLOWS) {
        const racine = `/${workflow.chemin}`;
        if (pathname !== racine && !pathname.startsWith(`${racine}/`)) continue;
        if (trouve === null || workflow.chemin.length > trouve.chemin.length) {
            trouve = workflow;
        }
    }

    return trouve;
}

/** Prédicat de visibilité par rôle, commun à la navigation et à la barre d'onglets. */
export function possedeUnRole(
    rolesUtilisateur: string[] | undefined,
    rolesRequis: readonly string[] | undefined,
): boolean {
    if (!rolesRequis || rolesRequis.length === 0) return true;
    return rolesRequis.some(role => rolesUtilisateur?.includes(role));
}

/**
 * Variante ET de possedeUnRole : tous les rôles requis doivent être portés.
 * Avec ROLES_FONCTIONNELS, c'est l'expression du composite ADMIN sans test de
 * son nom — seule la corbeille l'exige.
 */
export function possedeTousLesRoles(
    rolesUtilisateur: string[] | undefined,
    rolesRequis: readonly string[] | undefined,
): boolean {
    if (!rolesRequis || rolesRequis.length === 0) return true;
    return rolesRequis.every(role => rolesUtilisateur?.includes(role));
}
