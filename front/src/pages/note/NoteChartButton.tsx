import { ChartColumn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';

// Bouton standardisé pour la toolbar
export function NoteChartButton({ onClick }: { onClick: () => void }) {
    const { t } = useTranslation('note');
    // « Graphique » seul ne dit pas ce qui est tracé.
    const libelle = t('noteChartButton.afficherGraphique');
    return (
        <Tooltip>
            <TooltipTrigger
                render={<Button type="button" variant="ghost" size="icon" aria-label={libelle} onClick={onClick} />}
            >
                <ChartColumn />
            </TooltipTrigger>
            <TooltipContent>{libelle}</TooltipContent>
        </Tooltip>
    );
}
