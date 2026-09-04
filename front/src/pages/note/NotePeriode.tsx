/**
 * Axe Période : le GPA de chaque élève, tel que le jury l'a arrêté.
 *
 * Cet axe n'est pas de même nature que la matière et l'UE. Il ne recalcule
 * rien depuis les copies : il lit `jury_result`, le relevé figé par la
 * délibération. C'est le jury qui valide un semestre, et « pas encore
 * délibéré » est l'état normal avant qu'il se prononce.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';

import { Alert, AlertDescription } from '../../components/ui/alert';
import type { DatasourceListe } from '../../services/crud/def';
import { AXE_PERIODE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { nomEleve } from './entites/noteMatiere';
import { createNotePeriodeRepository, notePeriodeEntite, type NotePeriode } from './entites/notePeriode';
import { formatNote } from './provenance';

/** Discret : c'est une absence, elle ne doit pas peser autant qu'une valeur. */
function Absence({ children }: { children: string }) {
    return <span className="text-sm text-muted-foreground">{children}</span>;
}

function colonnes(t: TFunction<'note'>): ColumnDef<NotePeriode>[] {
    return [
        { accessorFn: nomEleve, id: 'eleve', header: t('commun.eleve') },
        {
            accessorKey: 'note',
            header: t('notePeriode.colonneGpa'),
            // Trois situations qu'une cellule vide confondrait : l'élève n'est pas
            // passé en jury, il l'est sans GPA calculable, il en a un.
            cell: ({ cell, row }) => {
                if (!row.original.delibere) return <Absence>{t('notePeriode.nonDelibere')}</Absence>;
                const valeur = cell.getValue<number | null>();
                if (valeur == null) return <Absence>{t('notePeriode.gpaNonCalculable')}</Absence>;
                return <>{formatNote.format(valeur)}</>;
            },
        },
    ];
}

export function AxeNotePeriode() {
    const { periodeId } = useParams();
    const { t: tCrud } = useTranslation('crud');
    const { t: tNote } = useTranslation('note');

    const datasource = useMemo((): DatasourceListe<NotePeriode> | null => periodeId ? ({
        ...createNotePeriodeRepository(periodeId),
        ...notePeriodeEntite(tCrud),
        colonnes: colonnes(tNote),
        isAction: false,
        isTopToolbar: true,
    }) : null, [periodeId, tCrud, tNote]);

    if (!datasource) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{tNote('commun.parametreObligatoire', { parametre: 'periodeId' })}</AlertDescription>
            </Alert>
        );
    }

    return <AxeCalcule datasource={datasource} axe={AXE_PERIODE} />;
}
