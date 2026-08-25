/**
 * Ce que l'arbre de la structure sait de chaque niveau.
 *
 * Rien n'est redéfini ici : chaque niveau réutilise le repository que la liste
 * CRUD correspondante emploie déjà, avec sa clé de requête à l'identique, et la
 * description d'entité que son écran étale dans son `Datasource`. C'est ce qui
 * fait que déplier un nœud dont la liste a déjà été affichée ne coûte aucune
 * requête — TanStack Query sert la même entrée de cache — et que la modale de
 * suppression y trouve les mêmes libellés qu'ailleurs.
 *
 * Corollaire, le même que dans `freres.ts` : la fonction de requête doit rester
 * celle du repository, mot pour mot. Une variante qui projetterait déjà les
 * nœuds écrirait une forme de donnée étrangère sous une clé partagée et
 * corromprait la liste. La projection se fait en aval, par `select`.
 */

import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import DateRangeIcon from '@mui/icons-material/DateRange';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SubjectIcon from '@mui/icons-material/Subject';
import GroupsIcon from '@mui/icons-material/Groups';
import AddBoxIcon from '@mui/icons-material/AddBox';

import type { ActionLigne, ActionNavigation, IconeAction } from '../../../services/crud/actions';
import type { DescriptionEntite, EntiteCrud, Repository } from '../../../services/crud/def';
import { libelleCreation } from '../../../services/crud/entityMessages';

import { FORMATION, GROUPE, MATIERE, OPTION, PERIODE, PROMOTION, UES } from '../def';
import { ACTION_PROMOTIONS, formationEntite, formationRepository } from '../entites/formation';
import { ACTION_OPTIONS, createPromotionRepository, promotionEntite } from '../entites/promotion';
import { ACTION_GROUPES, ACTION_PERIODES, createOptionRepository, optionEntite } from '../entites/option';
import { ACTION_UES, createPeriodeRepository, periodeEntite } from '../entites/periode';
import { ACTION_MATIERES, createUeRepository, ueEntite } from '../entites/ue';
import { createMatiereRepository, matiereEntite } from '../entites/matiere';
import { ACTION_MEMBRES, createGroupeRepository, groupeEntite } from '../entites/groupe';

/**
 * Repository débarrassé du type de son entité : tous les niveaux doivent tenir
 * dans une même variable. Les transtypages sont sûrs et locaux, par le même
 * argument que dans `freres.ts` — les fonctions enveloppées sont celles de ce
 * repository, donc ce qu'elles reçoivent est bien un `D`. Il n'y a pas d'autre
 * manière d'effacer le type sans perdre la contravariance de `getId` et
 * `getName`.
 */
function effacer<D extends FieldValues>(repository: Repository<D>): Repository<FieldValues> {
    return {
        queryKey: repository.queryKey,
        getId: donnee => repository.getId(donnee as D),
        getName: donnee => repository.getName(donnee as D),
        update: donnee => repository.update(donnee as D),
        create: donnee => repository.create(donnee as D),
        fetch: repository.fetch,
        fetchAll: repository.fetchAll,
        delete: repository.delete,
        deleteImpact: repository.deleteImpact,
    };
}

function entite<D extends FieldValues>(
    repository: Repository<D>,
    description: DescriptionEntite,
): EntiteCrud<FieldValues> {
    return { ...effacer(repository), ...description };
}

/**
 * L'action de création d'un enfant. Son libellé est celui qu'`entityMessages`
 * compose déjà pour l'invite des listes vides et le bouton « Ajouter » : les
 * trois mènent au même formulaire, ils portent donc le même nom.
 */
function actionCreer(segment: string, enfant: DescriptionEntite, t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: `creer-${segment}`,
        libelle: libelleCreation(enfant, t),
        icone: AddBoxIcon,
        segment: `${segment}/new`,
        exigeEcriture: true,
    };
}

/** Un enfant d'un niveau, tel que l'arbre le déplie. */
export interface EnfantArbre {
    readonly segment: string;
    /**
     * Rendu comme un dossier nommé plutôt qu'en fratrie directe. Les groupes
     * sont la seule branche annexe de la hiérarchie : sous une option ils
     * cohabitent avec les périodes, et sans dossier les deux collections
     * seraient indiscernables.
     */
    readonly categorie?: string;
}

export interface NiveauArbre {
    readonly segment: string;
    readonly libelle: string;
    readonly libellePluriel: string;
    readonly icone: IconeAction;
    readonly enfants: readonly EnfantArbre[];
    /**
     * L'entité du niveau : sa collection filtrée par le parent, ses libellés,
     * son rôle d'écriture. Le niveau racine ignore l'identifiant reçu. `t`
     * optionnel — cf. `actions` ci-dessous.
     */
    readonly entite: (identifiantParent: string, t?: TFunction<'crud'>) => EntiteCrud<FieldValues>;
    /**
     * Actions déclarées du niveau, dans l'ordre voulu. « Voir » et « Éditer »
     * sont ajoutés par `actionsDeLaLigne`, la suppression par le bandeau qui
     * détient la modale : les déclarer ici serait les redoubler.
     *
     * Fonction et non tableau figé : les libellés viennent d'i18next, et
     * `NIVEAUX` est construit une seule fois au chargement du module — sans
     * ça, ils gèleraient dans la langue active à cet instant. Appeler sans
     * `t` reste correct (relit l'instance i18next globale) mais ne rend pas
     * l'appelant réactif à un changement de langue en cours de session ; les
     * quelques appelants qui le sont déjà (le bandeau de `StructureLayout`)
     * passent le leur.
     */
    readonly actions: (t?: TFunction<'crud'>) => readonly ActionLigne<FieldValues>[];
}

