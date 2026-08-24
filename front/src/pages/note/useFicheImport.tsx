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
import { notifyBlocking, notifyError, notifyPartialSuccess } from '../../services/notify';
import { blockingMessageFor, fileMessageFor, messageForError } from '../../services/errorMessages';

interface ImportFicheResult {
    controle_id: number;
    created: number;
    updated: number;
    /** Lignes sans note, laissées telles quelles. Voir le commentaire ci-dessous. */
    ignorees: number;
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

            // Les lignes ignorées ne sont pas un incident : une cellule vide
            // n'affirme rien, et une fiche partiellement corrigée est le cas
            // normal. Mais les taire laisserait croire qu'une fiche de trente
            // élèves dont trois sont notés n'a traité que trois lignes par
            // accident. On les annonce donc, sans les présenter comme un échec.
            //
            // La sévérité suit ce qui s'est passé, pas ce qui a été sauté :
            // seul un import qui n'écrit rien du tout mérite l'œil — c'est le
            // symptôme d'une fiche vierge ou d'un fichier qu'on s'est trompé
            // d'envoyer, et il ne doit pas passer pour un succès.
            const { created, updated, ignorees } = res.data;
            const traitees = `${String(created)} note(s) créée(s), ${String(updated)} note(s) mise(s) à jour.`;
            notifyPartialSuccess(
                notifications,
                ignorees > 0
                    ? `${traitees} ${String(ignorees)} ligne(s) sans note, laissée(s) inchangée(s).`
                    : traitees,
                created + updated > 0,
            );
            void queryClient.invalidateQueries({ queryKey: [NOTE, 'controle', String(controleId)] });
        } catch (error) {
            // Un refus pour conflit d'état — une note portée sur un élève
            // déclaré non évalué — énumère les élèves concernés : il demande un
            // arbitrage et doit rester à l'écran le temps qu'on le rende.
            const conflit = blockingMessageFor(error);
            if (conflit !== null) {
                notifyBlocking(notifications, conflit);
            } else {
                // Le serveur nomme la ligne et la valeur en cause quand il refuse
                // un fichier : ce message vaut mieux que le libellé générique.
                notifyError(notifications, fileMessageFor(error) ?? messageForError(error));
            }
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
