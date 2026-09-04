import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { libelleImportFiche, useFicheImport } from './useFicheImport';

interface Props {
    controleId: number;
}

/** Le même import sous forme de bouton, pour la grille de saisie. */
export function FicheImportButton({ controleId }: Props) {
    const { declencher, champ } = useFicheImport();
    const { t } = useTranslation('note');
    const libelle = libelleImportFiche(t);

    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={(
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={libelle}
                            onClick={() => { declencher(controleId); }}
                        />
                    )}
                >
                    <Upload />
                </TooltipTrigger>
                <TooltipContent>{libelle}</TooltipContent>
            </Tooltip>
            {champ}
        </>
    );
}
