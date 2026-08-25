import { Box, IconButton, Tooltip } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useTranslation } from 'react-i18next';

// Bouton standardisé pour la toolbar
export function NoteChartButton({ onClick }: { onClick: () => void }) {
    const { t } = useTranslation('note');
    // « Graphique » seul ne dit pas ce qui est tracé.
    const libelle = t('noteChartButton.afficherGraphique');
    return (
        <Box sx={{ display: 'flex', gap: '1rem' }}>
            <Tooltip title={libelle}>
                <IconButton aria-label={libelle} onClick={onClick}>
                    <BarChartIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
