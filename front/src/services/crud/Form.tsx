import { useEffect, useRef, useState } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Resolver } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { type Datasource } from './def';
import { fieldErrorsFor, messageForError } from '../errorMessages';
import { notifyError, notifySuccess } from '../notify';
import { messageCreation, messageEnregistrement } from './entityMessages';

import { useNotifications } from '@toolpad/core/useNotifications';
import { Box, Button } from '@mui/material';
import { useCrudContext } from './useCrudContext';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog';
import { premierChampEnErreur, premierChampSaisissable } from './focus';


export type FormMode = 'create' | 'show' | 'edit';

interface Props<D extends FieldValues> {
  datasource: Datasource<D>
  initialData: DefaultValues<D>
  mode: FormMode
}

export function Form<D extends FieldValues>({ initialData, mode, datasource, }: Props<D>) {
  const { t } = useTranslation('crud');
  const { rootPath } = useCrudContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const isReadOnly = mode === 'show';
  const formulaireRef = useRef<HTMLFormElement>(null);
  // Champs refusés par le dernier appel serveur. Un tableau neuf à chaque
  // refus, y compris identique au précédent : l'effet doit rejouer.
  const [champsRefuses, setChampsRefuses] = useState<string[]>([]);


  const { register, handleSubmit, control, setError, formState: { errors, dirtyFields }, getValues, setValue } = useForm<D>({
    // Le résolveur de zod et le générique de react-hook-form ne se rejoignent
    // pas : `zodResolver` infère `Resolver<FieldValues>` d'un schéma générique,
    // là où `useForm<D>` réclame `Resolver<D>`. L'affirmation est ici, une fois,
    // plutôt que dans un `schema: any` qui la répandrait sur tous les écrans.
    resolver: zodResolver(datasource.schema) as Resolver<D>,
    // READ : On pré-remplit le formulaire avec les données existantes
    defaultValues: initialData,
  });

  const mutation = useMutation({
    // Choix dynamique de la fonction API
    mutationFn: mode === 'edit' ? datasource.update : datasource.create,
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: datasource.queryKey });
      // On annonce l'état réel renvoyé par le serveur, pas les valeurs saisies :
      // le libellé a pu être normalisé côté API.
      notifySuccess(
        notifications,
        mode === 'edit' ? messageEnregistrement(datasource, saved) : messageCreation(datasource, saved),
      );
      // react-hook-form ne repasse pas le formulaire à « non modifié » après
      // une mutation réussie : sans ce désarmement, la garde s'interposerait
      // sur le retour vers la liste, à chaque enregistrement.
      guard.allowNavigation();
      void navigate(rootPath, { state: { highlightId: datasource.getId(saved) } });
    },
    onError: (error) => {
      const fields = fieldErrorsFor(error);
      if (fields) {
        Object.entries(fields).forEach(([field, message]) => {
          setError(field as Parameters<typeof setError>[0], { type: 'server', message });
        });
        // Le déplacement du focus attend le rendu que `setError` provoque :
        // c'est lui qui pose `aria-invalid`, seul repère des champs montés
        // sous `Controller`.
        setChampsRefuses(Object.keys(fields));
        return;
      }
      notifyError(notifications, messageForError(error));
    }
  });

  // `isDirty` compare l'objet entier aux valeurs par défaut, or tout champ
  // enregistré absent de celles-ci — le cas de `emptyValue` en création — y
  // ajoute une clé au montage : le formulaire serait « modifié » sans une
  // frappe. `dirtyFields` est alimenté champ par champ sur événement de saisie
  // et se vide dès que la valeur revient à l'originale.
  const hasUnsavedChanges =
    mode !== 'show' && Object.keys(dirtyFields).length > 0 && !mutation.isPending;

  // Pendant l'enregistrement, l'utilisateur n'est pas en train de partir : il
  // attend. La garde reste désarmée jusqu'au verdict du serveur.
  const guard = useUnsavedChangesGuard(hasUnsavedChanges);

  const onSubmit = (data: D) => {
    mutation.mutate(data);
  };

  // À l'ouverture d'une saisie, le focus reste sinon sur le déclencheur de
  // navigation resté sur la liste. En consultation on n'y touche pas : il n'y
  // a rien à saisir, et voler le focus ferait défiler la page sans raison.
  useEffect(() => {
    if (mode === 'show') return;
    premierChampSaisissable(formulaireRef.current)?.focus();
  }, [mode]);

  // Après un refus serveur, le clavier va au premier champ fautif dans
  // l'ordre de lecture. L'utilisateur n'a pas à parcourir le formulaire pour
  // trouver lequel des messages est apparu.
  useEffect(() => {
    if (champsRefuses.length === 0) return;
    premierChampEnErreur(formulaireRef.current, champsRefuses)?.focus();
  }, [champsRefuses]);

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        {/*
          noValidate : les bornes natives (min/max sur les champs numériques)
          bloqueraient la soumission avant que zod ne s'exécute, et le
          navigateur afficherait sa propre bulle — dans sa langue, et non le
          message du schéma rendu en helper text comme partout ailleurs.
          Elles restent posées pour borner les flèches de l'incrémenteur ;
          l'arbitrage de la validité, lui, revient à zod.
        */}
        <form ref={formulaireRef} noValidate onSubmit={(event) => { void handleSubmit(onSubmit)(event); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '500px', width: '100%' }}>
          <h2>
            {mode === 'show' ? t('form.titreDetails') : mode === 'edit' ? t('form.titreModifier') : t('form.titreAjouter')}
          </h2>

          {/* Utilisation de la fonction/composant extraite */}
          {datasource.render({ register, control, errors, isReadOnly, getValues, setValue })}


          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => { guard.requestNavigation(() => { void navigate(rootPath); }); }}
            >
              {mode === 'show' ? t('form.retour') : t('form.annuler')}
            </Button>
            {mode !== 'show' && (
              <Button type="submit" variant="contained" disabled={mutation.isPending}>
                {mutation.isPending ? t('form.chargement') : mode === 'edit' ? t('form.mettreAJour') : t('form.ajouter')}
              </Button>
            )}
          </Box>

        </form>
      </Box>

      <UnsavedChangesDialog
        open={guard.isBlocked}
        onStay={guard.cancelLeave}
        onLeave={guard.confirmLeave}
      />
    </>
  );
}
