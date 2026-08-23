/**
 * L'état du graphique des notes, partagé par les quatre écrans qui l'offrent.
 *
 * Dans son propre module : un hook exporté à côté d'un composant empêche le
 * remplacement à chaud de ce composant.
 */

import { useState } from 'react';
import type { MRT_TableInstance } from 'material-react-table';
import type { NoteData } from './NoteChartModal';

export function useNoteChart<T extends NoteData>() {
    const [chartOpen, setChartOpen] = useState(false);
    const [chartData, setChartData] = useState<NoteData[]>([]);

    const handleOpenChart = (table: MRT_TableInstance<T>) => {
        // On récupère les données filtrées/triées actuelles du tableau
        const rows = table.getPrePaginationRowModel().rows.map(r => r.original);
        setChartData(rows);
        setChartOpen(true);
    };

    return { chartOpen, setChartOpen, chartData, handleOpenChart };
}
