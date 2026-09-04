import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Crud } from '../../services/crud/Crud';
import { useRootPath } from '../../services/crud/useRootPath';
import { ChampTexte } from '../../services/ChampTexte';
import { formationSchema, type Formation, formationRepository, ACTION_PROMOTIONS, formationEntite } from './entites/formation';

export type { Formation } from './entites/formation';

const FormationFields = ({ control, isReadOnly }: RenderProps<Formation>) => {
    const { t } = useTranslation('structure');
    return (
        <ChampTexte name="name" control={control} label={t('formation.champTitre')} disabled={isReadOnly} />
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function formationColonnes(t: TFunction<'structure'>): ColumnDef<Formation>[] {
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
    ];
}

function formationViewConfig(t: TFunction<'structure'>): ViewConfig<Formation> {
    return {
        schema: formationSchema,
        emptyValue: { id: -1, version: -1 },
        colonnes: formationColonnes(t),
        render: FormationFields,
    };
}

export function CrudFormation({ mode, workflow, isAction, isTopToolbar, isReadOnly, actionsLigne, actionsBarreOutils }: CrudProps<Formation>) {

    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Formation> => ({
        ...formationRepository,
        ...formationViewConfig(tStructure),
        ...formationEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_PROMOTIONS(t)],
        isTopToolbar,
        actionsBarreOutils,
    }), [isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
