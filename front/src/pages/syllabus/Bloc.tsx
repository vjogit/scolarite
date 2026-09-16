/**
 * Les blocs de compétences d'une promotion (lot 3, rattaché à la promotion le
 * 16 septembre 2026) : premier niveau du référentiel, greffé sous la
 * promotion du workflow Structure sur le modèle UE → matières. La promotion
 * est dans l'URL : le filtrage est gratuit, aucun état caché (invariant 1).
 * L'arbre ne change pas — il s'arrête au segment étranger et garde la
 * promotion sélectionnée.
 *
 * L'ordre est saisi ; le serveur refuse une position déjà prise sur la
 * promotion (`valeur_deja_utilisee` sous le champ). Le réordonnancement est
 * l'édition de l'ordre, pas un glisser-déposer.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ColumnDef } from '@tanstack/react-table';

import { Crud } from '../../services/crud/Crud';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useRootPath } from '../../services/crud/useRootPath';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import {
    ACTION_COMPETENCES, blocEntite, blocSchema, createBlocRepository, type Bloc,
} from './entites/competences';

/** Un texte optionnel vidé à l'écran est absent : `null`, pas `''`. */
function normaliserBloc(bloc: Bloc): Bloc {
    const vide = (valeur: string | null) => (valeur !== null && valeur.trim() === '' ? null : valeur);
    return {
        ...bloc,
        code: vide(bloc.code),
        activites: vide(bloc.activites),
        modalites_evaluation: vide(bloc.modalites_evaluation),
    };
}

function BlocFields({ control, isReadOnly }: RenderProps<Bloc>) {
    const { t } = useTranslation('syllabus');
    return (
        <>
            <ChampNombre name="ordre" control={control} label={t('competences.bloc.champOrdre')} disabled={isReadOnly} min={1} step={1} />
            <ChampTexte name="libelle" control={control} label={t('competences.bloc.champLibelle')} disabled={isReadOnly} />
            <ChampTexte name="code" control={control} label={t('competences.bloc.champCode')} disabled={isReadOnly} aide={t('competences.bloc.champCodeAide')} />
            <ChampTexte name="activites" control={control} label={t('competences.bloc.champActivites')} disabled={isReadOnly} multiline rows={4} />
            <ChampTexte name="modalites_evaluation" control={control} label={t('competences.bloc.champModalitesEvaluation')} disabled={isReadOnly} multiline rows={4} />
        </>
    );
}

function blocColonnes(t: TFunction<'syllabus'>, tStructure: TFunction<'structure'>): ColumnDef<Bloc>[] {
    return [
        { accessorKey: 'id', header: tStructure('commun.id') },
        { accessorKey: 'version', header: tStructure('commun.version') },
        { accessorKey: 'ordre', header: t('competences.bloc.colonneOrdre') },
        { accessorKey: 'code', header: t('competences.bloc.colonneCode') },
        { accessorKey: 'libelle', header: t('competences.bloc.colonneLibelle') },
    ];
}

function blocViewConfig(promotionId: string, t: TFunction<'syllabus'>, tStructure: TFunction<'structure'>): ViewConfig<Bloc> {
    return {
        schema: blocSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId), code: null, activites: null, modalites_evaluation: null },
        colonnes: blocColonnes(t, tStructure),
        render: BlocFields,
    };
}

export function CrudBloc({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Bloc>) {
    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('syllabus');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Bloc> | null => {
        if (promotionId === undefined) return null;
        const repository = createBlocRepository(promotionId);
        return {
            ...repository,
            create: (bloc) => repository.create(normaliserBloc(bloc)),
            update: (bloc) => repository.update(normaliserBloc(bloc)),
            ...blocViewConfig(promotionId, t, tStructure),
            ...blocEntite(t),
            isAction,
            isReadOnly,
            // Créée au rendu, avec le `t` du composant : le libellé suit la
            // bascule de langue (voir « Défauts constatés », actions figées).
            actionsLigne: actionsLigne ?? [ACTION_COMPETENCES(t)],
            isTopToolbar,
            actionsBarreOutils,
        };
    }, [promotionId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    if (!datasource) return <p>{t('competences.bloc.erreurPromotionIdObligatoire')}</p>;

    return <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />;
}
