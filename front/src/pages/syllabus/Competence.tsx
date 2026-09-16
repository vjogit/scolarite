/**
 * Les compétences d'un bloc (lot 3) : second niveau du référentiel, greffé
 * sous le bloc. Le code « C{ordre} » est une colonne dérivée de la position,
 * jamais stockée ; le serveur refuse une position déjà prise dans le bloc.
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
    codeCompetence, competenceEntite, competenceSchema, createCompetenceRepository, type Competence,
} from './entites/competences';

function normaliserCompetence(competence: Competence): Competence {
    const vide = (valeur: string | null) => (valeur !== null && valeur.trim() === '' ? null : valeur);
    return { ...competence, contexte: vide(competence.contexte), finalites: vide(competence.finalites) };
}

function CompetenceFields({ control, isReadOnly }: RenderProps<Competence>) {
    const { t } = useTranslation('syllabus');
    return (
        <>
            <ChampNombre name="ordre" control={control} label={t('competences.competence.champOrdre')} disabled={isReadOnly} min={1} step={1} />
            <ChampTexte name="action" control={control} label={t('competences.competence.champAction')} disabled={isReadOnly} aide={t('competences.competence.champActionAide')} />
            <ChampTexte name="contexte" control={control} label={t('competences.competence.champContexte')} disabled={isReadOnly} aide={t('competences.competence.champContexteAide')} multiline rows={3} />
            <ChampTexte name="finalites" control={control} label={t('competences.competence.champFinalites')} disabled={isReadOnly} aide={t('competences.competence.champFinalitesAide')} multiline rows={3} />
        </>
    );
}

function competenceColonnes(t: TFunction<'syllabus'>, tStructure: TFunction<'structure'>): ColumnDef<Competence>[] {
    return [
        { accessorKey: 'id', header: tStructure('commun.id') },
        { accessorKey: 'version', header: tStructure('commun.version') },
        // Dérivée de la position : un tri sur cette colonne est un tri sur l'ordre.
        { accessorFn: (ligne) => codeCompetence(ligne.ordre), id: 'code', header: t('competences.competence.colonneCode') },
        { accessorKey: 'action', header: t('competences.competence.colonneAction') },
    ];
}

function competenceViewConfig(blocId: string, t: TFunction<'syllabus'>, tStructure: TFunction<'structure'>): ViewConfig<Competence> {
    return {
        schema: competenceSchema,
        emptyValue: { id: -1, version: -1, bloc_id: parseInt(blocId), contexte: null, finalites: null },
        colonnes: competenceColonnes(t, tStructure),
        render: CompetenceFields,
    };
}

export function CrudCompetence({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Competence>) {
    const { blocId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('syllabus');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Competence> | null => {
        if (blocId === undefined) return null;
        const repository = createCompetenceRepository(blocId);
        return {
            ...repository,
            create: (competence) => repository.create(normaliserCompetence(competence)),
            update: (competence) => repository.update(normaliserCompetence(competence)),
            ...competenceViewConfig(blocId, t, tStructure),
            ...competenceEntite(t),
            isAction,
            isReadOnly,
            actionsLigne,
            isTopToolbar,
            actionsBarreOutils,
        };
    }, [blocId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    if (!datasource) return <p>{t('competences.competence.erreurBlocIdObligatoire')}</p>;

    return <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />;
}
