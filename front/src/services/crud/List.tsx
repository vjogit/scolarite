/**
 * Le commutateur des deux moteurs de liste (lot 7).
 *
 * La forme des colonnes du datasource décide du moteur : `colonnes`
 * (TanStack) monte le nouveau socle `DataTable` rendu en shadcn ;
 * `columns` (MRT) conserve MaterialReactTable, à l'identique. Un écran migre
 * en changeant la forme de ses colonnes, rien d'autre ; le dernier écran
 * migré emporte `ListMrt` et ce commutateur avec lui.
 */

import type { FieldValues } from 'react-hook-form';
import type { DatasourceListe } from './def';
import { CrudListMrt } from './ListMrt';
import { CrudListTanstack } from './ListTanstack';

interface Props<D extends FieldValues> {
  datasource: DatasourceListe<D>
}

export function CrudList<D extends FieldValues>({ datasource }: Props<D>) {
  if (datasource.colonnes) {
    return <CrudListTanstack datasource={datasource} />;
  }
  return <CrudListMrt datasource={datasource} />;
}
