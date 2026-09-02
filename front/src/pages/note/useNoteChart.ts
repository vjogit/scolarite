/**
 * L'état du graphique des notes, partagé par les quatre écrans qui l'offrent.
 *
 * Dans son propre module : un hook exporté à côté d'un composant empêche le
 * remplacement à chaud de ce composant.
 */

import { useCallback, useState } from 'react';
import type { NoteData } from './NoteChartModal';

export function useNoteChart<T extends NoteData>() {
    const [chartOpen, setChartOpen] = useState(false);
    const [chartData, setChartData] = useState<NoteData[]>([]);

    // `useCallback` n'est pas décoratif ici : les écrans de notes font entrer
    // ce rappel dans le mémo qui construit leur datasource. Recréé à chaque
    // rendu, il obligerait à l'omettre des dépendances — donc à mentir — ou à
    // recalculer le datasource sans cesse.
    //
    // `lignesVisibles` vient du contrat toolbar (lot 7 §4,
    // `ActionsBarreOutilsProps`) : les lignes filtrées et triées, avant
    // pagination — le graphique trace la vue courante, toutes pages
    // confondues, jamais la seule page affichée.
    const handleOpenChart = useCallback((lignesVisibles: () => T[]) => {
        setChartData(lignesVisibles());
        setChartOpen(true);
    }, []);

    return { chartOpen, setChartOpen, chartData, handleOpenChart };
}
