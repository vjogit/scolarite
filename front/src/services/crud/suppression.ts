/**
 * La suppression d'entités CRUD, hors de toute table.
 *
 * Le geste est toujours le même : un appel groupé, l'invalidation de la liste,
 * une notification accordée en genre et en nombre, et le message métier du
 * serveur quand il refuse malgré l'accord de la modale. Il vivait dans
 * `List.tsx`, où seule une table pouvait l'atteindre ; l'arbre de la structure
 * supprime le nœud sélectionné sans monter aucune liste et a besoin du même.
 *
 * Les noms transitent par les variables de mutation : la modale se ferme et
 * vide sa sélection avant la résolution, ils ne seraient plus lisibles dans
 * `onSuccess`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
import type { FieldValues } from 'react-hook-form';

import { blockingMessageFor, messageForError } from '../errorMessages';
import { notifyError, notifySuccess } from '../notify';
import type { EntiteCrud } from './def';
import { messageSuppression } from './entityMessages';

/** Identifiants à supprimer, accompagnés des noms à annoncer au succès. */
export interface VariablesSuppression {
    ids: number[];
    noms: string[];
}

export function useSuppressionCrud<D extends FieldValues>(entite: EntiteCrud<D>) {
    const queryClient = useQueryClient();
    const notifications = useNotifications();

    return useMutation({
        mutationFn: ({ ids }: VariablesSuppression) => entite.delete(ids),
        onSuccess: (_resultat, { noms }) => {
            // Invalide la liste, et elle seule : `queryKey` est le préfixe des
            // clés de détail `[...queryKey, id]`, si bien qu'une invalidation
            // large redemanderait au serveur le détail de ce qu'on vient de
            // supprimer. Sans observateur monté cela restait invisible ; en
            // maître-détail le panneau en tient un, et l'appel repartait pour
            // un 400. La liste rafraîchie suffit : le nœud disparaît de l'arbre.
            void queryClient.invalidateQueries({ queryKey: entite.queryKey, exact: true });
            notifySuccess(notifications, messageSuppression(entite, noms));
        },
        onError: (error) => {
            // Le serveur peut refuser la suppression (409 BUSINESS_CONFLICT) même
            // si la modale l'a autorisée : le message doit remonter.
            notifyError(notifications, blockingMessageFor(error) ?? messageForError(error));
        },
    });
}
