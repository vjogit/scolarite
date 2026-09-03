import { useCallback } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { apiInstance } from '../../services/api';
import { telecharger } from '../../services/telechargement';
import { notifyError } from '../../services/notify';

export function PeriodeExportButton() {
    const { optionId } = useParams();
    const { t } = useTranslation('catalog');
    const libelle = t('exportProgramme.libelle');

    const handleExport = useCallback(async () => {
        if (!optionId) return;

        try {
            const response = await apiInstance.get<Blob>(`/api/v0/structure/option/${optionId}/export`, {
                responseType: 'blob',
            });

            telecharger(response, 'programme.xlsx');
        } catch (error) {
            console.error(error);
            notifyError(t('exportProgramme.erreur'));
        }
    }, [optionId, t]);

    return (
        <Tooltip>
            <TooltipTrigger
                render={(
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={libelle}
                        onClick={() => { void handleExport(); }}
                    />
                )}
            >
                <Download />
            </TooltipTrigger>
            <TooltipContent>{libelle}</TooltipContent>
        </Tooltip>
    );
}
