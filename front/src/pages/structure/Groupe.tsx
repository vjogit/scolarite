import type { ActionsBarreOutilsProps, CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { ChampTexte } from '../../services/ChampTexte';
import { GroupeMultiImportButton } from './GroupeMultiImportButton';
import { groupeSchema, type Groupe, createGroupeRepository, ACTION_MEMBRES, groupeEntite } from './entites/groupe';

export type { Groupe } from './entites/groupe';

const GroupeFields = ({ control, isReadOnly }: RenderProps<Groupe>) => {
    const { t } = useTranslation('structure');
    return (
        <ChampTexte name="name" control={control} label={t('groupe.champNom')} disabled={isReadOnly} />
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function groupeColonnes(t: TFunction<'structure'>): ColumnDef<Groupe>[] {
    return [
        { accessorKey: 'id', header: t('commun.id') },
        { accessorKey: 'version', header: t('commun.version') },
        { accessorKey: 'name', header: t('commun.nom') },
    ];
}

function createGroupeViewConfig(optionId: string, t: TFunction<'structure'>): ViewConfig<Groupe> {
    return {
        schema: groupeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        colonnes: groupeColonnes(t),
        render: GroupeFields,
    };
}

export function CrudGroupe({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Groupe>) {
    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const defaultBarreOutils = useCallback(({ defaultActions, peutEcrire }: ActionsBarreOutilsProps<Groupe>): ReactNode => (
        <div className="flex items-center gap-4">
            {defaultActions}
            {peutEcrire && optionId && <GroupeMultiImportButton optionId={optionId} />}
        </div>
    ), [optionId]);

    const datasource = useMemo((): Datasource<Groupe> | null => optionId ? ({
        ...createGroupeRepository(optionId),
        ...createGroupeViewConfig(optionId, tStructure),
        ...groupeEntite(t),
        isAction,
        isReadOnly,
        isTopToolbar,
        actionsLigne: actionsLigne ?? [ACTION_MEMBRES(t)],
        actionsBarreOutils: actionsBarreOutils ?? defaultBarreOutils,
    }) : null, [optionId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, defaultBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('groupe.erreurOptionIdObligatoire')}</p>
    );

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
