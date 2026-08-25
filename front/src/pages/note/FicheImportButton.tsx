import { Tooltip, IconButton } from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { useTranslation } from 'react-i18next';
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
            <Tooltip title={libelle}>
                <IconButton
                    aria-label={libelle}
                    onClick={() => { declencher(controleId); }}>
                    <FileUploadIcon />
                </IconButton>
            </Tooltip>
            {champ}
        </>
    );
}
