/**
 * Un écran de consultation : la liste seule, sans cycle CRUD.
 *
 * `Crud` aiguille entre quatre modes et exige donc un `Datasource` complet,
 * formulaire compris. Un écran qui n'a aucune route d'écriture n'a rien à lui
 * dire : ni schéma de validation, ni valeur vierge, ni champs à rendre. Il
 * garde en revanche tout ce que la liste apporte — table, filtres persistés,
 * état vide guidé, barre d'outils, suppression quand elle est permise.
 *
 * Le `CrudContext` reste posé : les actions de ligne construisent leur cible à
 * partir de `rootPath`, et il vaut ici le chemin de l'écran lui-même.
 */

import type { FieldValues } from 'react-hook-form';

import { CrudContext } from './CrudContext';
import type { DatasourceListe } from './def';
import { CrudList } from './List';
import { useRootPath } from './useRootPath';

interface Props<D extends FieldValues> {
    datasource: DatasourceListe<D>;
    workflow: string;
}

export function Consultation<D extends FieldValues>({ datasource, workflow }: Props<D>) {
    const rootPath = useRootPath('list');

    return (
        <CrudContext value={{ rootPath, workflow }}>
            {/* Même `key` que dans `Crud` : passer à la liste d'un autre parent
                remonte le composant, sinon l'état de table de la précédente —
                recherche, tri, filtres — s'appliquerait à la nouvelle. */}
            <CrudList datasource={datasource} key={JSON.stringify(datasource.queryKey)} />
        </CrudContext>
    );
}
