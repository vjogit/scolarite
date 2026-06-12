

// --- COMPOSANTS UTILITAIRES ---

import { Box, IconButton, Tooltip } from "@mui/material";
import type { MRT_TableInstance } from "material-react-table";
import { useState } from "react";
import type { NoteData } from "./NoteChartModal";
import BarChartIcon from '@mui/icons-material/BarChart';

// Hook pour gérer l'état du graphique
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

// Bouton standardisé pour la toolbar
export function NoteChartButton({ onClick }: { onClick: () => void }) {
    return (
        <Box sx={{ display: 'flex', gap: '1rem' }}>
            <Tooltip title={"Graphique"}>
                <IconButton onClick={onClick}>
                    <BarChartIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
