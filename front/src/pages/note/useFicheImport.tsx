/**
 * L'import d'une fiche de notes, sans son bouton.
 *
 * Dans son propre module parce que deux écrans l'appellent — la grille de
 * saisie par le bouton, la liste des contrôles par une entrée de menu — et
 * qu'un module mêlant un hook et un composant interdit le remplacement à
 * chaud du composant.
 */

import { useRef, useCallback } from 'react';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { apiInstance } from '../../services/api';
import { ENDPOINT_BASE, NOTE } from './def';
import { notifyError, notifySuccess } from '../../services/notify';
import { fileMessageFor, messageForError } from '../../services/errorMessages';

interface ImportFicheResult {
    controle_id: number;
    created: number;
    updated: number;
}

/** Partagé par le bouton de la grille et l'entrée de menu des contrôles. */
export const LIBELLE_IMPORT_FICHE = 'Importer les notes depuis Excel';

/**
 * Import d'une fiche de notes, sans son bouton.
 *
 * Le déclencheur est ici un `<input type="file">` caché : il doit exister dans
 * l'arbre au moment du clic. Une entrée de menu ne peut pas le porter — le menu
 * se ferme avant. L'écran monte donc `champ` à côté de sa liste et appelle
 * `declencher(controleId)` depuis l'action de ligne.
 */
export function useFicheImport() {
    const notifications = useNotifications();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Le contrôle visé est fixé au clic : un seul champ sert toutes les lignes.
    const controleRef = useRef<number | null>(null);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const controleId = controleRef.current;
        if (!file || controleId === null) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await apiInstance.post<ImportFicheResult>(
                `${ENDPOINT_BASE}/note/fiche/import?controle_id=${controleId}`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const { created, updated } = res.data;
            notifySuccess(
                notifications,
                `${created} note(s) créée(s), ${updated} note(s) mise(s) à jour.`,
            );
            void queryClient.invalidateQueries({ queryKey: [NOTE, 'controle', String(controleId)] });
        } catch (error) {
            // Le serveur nomme la ligne et la valeur en cause quand il refuse un
            // fichier : ce message vaut mieux que le libellé générique.
            notifyError(notifications, fileMessageFor(error) ?? messageForError(error));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [notifications, queryClient]);

    const declencher = useCallback((controleId: number) => {
        controleRef.current = controleId;
        fileInputRef.current?.click();
    }, []);

    const champ = (
        <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(event) => { void handleFileChange(event); }}
            accept=".xlsx"
        />
    );

    return { declencher, champ };
}
