/**
 * L'enveloppe commune aux axes calculés : matière, UE, période.
 *
 * Les trois écrans étaient le même code à la requête et aux colonnes près —
 * même liste, même graphique, mêmes gardes. Ils y ajoutaient chacun une
 * machinerie de création dont aucun n'avait l'usage : `emptyValue` pointant sur
 * des colonnes que la table `note` n'a jamais eues, schéma zod validant des
 * valeurs que personne ne saisit, formulaire aux champs tous `disabled`.
 *
 * Ce qui reste ici est ce qu'ils avaient réellement en commun, plus ce qui leur
 * manquait : dire de quoi ils sont faits. Un tableau de nombres sans origine se
 * lit comme une saisie, et une cellule vide comme un oubli.
 */

import { useMemo } from 'react';
import type { FieldValues } from 'react-hook-form';

import { Consultation } from '../../services/crud/Consultation';
import type { DatasourceListe } from '../../services/crud/def';
import type { Axe } from './axes';
import { NOTE_WORKFLOW } from './def';
import { AnnonceAxe } from './AnnonceAxe';
import { NoteChartButton } from './NoteChartButton';
import { NoteChartModal, type NoteData } from './NoteChartModal';
import { useNoteChart } from './useNoteChart';

interface Props<D extends NoteData & FieldValues> {
    /**
     * Sans barre d'outils : c'est l'enveloppe qui y met le graphique, seul
     * ajout que les trois axes partagent. Un axe calculé n'a rien d'autre à y
     * mettre — ni création, ni suppression, ni import.
     */
    readonly datasource: DatasourceListe<D>;
    readonly axe: Axe;
}

export function AxeCalcule<D extends NoteData & FieldValues>({ datasource, axe }: Props<D>) {
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<D>();

    const complet = useMemo((): DatasourceListe<D> => ({
        ...datasource,
        actionsBarreOutils: ({ lignesVisibles }) => (
            <NoteChartButton onClick={() => { handleOpenChart(lignesVisibles); }} />
        ),
    }), [datasource, handleOpenChart]);

    return (
        <div className="flex h-full flex-col gap-2 p-2">
            <AnnonceAxe axe={axe} />
            <div className="min-h-0 flex-1">
                <Consultation datasource={complet} workflow={NOTE_WORKFLOW} />
            </div>
            <NoteChartModal
                open={chartOpen}
                onClose={() => { setChartOpen(false); }}
                data={chartData}
            />
        </div>
    );
}
