import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { UserSelector } from '../../services/UserSelector';
import { ChampTexte } from '../../services/ChampTexte';
import { ChampInterrupteur, ChampSelection } from '../../services/ChampChoix';
import { ChampDate } from '../../services/ChampDate';
import type { TFunction } from 'i18next';
import { ENDPOINT_MOBILITE } from './def';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

// Valeurs stockées telles quelles en base (pas d'identifiant séparé du
// libellé) : contrairement à `type_salle`, ce champ ne peut pas se traduire à
// l'affichage sans faire diverger la valeur soumise de la donnée existante.
// Laissé en français, hors du périmètre de cette migration.
const TYPE_MOBILITE_OPTIONS = [
    "Stage",
    "Semestre académique",
    "Job d'été",
    "Autre",
].map((valeur) => ({ id: valeur, label: valeur }));

const mobiliteSchema = z.object({
    id: z.number(),
    version: z.number(),
    user_id: z.number({ error: messageValidation('selectionnerEleve') }),
    pays: z.string().min(1, { error: messageValidation('paysRequis') }),
    ville: z.string().nullish(),
    type_mobilite: z.string().nullish(),
    date_debut: z.coerce.date({ error: messageValidation('dateDebutRequise') }),
    date_fin: z.coerce.date({ error: messageValidation('dateFinRequise') }),
    est_valide: z.boolean().default(false),
    remarque: z.string().nullish(),
    promotion_id: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    // `refine` ne s'exécute qu'après une analyse réussie : les deux dates sont
    // donc présentes et valides. Le garde qui les testait ici ne se déclenchait
    // jamais.
    return data.date_fin >= data.date_debut;
}, {
    error: messageValidation('dateFinApresDebut'),
    path: ["date_fin"],
});

type Mobilite = z.infer<typeof mobiliteSchema>;

const MobiliteFields = ({ control, errors, isReadOnly, getValues, setValue }: RenderProps<Mobilite>) => {
    const { t } = useTranslation('certification');
    // Deux colonnes sur écran large (l'ancien `Grid` MUI, `spacing={8}`) ;
    // les champs portent chacun leur marge basse, la grille ne règle que
    // l'écart horizontal.
    return (
        <div className="grid grid-cols-1 gap-x-16 md:grid-cols-2">
            {/* COLONNE GAUCHE */}
            <div>
                <UserSelector
                    control={control}
                    errors={errors}
                    getValues={getValues}
                    setValue={setValue}
                    isReadOnly={isReadOnly}
                />
                <ChampTexte name="pays" control={control} label={t('mobilite.champPays')} disabled={isReadOnly} />
                <ChampTexte name="ville" control={control} label={t('mobilite.champVille')} disabled={isReadOnly} />
            </div>

            {/* COLONNE DROITE */}
            <div>
                <ChampSelection
                    name="type_mobilite"
                    control={control}
                    label={t('mobilite.champTypeMobilite')}
                    disabled={isReadOnly}
                    options={TYPE_MOBILITE_OPTIONS}
                />

                {/* En création, react-hook-form donne `undefined` (le champ
                    est absent d'`emptyValue`) : le garde qui empêche la date
                    du jour de se pré-remplir vit dans `ChampDate`. */}
                <ChampDate name="date_debut" control={control} label={t('mobilite.champDateDebut')} disabled={isReadOnly} />
                <ChampDate name="date_fin" control={control} label={t('mobilite.champDateFin')} disabled={isReadOnly} />
            </div>

            {/* PLEINE LARGEUR */}
            <div className="md:col-span-2">
                <ChampInterrupteur name="est_valide" control={control} label={t('mobilite.champValidee')} disabled={isReadOnly} />
                <ChampTexte name="remarque" control={control} label={t('mobilite.champRemarque')} disabled={isReadOnly} multiline rows={4} />
            </div>
        </div>
    );
};

// Colonnes au format TanStack nu (lot 9) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function mobiliteColonnes(t: TFunction<'certification'>): ColumnDef<Mobilite>[] {
    return [
        { accessorKey: 'id', header: t('mobilite.colonneId') },
        { accessorKey: 'version', header: t('mobilite.colonneVersion') },
        { accessorKey: 'lastName', header: t('mobilite.colonneNom') },
        { accessorKey: 'firstName', header: t('mobilite.colonnePrenom') },
        { accessorKey: 'pays', header: t('mobilite.colonnePays') },
        { accessorKey: 'ville', header: t('mobilite.colonneVille') },
        { accessorKey: 'type_mobilite', header: t('mobilite.colonneType') },
        {
            accessorKey: 'date_debut',
            header: t('mobilite.colonneDateDebut'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'date_fin',
            header: t('mobilite.colonneDateFin'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'est_valide',
            header: t('mobilite.colonneValidee'),
            cell: ({ cell }) => cell.getValue<boolean>() ? t('commun.oui') : t('commun.non'),
        },
    ];
}

const createMobiliteViewConfig = (promotionId: string, t: TFunction<'certification'>): ViewConfig<Mobilite> => {
    return {
        schema: mobiliteSchema,
        emptyValue: {
            id: -1,
            version: -1,
            promotion_id: parseInt(promotionId),
            est_valide: false,
        },
        colonnes: mobiliteColonnes(t),
        render: MobiliteFields,
    }
};

// Partie statique : à l'extérieur du composant
const createMobiliteRepository = (promotionId: string) => {
    return createRepository<Mobilite>({
        endpoint: ENDPOINT_MOBILITE,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: ['mobilite', promotionId],
        getId: (data: Mobilite) => data.id,
    })
}

export function CrudMobiliteInternationale({ mode, workflow, isAction, isTopToolbar, actionsBarreOutils }: CrudProps<Mobilite>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tCertification } = useTranslation('certification');

    const datasource = useMemo((): Datasource<Mobilite> | null => promotionId ? ({
        ...createMobiliteRepository(promotionId),
        ...createMobiliteViewConfig(promotionId, tCertification),
        title: tCrud('entites.mobiliteInternationale.title'),
        roleEcriture: Role.CERTIFICATION_ECRITURE,
        entityLabel: tCrud('entites.mobiliteInternationale.nom'),
        entityLabelAvecArticle: tCrud('entites.mobiliteInternationale.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.mobiliteInternationale.nomPluriel'),
        entityGender: 'f',
        isAction,
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [promotionId, isAction, isTopToolbar, actionsBarreOutils, tCrud, tCertification]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tCertification('parametrePromotionIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
