import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { Crud } from '../../services/crud/Crud';
import { useWatch, type Control } from 'react-hook-form';
import { ChampDate } from '../../services/ChampDate';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { ChampInterrupteur, ChampSelection } from '../../services/ChampChoix';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ECHELLE_KEYS } from './service';
import { useRootPath } from '../../services/crud/useRootPath';
import { promotionSchema, type Promotion, createPromotionRepository, ACTION_OPTIONS, promotionEntite } from './entites/promotion';
import { ACTION_LIVRET } from '../syllabus/entites/syllabus';
import { ACTION_REFERENTIEL } from '../syllabus/entites/competences';

export type { Promotion } from './entites/promotion';

/**
 * Conversion tableau (API) → chaîne (saisie) : l'API livre les échelles en
 * nombres, le formulaire les édite en `a=4,b=3,…` et le schéma accepte les
 * deux formes. La chaîne en cours de frappe passe telle quelle.
 */
function formaterEchelle(valeur: unknown): unknown {
    return Array.isArray(valeur)
        ? valeur.map((seuil: unknown, indice) => `${ECHELLE_KEYS[indice] ?? ''}=${String(seuil)}`).join(',')
        : valeur;
}

/**
 * Le gabarit de création (16 septembre 2026) : une promotion existante de la
 * même formation, dont la structure et le contenu syllabus sont copiés par
 * le serveur. Les promotions viennent du repository, sous sa clé — la liste
 * d'où l'on arrive est déjà en cache (invariant 2). Rendu en création seule.
 */
function ChampGabarit({ control, formationId }: { control: Control<Promotion>; formationId: string }) {
    const { t } = useTranslation('structure');
    const repository = useMemo(() => createPromotionRepository(formationId), [formationId]);
    const { data } = useQuery({ queryKey: repository.queryKey, queryFn: repository.fetchAll });
    const options = useMemo(
        () => (data ?? [])
            .map((promotion) => ({ id: String(promotion.id), label: promotion.name }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        [data],
    );
    return (
        <ChampSelection
            name="source_promotion_id"
            control={control}
            label={t('promotion.champGabarit')}
            options={options}
            libelleVide={t('promotion.gabaritAucun')}
            aide={t('promotion.champGabaritAide')}
        />
    );
}

const PromotionFields = ({ control, isReadOnly, mode }: RenderProps<Promotion>) => {
    const matiereEliminatoire = useWatch({ control, name: 'matiere_eliminatoire' });
    const { t } = useTranslation('structure');
    const { formationId } = useParams();

    return <>
        <ChampTexte name="name" control={control} label={t('promotion.champTitre')} disabled={isReadOnly} />
        {mode === 'create' && formationId !== undefined && <ChampGabarit control={control} formationId={formationId} />}
        {/* En création, react-hook-form donne `undefined` (le champ est
            absent d'`emptyValue`) : le garde qui empêche la date du jour de
            se pré-remplir vit dans `ChampDate`, une fois pour toutes. */}
        <ChampDate name="debut" control={control} label={t('commun.dateDebut')} disabled={isReadOnly} />
        <ChampDate name="fin" control={control} label={t('commun.dateFin')} disabled={isReadOnly} />

        <ChampTexte
            name="echelle_gpa"
            control={control}
            label={t('promotion.champEchelleGpa')}
            disabled={isReadOnly}
            formater={formaterEchelle}
        />

        <ChampTexte
            name="echelle"
            control={control}
            label={t('promotion.champEchelle')}
            disabled={isReadOnly}
            formater={formaterEchelle}
        />

        <ChampNombre
            name="bareme"
            control={control}
            label={t('promotion.champBareme')}
            disabled={isReadOnly}
            aide={t('promotion.baremeAide')}
            step="0.01"
            min={0}
        />

        <ChampInterrupteur
            name="matiere_eliminatoire"
            control={control}
            label={t('promotion.champMatiereEliminatoire')}
            disabled={isReadOnly}
        />

        {matiereEliminatoire && (
            <ChampNombre
                name="value_matiere_eliminatoire"
                control={control}
                label={t('promotion.champNoteEliminatoire')}
                disabled={isReadOnly}
                step="0.01"
            />
        )}
    </>
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function promotionColonnes(t: TFunction<'structure'>): ColumnDef<Promotion>[] {
    return [
        {
            accessorKey: 'id',
            header: t('commun.id'),
        },
        {
            accessorKey: 'version',
            header: t('commun.version'),
        },
        {
            accessorKey: 'name',
            header: t('commun.nom'),
        },
        {
            accessorKey: 'debut',
            header: t('commun.debut'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },

        {
            accessorKey: 'fin',
            header: t('commun.fin'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },

    ];
}

function createPromotionViewConfig(formationId: string, t: TFunction<'structure'>): ViewConfig<Promotion> {
    return {
        schema: promotionSchema,
        emptyValue: { id: -1, version: -1, formation_id: parseInt(formationId), bareme: 20 },
        colonnes: promotionColonnes(t),
        render: PromotionFields,
    }
}

export function CrudPromotion({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Promotion>) {

    const { formationId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');
    const { t: tSyllabus } = useTranslation('syllabus');

    // Actions par défaut de la ligne, créées au rendu avec `t` — jamais au
    // chargement d'un module de routes (défaut de langue consigné). Le
    // référentiel de compétences (lot 3, porté par la promotion) et le livret
    // syllabus (lot 5) s'y ajoutent.
    const datasource = useMemo((): Datasource<Promotion> | null => formationId ? ({
        ...createPromotionRepository(formationId),
        ...createPromotionViewConfig(formationId, tStructure),
        ...promotionEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_OPTIONS(t), ACTION_REFERENTIEL(tSyllabus), ACTION_LIVRET(tSyllabus)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [formationId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure, tSyllabus]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('promotion.erreurFormationIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
