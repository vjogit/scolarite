/**
 * La fiche syllabus d'une matière : huit rubriques, la ventilation horaire, le
 * responsable. Greffée sous la matière du workflow Structure — l'arbre garde la
 * matière sélectionnée, le panneau montre la fiche.
 *
 * La structure fait référence (principe directeur du chantier) : l'écart
 * entre `matiere.heure` et la somme des sept colonnes encadrées est signalé
 * sous la ventilation, jamais bloquant. `matiere.heure` est lu dans la liste
 * des matières de l'UE, sous la clé du repository — celle que l'arbre a déjà
 * chargée pour afficher la matière : aucune requête de plus (invariant 2).
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useWatch, type Control } from 'react-hook-form';
import { CircleAlert, TriangleAlert } from 'lucide-react';

import { Alert, AlertTitle } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { FieldLegend, FieldSet } from '../../components/ui/field';
import { ChampNombre, ChampTexte } from '../../services/ChampTexte';
import { UserSelector, type UserOption } from '../../services/UserSelector';
import { DUREE_FRAICHEUR_NOMS } from '../../services/context/resolution';
import { useDroits } from '../../services/context/droits';
import type { RenderProps } from '../../services/crud/def';
import { createMatiereRepository, type Matiere } from '../structure/entites/matiere';
import { Role } from '../user/def';
import { SYLLABUS } from './def';
import {
    CHAMPS_NOM_RESPONSABLE, HEURES_ENCADREES, HEURES_MAX, RUBRIQUES,
    cleFicheMatiere, enregistrerFicheMatiere, fetchFicheMatiere, ficheMatiereSchema, normaliserRubriques,
    type FicheMatiereFormulaire,
} from './entites/syllabus';
import { FormulaireSyllabus } from './FormulaireSyllabus';
import { useNomResponsable } from './useNomResponsable';

/** Seuls les agents peuvent être responsables ; rien en base ne l'impose, le sélecteur filtre. */
const estAgent = (option: UserOption) => option.type_personne === 'AGENT';

/**
 * Le volume encadré, vivant, et son rapport aux heures de la structure. Un
 * `role="status"` : il change sous la frappe sans réclamer d'attention. La
 * mise en évidence est sobre — le token d'avertissement des alertes — et ne
 * bloque rien.
 */
