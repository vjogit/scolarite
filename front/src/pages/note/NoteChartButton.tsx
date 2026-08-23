import { Box, IconButton, Tooltip } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';

/** « Graphique » seul ne dit pas ce qui est tracé. */
const LIBELLE = 'Afficher le graphique des notes';

// Bouton standardisé pour la toolbar
export function NoteChartButton({ onClick }: { onClick: () => void }) {
    return (
        <Box sx={{ display: 'flex', gap: '1rem' }}>
            <Tooltip title={LIBELLE}>
                <IconButton aria-label={LIBELLE} onClick={onClick}>
                    <BarChartIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
