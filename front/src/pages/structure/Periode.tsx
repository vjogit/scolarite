import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import { ChampDate } from '../../services/ChampDate';
import { ChampTexte } from '../../services/ChampTexte';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { periodeSchema, type Periode, createPeriodeRepository, ACTION_UES, periodeEntite } from './entites/periode';

export type { Periode } from './entites/periode';

const PeriodeFields = ({ control, isReadOnly }: RenderProps<Periode>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <ChampTexte name="name" control={control} label={t('periode.champNom')} disabled={isReadOnly} />

            {/* En création, react-hook-form donne `undefined` (le champ est
                absent d'`emptyValue`) : le garde qui empêche la date du jour
                de se pré-remplir vit dans `ChampDate`. */}
            <ChampDate name="debut" control={control} label={t('commun.dateDebut')} disabled={isReadOnly} />
            <ChampDate name="fin" control={control} label={t('commun.dateFin')} disabled={isReadOnly} />
        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function periodeColonnes(t: TFunction<'structure'>): ColumnDef<Periode>[] {
    return [
        { accessorKey: 'id', header: t('commun.id') },
        { accessorKey: 'version', header: t('commun.version') },
        { accessorKey: 'name', header: t('commun.nom') },
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

function createPeriodeViewConfig(optionId: string, t: TFunction<'structure'>): ViewConfig<Periode> {
    return {
        schema: periodeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        colonnes: periodeColonnes(t),
        render: PeriodeFields,
    }
}

export function CrudPeriode({ mode, workflow, isAction, isTopToolbar, actionsLigne, actionsBarreOutils, isReadOnly }: CrudProps<Periode>) {

    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Periode> | null => optionId ? ({
        ...createPeriodeRepository(optionId),
        ...createPeriodeViewConfig(optionId, tStructure),
        ...periodeEntite(t),
        isAction,
        actionsLigne: actionsLigne ?? [ACTION_UES(t)],
        isTopToolbar,
        actionsBarreOutils,
        isReadOnly,
    }) : null, [optionId, isAction, isTopToolbar, actionsLigne, actionsBarreOutils, isReadOnly, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('periode.erreurOptionIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
