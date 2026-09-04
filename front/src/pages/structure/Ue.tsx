import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { ChampInterrupteur } from '../../services/ChampChoix';
import { ueSchema, type Ue, createUeRepository, ACTION_MATIERES, ueEntite } from './entites/ue';

export type { Ue } from './entites/ue';

const UeFields = ({ control, isReadOnly }: RenderProps<Ue>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <ChampTexte name="name" control={control} label={t('ue.champNom')} disabled={isReadOnly} />
            <ChampNombre name="ects" control={control} label="ECTS" disabled={isReadOnly} />
            <ChampInterrupteur name="academique" control={control} label={t('ue.champAcademique')} disabled={isReadOnly} />
        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function ueColonnes(t: TFunction<'structure'>): ColumnDef<Ue>[] {
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
            accessorKey: 'ects',
            header: 'ECTS',
        },
        {
            accessorKey: 'academique',
            header: t('ue.champAcademique'),
            cell: ({ cell }) => cell.getValue<boolean>() ? t('commun.oui') : t('commun.non'),
        },
    ];
}

function createUeViewConfig(periodeId: string, t: TFunction<'structure'>): ViewConfig<Ue> {
    return {
        schema: ueSchema,
        emptyValue: { id: -1, version: -1, academique: true, periode_id: parseInt(periodeId) },
        colonnes: ueColonnes(t),
        render: UeFields,
    }
}

export function CrudUe({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Ue>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Ue> | null => periodeId ? ({
        ...createUeRepository(periodeId),
        ...createUeViewConfig(periodeId, tStructure),
        ...ueEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_MATIERES(t)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [periodeId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('ue.erreurPeriodeIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
