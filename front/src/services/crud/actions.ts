/**
 * Les actions de ligne des listes CRUD, déclarées et non plus dessinées.
 *
 * Chaque écran décrivait auparavant sa colonne d'actions en JSX — `Box` +
 * `Tooltip` + `IconButton` recomposés à la main, parfois par des composants à
 * hooks définis dans les fichiers de routes. Les icônes s'accumulaient sans
 * texte, quatre d'entre elles étaient quatre variantes du même document à
 * lignes, et leur sens ne se révélait qu'au survol — qui n'existe pas au
 * tactile.
 *
 * Un écran déclare désormais *ce que* la ligne permet ; `List.tsx` décide seul
 * *comment* l'afficher : une action directe, puis un menu à libellés textuels.
 * L'écran ne voit ni `useNavigate`, ni `useCrudContext`, ni un chemin d'URL.
 */

import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';

/** Le composant d'icône lui-même, jamais un élément JSX : aucun rendu ici. */
export type IconeAction = ComponentType<SvgIconProps>;

interface ActionLigneCommune<D extends FieldValues> {
    /** Clé stable : `key` React et repère de test. Unique dans un écran. */
    readonly id: string;
    /**
     * Libellé textuel, en toutes lettres. « Gérer les groupes ».
     *
     * Fermeture obligatoire dès que l'action est créée au chargement d'un
     * module (les `actionsLigne` des `routes.tsx`, figées dans le routeur) :
     * une chaîne y serait résolue une seule fois, dans la langue de
     * démarrage, et ne suivrait plus la bascule de langue. Une action créée
     * au rendu (avec le `t` du composant) reste une chaîne simple.
     */
    readonly libelle: string | (() => string);
    /** Icône du menu, et de l'action directe — obligatoire pour celle-ci. */
    readonly icone?: IconeAction;
    /**
     * L'entrée exige le droit d'écriture de l'écran. Sans ce droit elle est
     * absente : ni grisée, ni en échec. L'interface reflète les droits, elle
     * ne les impose pas — c'est le rôle du serveur.
     */
    readonly exigeEcriture?: boolean;
    /** Condition d'affichage ligne à ligne. Absente : toujours affichée. */
    readonly estVisible?: (ligne: D) => boolean;
    /** Rejetée en fin de menu, derrière un séparateur, en couleur d'erreur. */
    readonly destructive?: boolean;
    /**
     * Promue hors du menu, en bouton direct. Une seule par écran ; à défaut,
     * « Voir » l'est. Exige une icône : le bouton direct n'affiche que ça.
     */
    readonly directe?: boolean;
}

/** Action de navigation : la cible se déduit de la ligne et du `rootPath`. */
export interface ActionNavigation<D extends FieldValues> extends ActionLigneCommune<D> {
    /**
     * Dernier segment d'URL visé, sous l'identifiant de la ligne :
     * `${rootPath}/${id}/${segment}`. Vide, la ligne elle-même.
     */
    readonly segment: string;
}

/** Action locale à l'écran : ouvrir une modale, déclencher un import… */
export interface ActionRappel<D extends FieldValues> extends ActionLigneCommune<D> {
    readonly onSelect: (ligne: D) => void;
}

export type ActionLigne<D extends FieldValues> = ActionNavigation<D> | ActionRappel<D>;

export function estNavigation<D extends FieldValues>(
    action: ActionLigne<D>,
): action is ActionNavigation<D> {
    return 'segment' in action;
}

/** Le libellé d'une action, résolu au rendu — la langue active au moment où on l'affiche. */
export function libelleAction<D extends FieldValues>(action: ActionLigne<D>): string {
    return typeof action.libelle === 'function' ? action.libelle() : action.libelle;
}

/** Chemin visé par une action de navigation. `rootPath` porte déjà son `/`. */
export function cibleAction<D extends FieldValues>(
    action: ActionNavigation<D>,
    rootPath: string,
    id: number,
): string {
    const base = `${rootPath}/${String(id)}`;
    return action.segment === '' ? base : `${base}/${action.segment}`;
}

/** Stable, contrairement au libellé : sert à repérer l'action « Voir » sans traduction. */
export const ID_ACTION_VOIR = 'voir';

/**
 * Les deux actions que `List.tsx` ajoute à tous les écrans. Des fonctions et
 * non des constantes : leur libellé suit la langue active à chaque appel,
 * plutôt que de se figer sur celle en cours au chargement du module.
 */
function actionVoir<D extends FieldValues>(t: TFunction<'crud'>): ActionNavigation<D> {
    return {
        id: ID_ACTION_VOIR,
        libelle: t('actions.voir', { ns: 'crud' }),
        icone: VisibilityIcon,
        segment: '',
    };
}

function actionEditer<D extends FieldValues>(t: TFunction<'crud'>): ActionNavigation<D> {
    return {
        id: 'editer',
        libelle: t('actions.editer', { ns: 'crud' }),
        icone: EditIcon,
        segment: 'edit',
        exigeEcriture: true,
    };
}

/**
 * Les actions retenues pour une ligne, dans l'ordre stable d'un écran à
 * l'autre : Voir, Éditer, les navigations métier dans l'ordre déclaré, puis
 * les actions destructives.
 */
export function actionsDeLaLigne<D extends FieldValues>(
    declarees: readonly ActionLigne<D>[],
    ligne: D,
    ecritureAutorisee: boolean,
    t: TFunction<'crud'>,
): ActionLigne<D>[] {
    const metier = declarees.filter(
        action => (!action.exigeEcriture || ecritureAutorisee)
            && (action.estVisible?.(ligne) ?? true),
    );

    const ordonnees: ActionLigne<D>[] = [
        actionVoir<D>(t),
        ...(ecritureAutorisee ? [actionEditer<D>(t)] : []),
        ...metier,
    ];

    // Tri stable : seules les destructives bougent, en queue de liste.
    return ordonnees.sort(
        (a, b) => Number(a.destructive ?? false) - Number(b.destructive ?? false),
    );
}