const entiteFormation = (_identifiantParent: string, t?: TFunction<'crud'>) => entite(formationRepository, formationEntite(t));
const entitePromotion = (formationId: string, t?: TFunction<'crud'>) => entite(createPromotionRepository(formationId), promotionEntite(t));
const entiteOption = (promotionId: string, t?: TFunction<'crud'>) => entite(createOptionRepository(promotionId), optionEntite(t));
const entitePeriode = (optionId: string, t?: TFunction<'crud'>) => entite(createPeriodeRepository(optionId), periodeEntite(t));
const entiteUe = (periodeId: string, t?: TFunction<'crud'>) => entite(createUeRepository(periodeId), ueEntite(t));
const entiteMatiere = (ueId: string, t?: TFunction<'crud'>) => entite(createMatiereRepository(ueId), matiereEntite(t));
const entiteGroupe = (optionId: string, t?: TFunction<'crud'>) => entite(createGroupeRepository(optionId), groupeEntite(t));

/** Le libellé « Créer un/une … » de chaque niveau, calculé sur son entité. */
export function CREER_FORMATION(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return actionCreer(FORMATION, formationEntite(t), t);
}

const NIVEAUX: readonly NiveauArbre[] = [
    {
        segment: FORMATION,
        libelle: 'Formation',
        libellePluriel: 'Formations',
        icone: SchoolIcon,
        enfants: [{ segment: PROMOTION }],
        entite: entiteFormation,
        actions: (t) => [ACTION_PROMOTIONS(t), actionCreer(PROMOTION, promotionEntite(t), t)],
    },
    {
        segment: PROMOTION,
        libelle: 'Promotion',
        libellePluriel: 'Promotions',
        icone: ClassIcon,
        enfants: [{ segment: OPTION }],
        entite: entitePromotion,
        actions: (t) => [ACTION_OPTIONS(t), actionCreer(OPTION, optionEntite(t), t)],
    },
    {
        segment: OPTION,
        libelle: 'Option',
        libellePluriel: 'Options',
        icone: AltRouteIcon,
        enfants: [{ segment: PERIODE }, { segment: GROUPE, categorie: 'Groupes' }],
        entite: entiteOption,
        actions: (t) => [
            ACTION_PERIODES(t), actionCreer(PERIODE, periodeEntite(t), t),
            ACTION_GROUPES(t), actionCreer(GROUPE, groupeEntite(t), t),
        ],
    },
    {
        segment: PERIODE,
        libelle: 'Période',
        libellePluriel: 'Périodes',
        icone: DateRangeIcon,
        enfants: [{ segment: UES }],
        entite: entitePeriode,
        actions: (t) => [ACTION_UES(t), actionCreer(UES, ueEntite(t), t)],
    },
    {
        segment: UES,
        libelle: 'UE',
        libellePluriel: 'UE',
        icone: MenuBookIcon,
        enfants: [{ segment: MATIERE }],
        entite: entiteUe,
        actions: (t) => [ACTION_MATIERES(t), actionCreer(MATIERE, matiereEntite(t), t)],
    },
    {
        segment: MATIERE,
        libelle: 'Matière',
        libellePluriel: 'Matières',
        icone: SubjectIcon,
        enfants: [],
        entite: entiteMatiere,
        actions: () => [],
    },
    {
        // L'affectation d'élèves n'est pas un niveau de structure : elle reste
        // un écran, atteint depuis le bandeau, et le groupe est une feuille.
        segment: GROUPE,
        libelle: 'Groupe',
        libellePluriel: 'Groupes',
        icone: GroupsIcon,
        enfants: [],
        entite: entiteGroupe,
        actions: (t) => [ACTION_MEMBRES(t)],
    },
];

const PAR_SEGMENT = new Map(NIVEAUX.map(niveau => [niveau.segment, niveau]));

/** Le niveau racine de l'arbre : celui dont la collection n'a pas de parent. */
// `NIVEAUX` est construit juste au-dessus et n'est jamais vide ; le dire
// ainsi évite une assertion et casserait à la compilation si on le vidait.
const [RACINE] = NIVEAUX;
if (RACINE === undefined) throw new Error("L'arbre de la structure n'a aucun niveau.");
export const NIVEAU_RACINE: NiveauArbre = RACINE;

export function niveauArbre(segment: string): NiveauArbre | undefined {
    return PAR_SEGMENT.get(segment);
}
