import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useWatch } from 'react-hook-form';
import { ChampDate } from '../../services/ChampDate';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { ChampInterrupteur } from '../../services/ChampChoix';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ECHELLE_KEYS } from './service';
import { useRootPath } from '../../services/crud/useRootPath';
import { promotionSchema, type Promotion, createPromotionRepository, ACTION_OPTIONS, promotionEntite } from './entites/promotion';

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

const PromotionFields = ({ control, isReadOnly }: RenderProps<Promotion>) => {
    const matiereEliminatoire = useWatch({ control, name: 'matiere_eliminatoire' });
    const { t } = useTranslation('structure');

    return <>
        <ChampTexte name="name" control={control} label={t('promotion.champTitre')} disabled={isReadOnly} />
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

    const datasource = useMemo((): Datasource<Promotion> | null => formationId ? ({
        ...createPromotionRepository(formationId),
        ...createPromotionViewConfig(formationId, tStructure),
        ...promotionEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_OPTIONS(t)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [formationId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('promotion.erreurFormationIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
