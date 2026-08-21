/**
 * Génération des routes hiérarchiques à partir des descripteurs de workflow.
 *
 * Cinq workflows descendent la même hiérarchie. Jusqu'ici chacun recopiait la
 * chaîne des chemins dans son propre `routes.tsx`, si bien que « quels niveaux,
 * dans quel ordre » était écrit deux fois : dans `workflows.ts` pour la
 * navigation, et dans chaque fichier de routes pour le routeur. Les deux
 * pouvaient diverger sans que rien ne le signale.
 *
 * Ici le descripteur fournit l'ordre et la profondeur, la configuration fournit
 * le composant de chaque niveau. Les chemins ne sont plus écrits nulle part.
 */

import type { ComponentType } from 'react';
import type { FieldValues } from 'react-hook-form';
import { createCrudRoutes, createRoute, type CrudComponentProps } from '../crud/routes';
import type { CrudMode } from '../crud/def';
import type { ActionLigne } from '../crud/actions';
import type { Niveau } from './niveaux';
import type { DescripteurWorkflow } from './workflows';

/**
 * Props communes à tous les composants CRUD de niveau, le générique d'entité
 * en moins. `CrudProps<D>` ne s'en distingue que par des champs optionnels :
 * `CrudFormation`, `CrudPromotion`, `CrudToeic`… sont donc assignables ici
 * sans conversion.
 */
export interface PropsNiveau {
    mode: CrudMode;
    workflow: string;
    isAction: boolean;
    isReadOnly?: boolean;
    isTopToolbar: boolean;
    /**
     * Actions de ligne du niveau. Déclarées, elles remplacent celles que
     * l'entité expose par défaut — c'est ainsi qu'un workflow ajoute la sienne
     * ou n'en garde aucune. « Voir » et « Éditer » restent ajoutés par la liste.
     */
    actionsLigne?: readonly ActionLigne<FieldValues>[];
}

/** Ce que la configuration fixe une fois pour toutes ; la route fournit `mode`. */
export type ReglagesNiveau = Omit<PropsNiveau, 'mode'>;

/**
 * Fige les props d'un composant CRUD. Les actions de ligne étant désormais
 * déclarées et non plus dessinées, elles passent par ici comme le reste ; seuls
 * les niveaux portant un `renderTopToolbarCustomActions` réel — du JSX à hooks
 * — restent des composants nommés.
 */
export function enrober(
    Composant: ComponentType<PropsNiveau>,
    reglages: ReglagesNiveau,
): ComponentType<CrudComponentProps> {
    return function NiveauEnrobe({ mode }: CrudComponentProps) {
        return <Composant mode={mode} {...reglages} />;
    };
}

interface GreffeCommune {
    /** Dernier segment d'URL du niveau greffé : `ue`, `note`, `jury`… */
    readonly segment: string;
    /** Segment du niveau porteur, déjà déclaré plus haut. */
    readonly parent: string;
}

/** Greffe exposant les quatre routes CRUD (liste, création, détail, édition). */
export interface GreffeCrud extends GreffeCommune {
    readonly composant: ComponentType<CrudComponentProps>;
}

/** Greffe exposant un écran unique, sans cycle CRUD : planning, jury… */
export interface GreffeEcran extends GreffeCommune {
    readonly ecran: ComponentType;
}

export type Greffe = GreffeCrud | GreffeEcran;

export interface ConfigurationRoutes {
    /**
     * Un composant par niveau de la hiérarchie partagée. Doit couvrir
     * exactement les `niveaux` du descripteur, ni plus ni moins.
     */
    readonly niveaux: Partial<Record<Niveau, ComponentType<CrudComponentProps>>>;
    /**
     * Niveaux propres au workflow, greffés sous un niveau déjà déclaré. Ils
     * peuvent se greffer les uns sur les autres, dans l'ordre de déclaration.
     */
    readonly greffes?: readonly Greffe[];
}

/**
 * Le paramètre d'URL qu'un niveau expose à ses enfants.
 *
 * Règle unique et sans exception dans toute l'application : `formation` donne
 * `:formationId`, `ue` donne `:ueId`. Ces noms sont lus par `useParams` dans
 * les composants terminaux, ils ne peuvent pas changer.
 */
function parametre(segment: string): string {
    return `:${segment}Id`;
}

function cheminEnfant(cheminParent: string, segmentParent: string, segment: string): string {
    return `${cheminParent}/${parametre(segmentParent)}/${segment}`;
}

/**
 * Table des chemins déjà construits, par segment. Un segment déclaré deux fois
 * — les quatre écrans de notes du workflow note portent tous le segment
 * `note` — devient ambigu : il ne peut plus servir de parent, et on le dit
 * plutôt que d'en résoudre un au hasard.
 */
class Chemins {
    private readonly table = new Map<string, string | null>();

    enregistrer(segment: string, chemin: string): void {
        this.table.set(segment, this.table.has(segment) ? null : chemin);
    }

    estDeclare(segment: string): boolean {
        return this.table.has(segment);
    }

    resoudre(segment: string, workflow: string): string {
        const chemin = this.table.get(segment);
        if (chemin === undefined) {
            throw new Error(
                `Workflow ${workflow} : le niveau parent « ${segment} » n'est pas déclaré.`,
            );
        }
        if (chemin === null) {
            throw new Error(
                `Workflow ${workflow} : le segment « ${segment} » est déclaré plusieurs fois, `
                + `il ne peut pas servir de parent.`,
            );
        }
        return chemin;
    }
}

/**
 * Les routes d'un workflow : la descente hiérarchique décrite par son
 * descripteur, puis ses greffes propres.
 */
export function creerRoutesHierarchie(
    descripteur: DescripteurWorkflow,
    configuration: ConfigurationRoutes,
) {
    const chemins = new Chemins();
    const routes: (ReturnType<typeof createCrudRoutes> | ReturnType<typeof createRoute>)[] = [];

    let cheminPrecedent: string | null = null;
    let segmentPrecedent: string | null = null;

    for (const niveau of descripteur.niveaux) {
        const composant = configuration.niveaux[niveau];
        if (composant === undefined) {
            throw new Error(
                `Workflow ${descripteur.id} : aucun composant configuré pour le niveau « ${niveau} ».`,
            );
        }

        const chemin: string = cheminPrecedent === null || segmentPrecedent === null
            ? niveau
            : cheminEnfant(cheminPrecedent, segmentPrecedent, niveau);

        chemins.enregistrer(niveau, chemin);
        routes.push(createCrudRoutes(chemin, composant));

        cheminPrecedent = chemin;
        segmentPrecedent = niveau;
    }

    for (const greffe of configuration.greffes ?? []) {
        const cheminParent = chemins.resoudre(greffe.parent, descripteur.id);
        const chemin = cheminEnfant(cheminParent, greffe.parent, greffe.segment);

        chemins.enregistrer(greffe.segment, chemin);
        routes.push(
            'ecran' in greffe
                ? createRoute(chemin, greffe.ecran)
                : createCrudRoutes(chemin, greffe.composant),
        );
    }

    // Garde-fou contre la divergence que ce module est censé supprimer : un
    // écran terminal annoncé par le descripteur — donc atteignable par la
    // navigation et la barre de workflows — doit exister comme route.
    for (const ecran of descripteur.ecransTerminaux) {
        if (!chemins.estDeclare(ecran)) {
            throw new Error(
                `Workflow ${descripteur.id} : l'écran terminal « ${ecran} » n'a aucune route.`,
            );
        }
    }

    return routes;
}
