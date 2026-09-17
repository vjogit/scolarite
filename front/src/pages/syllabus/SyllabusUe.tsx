/**
 * Le syllabus d'une UE : sa description (« Pourquoi cette UE ? »), son
 * responsable, et, en dessous, la matrice des compétences qu'elle développe
 * (lot 3, `MatriceCompetences`). Greffé sous l'UE du workflow Structure, à côté du formulaire
 * de structure (nom, ECTS, académique) et non dedans : deux domaines
 * d'écriture, deux rôles, deux écrans (invariant 3).
 *
 * L'UE est lue sous la clé de détail du repository UE — celle que `Crud`
 * emploie pour le détail de structure : venir de là ne coûte rien. Le PUT
 * renvoie l'UE complète, reposée sous cette même clé et dans la liste de la
 * période si elle est en cache ; aucune invalidation.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, FileDown } from 'lucide-react';

import { Alert, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { ChampTexte } from '../../services/ChampTexte';
import { UserSelector, type UserOption } from '../../services/UserSelector';
import { useDroits } from '../../services/context/droits';
import { messageForError } from '../../services/errorMessages';
import { notifyError } from '../../services/notify';
import type { RenderProps } from '../../services/crud/def';
import { createUeRepository, type Ue } from '../structure/entites/ue';
import { Role } from '../user/def';
import { SYLLABUS } from './def';
import {
    CHAMPS_NOM_RESPONSABLE, enregistrerSyllabusUe, syllabusUeSchema, telechargerFichePdf, type SyllabusUeFormulaire,
} from './entites/syllabus';
import { FormulaireSyllabus } from './FormulaireSyllabus';
import { MatriceCompetences } from './MatriceCompetences';
import { useNomResponsable } from './useNomResponsable';

const estAgent = (option: UserOption) => option.type_personne === 'AGENT';

function ChampsUe({ control, errors, isReadOnly, getValues, setValue }: RenderProps<SyllabusUeFormulaire>) {
    const { t } = useTranslation('syllabus');
    return (
        <>
            <ChampTexte name="description" control={control} label={t('ue.champDescription')} disabled={isReadOnly} multiline rows={6} />
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
 * Le téléchargement de la fiche PDF de l'UE (lot 5) : une lecture, ouverte à
 * CONSULTATION comme à tous les rôles ; la langue des libellés est celle de
 * l'interface au moment du clic. Un service PDF arrêté revient en 503, routé
 * par le message canonique de son code.
 */
function BoutonFichePdf({ ueId }: { ueId: string }) {
    const { t } = useTranslation('syllabus');
    const [enCours, setEnCours] = useState(false);

    const telecharger = useCallback(async () => {
        setEnCours(true);
        try {
            await telechargerFichePdf(ueId);
        } catch (erreur: unknown) {
            notifyError(messageForError(erreur));
        } finally {
            setEnCours(false);
        }
    }, [ueId]);

    return (
        <Button type="button" variant="outline" disabled={enCours} onClick={() => { void telecharger(); }}>
            <FileDown />
            {t('fiche.telecharger')}
        </Button>
    );
}

function SyllabusDeUe({ promotionId, periodeId, ueId }: { promotionId: string; periodeId: string; ueId: string }) {
    const { t } = useTranslation('syllabus');
    const { pathname } = useLocation();
    const queryClient = useQueryClient();
    const { possedeRole } = useDroits();
    const peutEcrire = possedeRole(Role.SYLLABUS_ECRITURE);
    // La matrice (lot 3) a son propre bouton d'enregistrement mais partage la
    // garde de saisie du formulaire : un seul bloqueur par routeur.
    const [matriceModifiee, setMatriceModifiee] = useState(false);

    const repository = useMemo(() => createUeRepository(periodeId), [periodeId]);
    const cleDetail = useMemo(() => [...repository.queryKey, ueId], [repository, ueId]);

    const { data: ue, isError } = useQuery({
        queryKey: cleDetail,
        queryFn: () => repository.fetch(ueId),
    });
    const responsable = useNomResponsable(ue?.responsable_id);

    const enregistrer = useCallback(async (valeurs: SyllabusUeFormulaire) => {
        const { responsable_prenom, responsable_nom, version, description, responsable_id } = valeurs;
        const sauvee = await enregistrerSyllabusUe(ueId, {
            version,
            description: description !== null && description.trim() === '' ? null : description,
            responsable_id,
        });
        queryClient.setQueryData<Ue>(cleDetail, sauvee);
        queryClient.setQueryData<Ue[]>(
            repository.queryKey,
            (liste) => liste?.map((element) => (element.id === sauvee.id ? sauvee : element)),
        );
        return {
            id: sauvee.id,
            version: sauvee.version,
            description: sauvee.description ?? null,
            responsable_id: sauvee.responsable_id ?? null,
            responsable_prenom,
            responsable_nom,
        };
    }, [ueId, cleDetail, repository, queryClient]);

    if (isError) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t('erreurChargement')}</AlertTitle>
            </Alert>
        );
    }
    if (ue === undefined || responsable.enChargement) return <Skeleton className="h-[300px] rounded-lg" />;

    return (
        <FormulaireSyllabus<SyllabusUeFormulaire>
            titre={t('ue.titre')}
            schema={syllabusUeSchema}
            valeursInitiales={{
                id: ue.id,
                version: ue.version,
                description: ue.description ?? null,
                responsable_id: ue.responsable_id ?? null,
                responsable_prenom: responsable.prenom,
                responsable_nom: responsable.nom,
            }}
            peutEcrire={peutEcrire}
            enregistrer={enregistrer}
            messageSucces={t('ue.enregistre')}
            cheminRetour={pathname.replace(new RegExp(`/${SYLLABUS}$`), '')}
            render={(props) => <ChampsUe {...props} />}
            modificationsExternes={matriceModifiee}
            actions={<BoutonFichePdf ueId={ueId} />}
            complement={(
                <MatriceCompetences
                    promotionId={promotionId}
                    ueId={ueId}
                    peutEcrire={peutEcrire}
                    onModification={setMatriceModifiee}
                />
            )}
        />
    );
}

export function SyllabusUe() {
    const { promotionId, periodeId, ueId } = useParams();
    const { t } = useTranslation('structure');

    if (promotionId === undefined || periodeId === undefined || ueId === undefined) return <p>{t('ue.erreurPeriodeIdObligatoire')}</p>;

    return <SyllabusDeUe key={ueId} promotionId={promotionId} periodeId={periodeId} ueId={ueId} />;
}
