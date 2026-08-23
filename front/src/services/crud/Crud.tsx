import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { useEffect } from "react";
import { CrudList } from "./List";
import { Form } from "./Form";
import type { CrudMode, Datasource } from "./def";
import type { DefaultValues, FieldValues } from "react-hook-form";
import { CrudProvider } from "./CrudContext";
import { Alert, Skeleton } from "@mui/material";
import { useDroits } from "../context/droits";


interface Props<D extends FieldValues> {
    mode: CrudMode
    datasource: Datasource<D>
    workflow: string
    rootPath: string
}

export function Crud<D extends FieldValues>({ datasource, mode, workflow, rootPath }: Props<D>) {

    const { id } = useParams(); // Récupère l'ID depuis l'URL
    const navigate = useNavigate();
    const { peutEcrire } = useDroits();

    // Accès direct par URL à `/new` ou `/:id/edit` sans le droit d'écriture :
    // le serveur refuserait de toute façon, mais l'utilisateur ne doit pas
    // atteindre le formulaire. Retour à la liste.
    const formulaireInterdit =
        (mode === 'create' || mode === 'edit') && !peutEcrire(datasource);

    useEffect(() => {
        if (formulaireInterdit) void navigate(rootPath, { replace: true });
    }, [formulaireInterdit, navigate, rootPath]);

    const { data, isLoading, error } = useQuery<D>({
        queryKey: [...datasource.queryKey, id],
        queryFn: () => datasource.fetch(id),
        enabled: !!id && (mode === 'show' || mode === 'edit') && !formulaireInterdit,
    });

    if (formulaireInterdit) return null;

    // On wrappe le contenu dans le Provider pour rendre rootPath et workflow accessibles
    const content = (() => {
    if (mode === 'list') {
        return <CrudList datasource={datasource} />;
    } else if (mode === 'create') {
        return <Form datasource={datasource} initialData={datasource.emptyValue} mode="create" />;
    }

    if (isLoading) return <Skeleton variant="rounded" height={400} />;
    if (error) return <Alert severity="error">Erreur lors de la récupération.</Alert>;

    if (mode === 'show') {
        if (!data) return <Alert severity="warning">Données introuvables.</Alert>;
        return <Form datasource={datasource} initialData={data as DefaultValues<D>} mode="show" />;
    } else {
        // Reste `edit` : les quatre modes de `CrudMode` sont couverts, il n'y a
        // pas de cinquième cas à rattraper par un « page non trouvée ».
        if (!data) return <Alert severity="warning">Données introuvables.</Alert>;
        return <Form datasource={datasource} initialData={data as DefaultValues<D>} mode="edit" />;
    }
    })();

    return (
        <CrudProvider value={{ rootPath, workflow }}>
            {content}
        </CrudProvider>
    );

}