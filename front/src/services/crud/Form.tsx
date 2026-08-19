import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { type Datasource } from './def';
import { fieldErrorsFor, messageForError } from '../errorMessages';
import { notifyError, notifySuccess } from '../notify';
import { messageCreation, messageEnregistrement } from './entityMessages';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useNotifications } from '@toolpad/core/useNotifications';
import { Box, Button } from '@mui/material';
import { useCrudContext } from './CrudContext';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog';


export type FormMode = 'create' | 'show' | 'edit';

interface Props<D extends FieldValues> {
  datasource: Datasource<D>
  initialData: DefaultValues<D>
  mode: FormMode
}

export function Form<D extends FieldValues>({ initialData, mode, datasource, }: Props<D>) {
  const { rootPath } = useCrudContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const isReadOnly = mode === 'show';


  const { register, handleSubmit, control, setError, formState: { errors, dirtyFields }, getValues, setValue } = useForm<D>({
    resolver: zodResolver(datasource.schema),
    // READ : On pré-remplit le formulaire avec les données existantes
    defaultValues: initialData,
  });

  const mutation = useMutation({
    // Choix dynamique de la fonction API
    mutationFn: mode === 'edit' ? datasource.update : datasource.create,
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: datasource.queryKey });
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
      navigate(rootPath, { state: { highlightId: datasource.getId(saved) } });
    },
    onError: (error) => {
      const fields = fieldErrorsFor(error);
      if (fields) {
        Object.entries(fields).forEach(([field, message]) => {
          setError(field as Parameters<typeof setError>[0], { type: 'server', message });
        });
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

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '500px', width: '100%' }}>
          <h2>
            {mode === 'show' ? 'Détails' : mode === 'edit' ? 'Modifier' : 'Ajouter'}
          </h2>

          {/* Utilisation de la fonction/composant extraite */}
          {datasource.render({ register, control, errors, isReadOnly, getValues, setValue })}


          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => { guard.requestNavigation(() => { void navigate(rootPath); }); }}
            >
              {mode === 'show' ? 'Retour' : 'Annuler'}
            </Button>
            {mode !== 'show' && (
              <Button type="submit" variant="contained" disabled={mutation.isPending}>
                {mutation.isPending ? 'Chargement...' : mode === 'edit' ? 'Mettre à jour' : 'Ajouter'}
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
    </LocalizationProvider>
  );
}
