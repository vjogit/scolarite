import { Tooltip, IconButton } from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { LIBELLE_IMPORT_FICHE, useFicheImport } from './useFicheImport';

interface Props {
    controleId: number;
}

/** Le même import sous forme de bouton, pour la grille de saisie. */
export function FicheImportButton({ controleId }: Props) {
    const { declencher, champ } = useFicheImport();

    return (
        <>
            <Tooltip title={LIBELLE_IMPORT_FICHE}>
                <IconButton
                    aria-label={LIBELLE_IMPORT_FICHE}
                    onClick={() => { declencher(controleId); }}>
                    <FileUploadIcon />
                </IconButton>
            </Tooltip>
            {champ}
        </>
    );
}