function TotalEncadre({ control, heureStructure }: { control: Control<FicheMatiereFormulaire>; heureStructure: number | null }) {
    const { t, i18n } = useTranslation('syllabus');
    const valeurs = useWatch({ control, name: [...HEURES_ENCADREES] });
    const total = valeurs.reduce<number>((somme, valeur) => somme + (typeof valeur === 'number' && !Number.isNaN(valeur) ? valeur : 0), 0);
    // Deux décimales au plus, dans la langue active : « 23,5 h » / « 23.5 h ».
    const formater = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
    const ecart = heureStructure !== null && Math.abs(total - heureStructure) > 0.001;

    const texte = heureStructure === null
        ? t('matiere.total.sansStructure', { total: formater.format(total) })
        : ecart
            ? t('matiere.total.ecart', { total: formater.format(total), heure: formater.format(heureStructure) })
            : t('matiere.total.conforme', { total: formater.format(total) });

    return (
        <p role="status" className={ecart ? 'flex items-center gap-2 text-sm font-medium text-warning' : 'text-sm text-muted-foreground'}>
            {ecart && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
            {texte}
        </p>
    );
}

function ChampsFiche({ control, errors, isReadOnly, getValues, setValue, heureStructure }: RenderProps<FicheMatiereFormulaire> & { heureStructure: number | null }) {
    const { t } = useTranslation('syllabus');

    const rubrique = (cle: typeof RUBRIQUES[number], aide?: string) => (
        <ChampTexte key={cle} name={cle} control={control} label={t(`matiere.rubriques.${cle}`)} disabled={isReadOnly} multiline rows={5} aide={aide} />
    );

    return (
        <>
            {rubrique('contexte')}
            {rubrique('objectifs', t('matiere.rubriques.objectifsAide'))}
            {rubrique('prerequis')}

            <FieldSet className="mb-4 gap-0">
                <FieldLegend>{t('matiere.heures.titre')}</FieldLegend>
                <div className="grid grid-cols-2 gap-x-4 md:grid-cols-4">
                    {HEURES_ENCADREES.map((cle) => (
                        <ChampNombre key={cle} name={cle} control={control} label={t(`matiere.heures.${cle}`)} disabled={isReadOnly} min={0} max={HEURES_MAX} step={0.5} />
                    ))}
                    <ChampNombre name="heures_perso" control={control} label={t('matiere.heures.heures_perso')} aide={t('matiere.heures.heures_persoAide')} disabled={isReadOnly} min={0} max={HEURES_MAX} step={0.5} />
                </div>
                <TotalEncadre control={control} heureStructure={heureStructure} />
            </FieldSet>

            {rubrique('activites', t('matiere.rubriques.activitesAide'))}
            {rubrique('evaluation')}
            {rubrique('plan_cours')}
            {rubrique('ressources')}
            {rubrique('dimension_socio_env')}

            <UserSelector
                control={control}
                errors={errors}
                getValues={getValues}
                setValue={setValue}
                isReadOnly={isReadOnly}
                name="responsable_id"
                champsNom={CHAMPS_NOM_RESPONSABLE}
                libelles={{ champ: t('responsable.champ'), rechercher: t('responsable.rechercher') }}
                filtrer={estAgent}
            />
        </>
    );
}

/**
 * `matiere.heure`, projeté depuis la liste des matières de l'UE : fonction de
 * requête du repository mot pour mot, projection par `select` (le commentaire
 * de tête de `freres.ts`). Même fraîcheur que l'arbre, qui tient déjà cette
 * entrée.
 */
function useHeureStructure(ueId: string, matiereId: string): number | null {
    const repository = useMemo(() => createMatiereRepository(ueId), [ueId]);
    const projeter = useCallback(
        (matieres: Matiere[]) => matieres.find((matiere) => String(matiere.id) === matiereId)?.heure ?? null,
        [matiereId],
    );
    const { data } = useQuery({
        queryKey: repository.queryKey,
        queryFn: repository.fetchAll,
        staleTime: DUREE_FRAICHEUR_NOMS,
        select: projeter,
    });
    return data ?? null;
}

function FicheMatiere({ ueId, matiereId }: { ueId: string; matiereId: string }) {
    const { t } = useTranslation('syllabus');
    const { pathname } = useLocation();
    const queryClient = useQueryClient();
    const { possedeRole } = useDroits();
    const peutEcrire = possedeRole(Role.SYLLABUS_ECRITURE);

    const { data: fiche, isError } = useQuery({
        queryKey: cleFicheMatiere(matiereId),
        queryFn: () => fetchFicheMatiere(matiereId),
    });
    const responsable = useNomResponsable(fiche?.responsable_id);
    const heureStructure = useHeureStructure(ueId, matiereId);

    const enregistrer = useCallback(async (valeurs: FicheMatiereFormulaire) => {
        const { responsable_prenom, responsable_nom, ...brute } = valeurs;
        const sauvee = await enregistrerFicheMatiere(matiereId, normaliserRubriques(brute));
        queryClient.setQueryData(cleFicheMatiere(matiereId), sauvee);
        return { ...sauvee, responsable_prenom, responsable_nom };
    }, [matiereId, queryClient]);

    const render = useCallback(
        (props: RenderProps<FicheMatiereFormulaire>) => <ChampsFiche {...props} heureStructure={heureStructure} />,
        [heureStructure],
    );

    if (isError) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t('erreurChargement')}</AlertTitle>
            </Alert>
        );
    }
    // Le nom du responsable fait partie des valeurs initiales : on attend les deux.
    if (fiche === undefined || responsable.enChargement) return <Skeleton className="h-[400px] rounded-lg" />;

    return (
        <FormulaireSyllabus<FicheMatiereFormulaire>
            titre={t('matiere.titre')}
            schema={ficheMatiereSchema}
            valeursInitiales={{ ...fiche, responsable_prenom: responsable.prenom, responsable_nom: responsable.nom }}
            peutEcrire={peutEcrire}
            enregistrer={enregistrer}
            messageSucces={t('matiere.enregistre')}
            cheminRetour={pathname.replace(new RegExp(`/${SYLLABUS}$`), '')}
            render={render}
        />
    );
}

export function SyllabusMatiere() {
    const { ueId, matiereId } = useParams();
    const { t } = useTranslation('structure');

    // Le garde vient après les hooks : sans les deux paramètres, rien à lire.
    if (ueId === undefined || matiereId === undefined) return <p>{t('matiere.erreurUeIdObligatoire')}</p>;

    // La `key` remonte le formulaire quand on passe à la fiche d'une autre
    // matière : ses valeurs de référence sont celles du montage.
    return <FicheMatiere key={matiereId} ueId={ueId} matiereId={matiereId} />;
}
