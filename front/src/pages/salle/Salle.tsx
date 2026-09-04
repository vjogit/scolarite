import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { Crud } from '../../services/crud/Crud';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { ChampSelection } from '../../services/ChampChoix';
import { ENDPOINT_SALLE, SALLE, typeSalleOptions } from './def';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

const salleSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    capacite: z.number().min(0, { error: messageValidation('capaciteDoitEtrePositive') }),
    equipement: z.string().nullish(),
    type_salle: z.string().nullish(),
    batiment: z.string().nullish(),
});

export type Salle = z.infer<typeof salleSchema>;

// Premier écran passé aux champs partagés (lot 13) : `ChampNombre` remet un
// nombre au schéma — la création échouait en validation du temps de
// `register('capacite')` sans `valueAsNumber` (lot 7 §8).
const SalleFields = ({ control, isReadOnly }: RenderProps<Salle>) => {
    const { t } = useTranslation('salle');
    return (
        <>
            <ChampTexte name="name" control={control} label={t('champs.nom')} disabled={isReadOnly} />
            <ChampNombre name="capacite" control={control} label={t('champs.capacite')} disabled={isReadOnly} min={0} />
            <ChampSelection
                name="type_salle"
                control={control}
                label={t('champs.typeSalle')}
                disabled={isReadOnly}
                options={typeSalleOptions(t)}
                libelleVide="—"
            />
            <ChampTexte name="batiment" control={control} label={t('champs.batiment')} disabled={isReadOnly} />
            <ChampTexte name="equipement" control={control} label={t('champs.equipement')} disabled={isReadOnly} multiline rows={2} />
        </>
    );
};

// Premier écran passé au nouveau socle (lot 7) : colonnes au format TanStack
// nu — `cell` remplace `Cell`, le reste est inchangé.
function salleColonnes(t: TFunction<'salle'>): ColumnDef<Salle>[] {
    return [
        { accessorKey: 'id', header: t('colonnes.id') },
        { accessorKey: 'version', header: t('colonnes.version') },
        { accessorKey: 'name', header: t('champs.nom') },
        { accessorKey: 'capacite', header: t('champs.capacite') },
        {
            accessorKey: 'type_salle',
            header: t('colonnes.type'),
            cell: ({ cell }) => {
                const val = cell.getValue<string | null>();
                return typeSalleOptions(t).find((o) => o.id === val)?.label ?? val ?? '—';
            },
        },
        { accessorKey: 'batiment', header: t('champs.batiment') },
        { accessorKey: 'equipement', header: t('champs.equipement') },
    ];
}

function salleViewConfig(t: TFunction<'salle'>): ViewConfig<Salle> {
    return {
        schema: salleSchema,
        emptyValue: { id: -1, version: 0, name: '', capacite: 1, equipement: null, type_salle: null, batiment: null },
        colonnes: salleColonnes(t),
        render: SalleFields,
    };
}

const salleDatasourceBase = createRepository<Salle>({
    endpoint: ENDPOINT_SALLE,
    queryKey: [SALLE],
    getId: (data: Salle) => data.id,
});

export function CrudSalle({ mode, workflow, isAction, isTopToolbar }: CrudProps<Salle>) {
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tSalle } = useTranslation('salle');

    const datasource = useMemo((): Datasource<Salle> => ({
        ...salleDatasourceBase,
        ...salleViewConfig(tSalle),
        title: tCrud('entites.salle.title'),
        roleEcriture: Role.SALLES_ECRITURE,
        entityLabel: tCrud('entites.salle.nom'),
        entityLabelAvecArticle: tCrud('entites.salle.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.salle.nomPluriel'),
        entityGender: 'f',
        isAction,
        isTopToolbar,
    }), [isAction, isTopToolbar, tCrud, tSalle]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
