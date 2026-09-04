import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useId, useMemo } from 'react';
import { useController, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { Field, FieldError, FieldLabel } from '../../components/ui/field';
import { matiereSchema, type Matiere, createMatiereRepository, matiereEntite } from './entites/matiere';

export type { Matiere } from './entites/matiere';

/**
 * La couleur de la matière — un `<input type="color">` natif, le seul de
 * l'application : local à cet écran, comme `ChampRoles` (User) et
 * `ChampMultiple` (ReservationDialog), tant qu'un second écran n'en demande
 * pas un. Le câblage suit celui des champs partagés (`useController`,
 * `<label for>`, erreur sous le champ, `name` sur l'`<input>`).
 */
function ChampCouleur({ control, disabled }: { control: Control<Matiere>; disabled: boolean }) {
    const { t } = useTranslation('structure');
    const { field: { ref: refChamp, value, onChange, onBlur }, fieldState } = useController({ name: 'color', control });
    const id = useId();
    const idErreur = `${id}-erreur`;
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        <Field orientation="horizontal" data-invalid={estInvalide} className="mb-4">
            {/* Un sélecteur de couleur n'a pas de valeur vide : sans couleur
                enregistrée, le navigateur affiche noir, comme l'ancien champ
                non contrôlé. */}
            <input
                id={id}
                name="color"
                ref={refChamp}
                type="color"
                value={typeof value === 'string' && value !== '' ? value : '#000000'}
                onChange={(evenement) => { onChange(evenement.target.value); }}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={estInvalide ? true : undefined}
                aria-describedby={estInvalide ? idErreur : undefined}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:cursor-default disabled:opacity-50"
            />
            <FieldLabel htmlFor={id}>{t('matiere.champCouleur')}</FieldLabel>
            {estInvalide && <FieldError id={idErreur}>{erreur}</FieldError>}
        </Field>
    );
}

const MatiereFields = ({ control, isReadOnly }: RenderProps<Matiere>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <ChampTexte name="name" control={control} label={t('matiere.champNom')} disabled={isReadOnly} />
            <ChampNombre name="coeff" control={control} label={t('matiere.champCoefficient')} disabled={isReadOnly} />
            <ChampNombre name="heure" control={control} label={t('matiere.champHeures')} disabled={isReadOnly} />
            <ChampCouleur control={control} disabled={isReadOnly} />
        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function matiereColonnes(t: TFunction<'structure'>): ColumnDef<Matiere>[] {
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
            accessorKey: 'coeff',
            header: t('matiere.colonneCoeff'),
        },
        {
            accessorKey: 'heure',
            header: t('matiere.champHeures'),
        },
    ];
}

function createMatiereViewConfig(ueId: string, t: TFunction<'structure'>): ViewConfig<Matiere> {
    return {
        schema: matiereSchema,
        emptyValue: { id: -1, version: -1, unite_enseignement_id: parseInt(ueId) },
        colonnes: matiereColonnes(t),
        render: MatiereFields,
    }
}

export function CrudMatiere({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Matiere>) {

    const { ueId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Matiere> | null => ueId ? ({
        ...createMatiereRepository(ueId),
        ...createMatiereViewConfig(ueId, tStructure),
        ...matiereEntite(t),
        isAction,
        isReadOnly,
        actionsLigne,
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [ueId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <p>{tStructure('matiere.erreurUeIdObligatoire')}</p>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
