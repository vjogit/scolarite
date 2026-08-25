import type { QueryKey } from '@tanstack/react-query';
import type { Control, DefaultValues, FieldErrors, FieldValues, UseFormGetValues, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type { JSX } from 'react';
import type { MRT_ColumnDef, MRT_TableInstance } from 'material-react-table';
import type { ZodType } from 'zod';
import { isAxiosError } from 'axios';
import { apiInstance } from '../api';
import type { ActionLigne } from './actions';

export type CrudMode = 'create' | 'show' | 'edit' | 'list';

export interface CrudProps<D extends FieldValues> {
    mode: CrudMode
    workflow: string;
    isAction: boolean
    isReadOnly?: boolean
    /** Actions de ligne propres à l'écran. « Voir » et « Éditer » sont ajoutés
     *  par la liste : les déclarer ici serait les redoubler. */
    actionsLigne?: readonly ActionLigne<D>[]
    isTopToolbar: boolean
    renderTopToolbarCustomActions?: (props: { table: MRT_TableInstance<D>, defaultActions: React.ReactNode, peutEcrire: boolean }) => React.ReactNode
}

export interface RenderProps<D extends FieldValues> {
    register: UseFormRegister<D>
    control: Control<D>
    errors: FieldErrors<D>
    isReadOnly: boolean
    getValues: UseFormGetValues<D>
    setValue: UseFormSetValue<D>
}

/** Objet directement visé par une suppression. */
export interface DeleteImpactItem {
    id: number;
    name: string;
}

/** Décompte de descendants pour une entité, libellé déjà accordé en nombre. */
export interface DeleteImpactEntry {
    entity: string;
    label: string;
    count: number;
}

/** Raison métier interdisant la suppression. */
export interface DeleteImpactBlocking {
    reason: string;
    message: string;
}

/** Réponse de l'endpoint d'analyse d'impact (POST .../delete-impact). */
export interface DeleteImpact {
    items: DeleteImpactItem[];
    /** Entités réellement supprimées en cascade, ordre hiérarchique, compte > 0. */
    cascade: DeleteImpactEntry[];
    /** Objets conservés mais dont la référence est mise à NULL. */
    detached: DeleteImpactEntry[];
    /** Non vide : la suppression doit être refusée. */
    blocking: DeleteImpactBlocking[];
}

export interface Repository<D extends FieldValues> {
    queryKey: QueryKey;
    getId: (data: D) => number;
    /** Libellé lisible de l'objet, utilisé par la modale de suppression. */
    getName: (data: D) => string;
    update: (data: D) => Promise<D>;
    create: (data: D) => Promise<D>;
    fetch: (id: string) => Promise<D>;
    fetchAll: () => Promise<D[]>;
    delete: (id: number[]) => Promise<{ success: boolean }>;
    /** Absent si l'entité n'expose pas d'endpoint d'analyse d'impact. */
    deleteImpact?: (ids: number[]) => Promise<DeleteImpact>;
}

export interface ViewConfig<D extends FieldValues> {
    /**
     * Le schéma zod du formulaire.
     *
     * `ZodType<D, FieldValues>` : le résolveur de react-hook-form doit savoir
     * ce que la validation produit — un `D` — et ce qu'elle accepte en entrée —
     * les champs bruts du formulaire. Un `any` ici répandait de l'inconnu sur
     * chaque écran, alors que la contrainte tient en deux paramètres.
     */
    schema: ZodType<D, FieldValues>
    emptyValue: DefaultValues<D>;
    columns: MRT_ColumnDef<D>[];
    render: (props: RenderProps<D>) => JSX.Element;
}

/**
 * Ce qu'une entité est, indépendamment de l'écran qui l'affiche : ses libellés,
 * son genre, son rôle d'écriture, la nature de sa suppression.
 *
 * Séparé du `Datasource` parce que tout cela vaut hors d'une table. La modale de
 * suppression et les messages d'`entityMessages` n'ont jamais eu besoin de
 * colonnes ni de barre d'outils ; l'arbre de la structure, qui supprime et
 * annonce sans monter aucune liste, ne pouvait pas leur en fournir.
 */
export interface DescriptionEntite {
    title: string
    /** Entité de haut niveau : la modale exige de retaper le nom avant suppression. */
    deleteRequiresNameConfirmation?: boolean
    /**
     * Entité à suppression logique : la suppression est une mise en corbeille
     * restaurable par un administrateur, et la modale le dit. Les entités sans
     * ce marqueur restent en suppression physique, au discours « irréversible ».
     */
    suppressionEnCorbeille?: boolean
    /**
     * Nom nu de l'entité, sans article, ex. "formation" — traduit, utilisé par
     * `entityMessages` pour composer les messages de succès et l'invite de
     * création.
     */
    entityLabel?: string
    /**
     * Le même nom, avec son article défini, ex. "la formation" / "the training
     * program" — pour la seule modale de suppression, dont le titre a besoin
     * d'un article grammaticalement correct (une langue sans accord de genre,
     * comme l'anglais, n'en a pas besoin mais peut le fournir quand même).
     */
    entityLabelAvecArticle?: string
    /** Libellé pluriel sans article, ex. "périodes". À défaut, `title` en minuscules. */
    entityLabelPlural?: string
    /**
     * Genre grammatical de l'entité, pour accorder les messages de succès
     * (« créée » / « créé »). Toujours déclaré explicitement — masculin par
     * défaut si absent, jamais déduit d'un article puisque `entityLabel` n'en
     * porte plus.
     */
    entityGender?: 'm' | 'f'
    /**
     * Rôle d'écriture de l'entité, aligné sur la route serveur qu'elle frappe —
     * jamais sur le workflow qui l'affiche. Absent : aucune écriture possible,
     * le défaut des écrans purement calculés.
     */
    roleEcriture?: string
}

/**
 * Le minimum pour lire, supprimer et nommer une entité : ce que réclament la
 * modale de suppression, les messages de succès et le test de droit d'écriture.
 * Tout `Datasource` en est un.
 */
export type EntiteCrud<D extends FieldValues> = Repository<D> & DescriptionEntite;

/**
 * Ce dont une liste a besoin, et rien de plus : la collection, ses libellés,
 * ses colonnes, ses actions.
 *
 * Ni `schema`, ni `emptyValue`, ni `render` — `List.tsx` n'en a jamais rien
 * fait, ils n'appartiennent qu'au formulaire. Les séparer donne son contrat à
 * l'écran de consultation : celui qui affiche des valeurs calculées par le
 * serveur n'a aucun formulaire à décrire, puisqu'il n'a aucune route
 * d'écriture. Il ne peut donc plus en décrire un par mégarde.
 */
export interface DatasourceListe<D extends FieldValues> extends Repository<D>, DescriptionEntite {
    columns: MRT_ColumnDef<D>[]
    isAction: boolean
    isReadOnly?: boolean
    /**
     * Actions de ligne propres à l'écran, en plus de « Voir » et « Éditer »
     * que `List.tsx` ajoute partout. La liste compose seule la présentation :
     * une action directe, puis un menu à libellés.
     */
    actionsLigne?: readonly ActionLigne<D>[]
    isTopToolbar: boolean
    renderTopToolbarCustomActions?: (props: { table: MRT_TableInstance<D>, defaultActions: React.ReactNode, peutEcrire: boolean }) => React.ReactNode
}

/** Une liste doublée de son formulaire : le cycle CRUD complet. */
export interface Datasource<D extends FieldValues> extends DatasourceListe<D>, ViewConfig<D> {}

interface RepositoryConfig<D extends FieldValues> {
    endpoint: string;
    queryParams?: string;
    queryKey: QueryKey;
    getId: (data: D) => number;
    /** Par défaut : le champ `name` de l'objet, sinon `#<id>`. */
    getName?: (data: D) => string;
    /** Endpoint d'analyse d'impact. Omis, la modale reste sans décompte. */
    deleteImpactEndpoint?: string;
}

export function createRepository<T extends FieldValues>(
    config: RepositoryConfig<T>
): Repository<T> {
    const endpoint = config.endpoint

    // Par défaut on affiche le champ `name`, présent sur toutes les entités
    // de structure ; à défaut, l'identifiant technique.
    const getName = config.getName ?? ((data: T) => {
        const name: unknown = data.name;
        return typeof name === 'string' && name.length > 0 ? name : `#${config.getId(data)}`;
    });

    const deleteImpactEndpoint = config.deleteImpactEndpoint;

    return {
        queryKey: config.queryKey,
        getId: config.getId,
        getName,

        // Analyse d'impact avant suppression : uniquement si l'entité
        // expose l'endpoint correspondant côté serveur.
        ...(deleteImpactEndpoint ? {
            deleteImpact: async (ids: number[]): Promise<DeleteImpact> => {
                try {
                    const rep = await apiInstance.post<DeleteImpact>(deleteImpactEndpoint, { ids });
                    return rep.data;
                } catch (error) {
                    throw handleAxiosError(error);
                }
            },
        } : {}),

        // Récupérer tous les éléments
        fetchAll: async () => {
            try {
                const url = config.queryParams ? `${endpoint}${config.queryParams}` : endpoint;
                const rep = await apiInstance.get<T[]>(url);
                return rep.data
            } catch (error: unknown) {
                throw handleAxiosError(error);
            }
        },

        // Récupérer un élément par ID
        fetch: async (id) => {
            try {
                const rep = await apiInstance.get<T>(`${endpoint}/${id}`);
                return rep.data
            } catch (error: unknown) {
                throw handleAxiosError(error);
            }

        },

        // Créer
        create: async (data) => {
            try {
                const rep = await apiInstance.post<T>(endpoint, data);
                return rep.data
            } catch (error: unknown) {
                throw handleAxiosError(error);
            }
        },

        // Mettre à jour
        update: async (data) => {
            try {
                const id = config.getId(data);
                const rep = await apiInstance.put<T>(`${endpoint}/${id}`, data);
                return rep.data
            } catch (error: unknown) {
                throw handleAxiosError(error);
            }
        },

        // Supprimer (Bulk)
        delete: async (ids: (string | number)[]) => {
            try {
                const rep = await apiInstance.delete<{ success: boolean }>(`${endpoint}/bulk`, { data: { ids } });
                return rep.data
            } catch (error: unknown) {
                throw handleAxiosError(error);
            }
        },
    };
}

/**
 * Helper pour transformer les erreurs Axios en votre format ApiError
 * compatible avec votre backend Go
 */
export function handleAxiosError(error: unknown) {
    // `unknown` plutôt que `any` : c'est le seul endroit qui interroge la forme
    // d'une erreur, et `isAxiosError` est le test que fournit la bibliothèque.
    // Le typer ici évite que chaque `catch` du projet ait à le refaire.
    if (isAxiosError(error) && error.response) {
        // Seul un corps application/problem+json est une enveloppe formée :
        // c'est ce qui distingue structurellement une erreur du serveur d'un
        // HTML de proxy ou d'un backend coupé derrière nginx. Sans enveloppe,
        // le payload reste vide et l'affichage retombe sur le message
        // générique — jamais sur un extrait du corps.
        const contentType = String(error.response.headers['content-type'] ?? '');
        if (contentType.includes('application/problem+json')) {
            return new ApiError(error.response.status, error.response.data as ErrorResponse);
        }
        return new ApiError(error.response.status, undefined);
    }
    return new Error("Erreur réseau ou serveur injoignable");
}


export class ApiError extends Error {
    payload: ErrorResponse | undefined;
    status: number;
    constructor(status: number, payload?: ErrorResponse) {
        super('API Error');
        this.status = status;
        this.payload = payload;
    }

    static async fromResponse(response: Response): Promise<ApiError> {
        const errorBody = await response.json() as ErrorResponse;
        return new ApiError(response.status, errorBody);
    }
}

/**
 * Corps d'erreur RFC 9457 (application/problem+json). `code` est le membre
 * d'extension sur lequel le front route ; les autres extensions (`errors`,
 * `lignes`, `reason`, `instance`…) sont lues par errorMessages.ts.
 */
export interface ErrorResponse {
    type?: string
    title?: string
    status?: number
    detail?: string
    instance?: string
    code: string
    [extension: string]: unknown
}
