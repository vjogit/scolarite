/**
 * L'import d'une fiche de notes, sans son bouton.
 *
 * Dans son propre module parce que deux écrans l'appellent — la grille de
 * saisie par le bouton, la liste des contrôles par une entrée de menu — et
 * qu'un module mêlant un hook et un composant interdit le remplacement à
 * chaud du composant.
 */

import { useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { apiInstance } from '../../services/api';
import { ENDPOINT_BASE, NOTE } from './def';
import { notifyBlocking, notifyError, notifyPartialSuccess } from '../../services/notify';
import {
    blockingMessageFor, fileMessageFor, lignesFor, messageForError,
    type LignesRefusees,
} from '../../services/errorMessages';
import { LignesRefuseesDialog } from '../../services/LignesRefuseesDialog';
import i18n from '../../i18n/config';

interface ImportFicheResult {
    controle_id: number;
    created: number;
    updated: number;
    /** Lignes sans note, laissées telles quelles. Voir le commentaire ci-dessous. */
    ignorees: number;
}

/** Partagé par le bouton de la grille et l'entrée de menu des contrôles. */
export function libelleImportFiche(t?: TFunction<'note'>): string {
    return (t ?? (i18n.t as unknown as TFunction<'note'>))('ficheImport.importerDepuisExcel', { ns: 'note' });
}

/**
 * Import d'une fiche de notes, sans son bouton.
 *
 * Le déclencheur est ici un `<input type="file">` caché : il doit exister dans
 * l'arbre au moment du clic. Une entrée de menu ne peut pas le porter — le menu
 * se ferme avant. L'écran monte donc `champ` à côté de sa liste et appelle
 * `declencher(controleId)` depuis l'action de ligne.
 */
export function useFicheImport() {
    const queryClient = useQueryClient();
    const { t } = useTranslation('note');
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Le contrôle visé est fixé au clic : un seul champ sert toutes les lignes.
    const controleRef = useRef<number | null>(null);
    // Les lignes fautives du dernier refus : la modale reste ouverte tant
    // qu'elles ne sont pas lues — un refus se corrige fichier ouvert à côté.
    const [refus, setRefus] = useState<LignesRefusees | null>(null);

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
            const traitees = t('ficheImport.creeesEtMisesAJour', { creees: created, misesAJour: updated });
            notifyPartialSuccess(
                ignorees > 0
                    ? `${traitees} ${t('ficheImport.lignesSansNote', { nombre: ignorees })}`
                    : traitees,
                created + updated > 0,
            );
            void queryClient.invalidateQueries({ queryKey: [NOTE, 'controle', String(controleId)] });
        } catch (error) {
            // Un refus qui désigne ses lignes — note hors barème, cellule
            // illisible, élève inconnu, note sur un absent — s'affiche en
            // tableau : ligne, champ, motif, à corriger fichier ouvert à côté.
            const lignes = lignesFor(error);
            if (lignes !== null) {
                setRefus(lignes);
            } else {
                // Refus sans lignes : un conflit d'état rédigé par le serveur
                // demande un arbitrage et reste à l'écran ; sinon le detail du
                // fichier refusé (contrôle attendu vs fourni…) vaut mieux que
                // le libellé générique.
                const conflit = blockingMessageFor(error);
                if (conflit !== null) {
                    notifyBlocking(conflit);
                } else {
                    notifyError(fileMessageFor(error) ?? messageForError(error));
                }
            }
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [queryClient, t]);

    const declencher = useCallback((controleId: number) => {
        controleRef.current = controleId;
        fileInputRef.current?.click();
    }, []);

    const champ = (
        <>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(event) => { void handleFileChange(event); }}
                accept=".xlsx"
            />
            <LignesRefuseesDialog
                refus={refus}
                sousTitre={t('ficheImport.aucuneNoteImportee')}
                onClose={() => { setRefus(null); }}
            />
        </>
    );

    return { declencher, champ };
}
