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
function actionCreer(segment: string, enfant: DescriptionEntite): ActionNavigation<FieldValues> {
    return {
        id: `creer-${segment}`,
        libelle: libelleCreation(enfant),
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
     * son rôle d'écriture. Le niveau racine ignore l'identifiant reçu.
     */
    readonly entite: (identifiantParent: string) => EntiteCrud<FieldValues>;
    /**
     * Actions déclarées du niveau, dans l'ordre voulu. « Voir » et « Éditer »
     * sont ajoutés par `actionsDeLaLigne`, la suppression par le bandeau qui
     * détient la modale : les déclarer ici serait les redoubler.
     */
    readonly actions: readonly ActionLigne<FieldValues>[];
}

const ENTITE_FORMATION = entite(formationRepository, formationEntite);
const entitePromotion = (formationId: string) => entite(createPromotionRepository(formationId), promotionEntite);
const entiteOption = (promotionId: string) => entite(createOptionRepository(promotionId), optionEntite);
const entitePeriode = (optionId: string) => entite(createPeriodeRepository(optionId), periodeEntite);
const entiteUe = (periodeId: string) => entite(createUeRepository(periodeId), ueEntite);
const entiteMatiere = (ueId: string) => entite(createMatiereRepository(ueId), matiereEntite);
const entiteGroupe = (optionId: string) => entite(createGroupeRepository(optionId), groupeEntite);

const CREER_PROMOTION = actionCreer(PROMOTION, promotionEntite);
const CREER_OPTION = actionCreer(OPTION, optionEntite);
const CREER_PERIODE = actionCreer(PERIODE, periodeEntite);
const CREER_UE = actionCreer(UES, ueEntite);
const CREER_MATIERE = actionCreer(MATIERE, matiereEntite);
const CREER_GROUPE = actionCreer(GROUPE, groupeEntite);
export const CREER_FORMATION = actionCreer(FORMATION, formationEntite);

const NIVEAUX: readonly NiveauArbre[] = [
    {
        segment: FORMATION,
        libelle: 'Formation',
        libellePluriel: 'Formations',
        icone: SchoolIcon,
        enfants: [{ segment: PROMOTION }],
        entite: () => ENTITE_FORMATION,
        actions: [ACTION_PROMOTIONS, CREER_PROMOTION],
    },
    {
        segment: PROMOTION,
        libelle: 'Promotion',
        libellePluriel: 'Promotions',
        icone: ClassIcon,
        enfants: [{ segment: OPTION }],
        entite: entitePromotion,
        actions: [ACTION_OPTIONS, CREER_OPTION],
    },
    {
        segment: OPTION,
        libelle: 'Option',
        libellePluriel: 'Options',
        icone: AltRouteIcon,
        enfants: [{ segment: PERIODE }, { segment: GROUPE, categorie: 'Groupes' }],
        entite: entiteOption,
        actions: [ACTION_PERIODES, CREER_PERIODE, ACTION_GROUPES, CREER_GROUPE],
    },
    {
        segment: PERIODE,
        libelle: 'Période',
        libellePluriel: 'Périodes',
        icone: DateRangeIcon,
        enfants: [{ segment: UES }],
        entite: entitePeriode,
        actions: [ACTION_UES, CREER_UE],
    },
    {
        segment: UES,
        libelle: 'UE',
        libellePluriel: 'UE',
        icone: MenuBookIcon,
        enfants: [{ segment: MATIERE }],
        entite: entiteUe,
        actions: [ACTION_MATIERES, CREER_MATIERE],
    },
    {
        segment: MATIERE,
        libelle: 'Matière',
        libellePluriel: 'Matières',
        icone: SubjectIcon,
        enfants: [],
        entite: entiteMatiere,
        actions: [],
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
        actions: [ACTION_MEMBRES],
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
