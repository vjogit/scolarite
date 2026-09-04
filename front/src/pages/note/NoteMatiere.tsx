/**
 * Axe Matière : la moyenne de chaque élève pour une matière.
 *
 * Écran de consultation. `note_read_matiere.sql` part de `note` jointe par
 * `controle_id` — la table n'a aucune autre clé de rattachement — et applique
 * les règles de la promotion. Rien de ce qui s'affiche ici n'existe en base.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import type { TFunction } from 'i18next';
import { Alert, AlertDescription } from '../../components/ui/alert';
import type { DatasourceListe } from '../../services/crud/def';
import { AXE_MATIERE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { CelluleNoteCalculee } from './CelluleNote';
import {
    createNoteMatiereRepository, nomEleve, noteMatiereEntite, type NoteMatiere,
} from './entites/noteMatiere';

function colonnes(t: TFunction<'note'>): ColumnDef<NoteMatiere>[] {
    return [
        { accessorFn: nomEleve, id: 'eleve', header: t('commun.eleve') },
        {
            accessorKey: 'note',
            header: t('commun.moyenne'),
            cell: ({ cell, row }) => (
                <CelluleNoteCalculee
                    valeur={cell.getValue<number | null>()}
                    provenance={row.original.provenance}
                />
            ),
        },
    ];
}

export function AxeNoteMatiere() {
    const { matiereId } = useParams();
    const { t: tCrud } = useTranslation('crud');
    const { t: tNote } = useTranslation('note');

    const datasource = useMemo((): DatasourceListe<NoteMatiere> | null => matiereId ? ({
        ...createNoteMatiereRepository(matiereId),
        ...noteMatiereEntite(tCrud),
        colonnes: colonnes(tNote),
        // Aucune action de ligne : « Voir » et « Éditer » que la liste ajoute
        // mèneraient aux routes de formulaire que cet axe n'a plus.
        isAction: false,
        isTopToolbar: true,
    }) : null, [matiereId, tCrud, tNote]);

    if (!datasource) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{tNote('commun.parametreObligatoire', { parametre: 'matiereId' })}</AlertDescription>
            </Alert>
        );
    }

    return <AxeCalcule datasource={datasource} axe={AXE_MATIERE} />;
}
