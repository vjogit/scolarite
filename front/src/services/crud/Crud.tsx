import { skipToken, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { useEffect } from "react";
import { CrudList } from "./List";
import { Form } from "./Form";
import type { CrudMode, Datasource } from "./def";
import type { DefaultValues, FieldValues } from "react-hook-form";
import { CrudContext } from "./CrudContext";
import { Alert, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('crud');

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
        // `skipToken` plutôt qu'`enabled` : il dit au typage, et pas seulement
        // à l'exécution, que la requête ne part pas sans identifiant.
        queryFn: id !== undefined && (mode === 'show' || mode === 'edit') && !formulaireInterdit
            ? () => datasource.fetch(id)
            : skipToken,
    });

    if (formulaireInterdit) return null;

    // On wrappe le contenu dans le Provider pour rendre rootPath et workflow accessibles
    const content = (() => {
    if (mode === 'list') {
        // La `key` remonte la liste quand on passe à celle d'un autre parent —
        // les matières de l'UE 1 puis celles de l'UE 2. Sans elle, le composant
        // restait monté et gardait l'état de la précédente : recherche, tri,
        // pagination et filtres de colonnes s'appliquaient à la nouvelle liste,
        // qui pouvait annoncer « aucun résultat » sur un contenu bien présent.
        return <CrudList datasource={datasource} key={JSON.stringify(datasource.queryKey)} />;
    } else if (mode === 'create') {
        return <Form datasource={datasource} initialData={datasource.emptyValue} mode="create" />;
    }

    // L'icône de sévérité que MUI dessinait d'office accompagne chaque alerte.
    if (isLoading) return <Skeleton className="h-[400px] rounded-lg" />;
    if (error) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t('erreurRecuperation')}</AlertTitle>
            </Alert>
        );
    }

    const introuvable = (
        <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>{t('donneesIntrouvables')}</AlertTitle>
        </Alert>
    );

    if (mode === 'show') {
        if (!data) return introuvable;
        return <Form datasource={datasource} initialData={data as DefaultValues<D>} mode="show" />;
    } else {
        // Reste `edit` : les quatre modes de `CrudMode` sont couverts, il n'y a
        // pas de cinquième cas à rattraper par un « page non trouvée ».
        if (!data) return introuvable;
        return <Form datasource={datasource} initialData={data as DefaultValues<D>} mode="edit" />;
    }
    })();

    return (
        <CrudContext value={{ rootPath, workflow }}>
            {content}
        </CrudContext>
    );

}