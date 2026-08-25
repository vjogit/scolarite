/**
 * Axe UE : la moyenne de chaque élève pour une unité d'enseignement, son grade
 * et le verdict d'élimination.
 *
 * Écran de consultation, calculé par `note_read_ue.sql` depuis les moyennes de
 * matière — elles-mêmes calculées depuis les notes de contrôle.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mui/material';
import type { MRT_ColumnDef } from 'material-react-table';

import type { TFunction } from 'i18next';
import type { DatasourceListe } from '../../services/crud/def';
import { AXE_UE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { CelluleNoteCalculee } from './CelluleNote';
import { nomEleve } from './entites/noteMatiere';
import { createNoteUeRepository, noteUeEntite, type NoteUe } from './entites/noteUe';

/**
 * Trois états et non deux. `a_matiere_eliminatoire` est `NULL` quand l'UE n'est
 * pas évaluée, et la requête dit pourquoi : sans moyenne complète, on ne sait
 * pas si une matière est éliminatoire. L'écran rendait ce `NULL` comme un `-`,
 * c'est-à-dire comme le « non » que le serveur refuse d'affirmer.
 */
function eliminatoire(ligne: NoteUe, t: TFunction<'note'>): string {
    if (ligne.a_matiere_eliminatoire === null) return t('noteUe.indetermine');
    return ligne.a_matiere_eliminatoire ? t('commun.oui') : t('commun.non');
}

function colonnes(t: TFunction<'note'>): MRT_ColumnDef<NoteUe>[] {
    return [
        { accessorFn: nomEleve, id: 'eleve', header: t('commun.eleve') },
        {
            accessorKey: 'note',
            header: t('commun.moyenne'),
            Cell: ({ cell, row }) => (
                <CelluleNoteCalculee
                    valeur={cell.getValue<number | null>()}
                    provenance={row.original.provenance}
                />
            ),
        },
        { accessorKey: 'grade_lettre', header: t('noteUe.colonneGrade') },
        { accessorFn: (ligne: NoteUe) => eliminatoire(ligne, t), id: 'eliminatoire', header: t('noteUe.colonneMatiereEliminatoire') },
    ];
}

export function AxeNoteUniteEnseignement() {
    const { ueId } = useParams();
    const { t: tCrud } = useTranslation('crud');
    const { t: tNote } = useTranslation('note');

    const datasource = useMemo((): DatasourceListe<NoteUe> | null => ueId ? ({
        ...createNoteUeRepository(ueId),
        ...noteUeEntite(tCrud),
        columns: colonnes(tNote),
        isAction: false,
        isTopToolbar: true,
    }) : null, [ueId, tCrud, tNote]);

    if (!datasource) return <Alert severity="error">{tNote('commun.parametreObligatoire', { parametre: 'ueId' })}</Alert>;

    return <AxeCalcule datasource={datasource} axe={AXE_UE} />;
}
