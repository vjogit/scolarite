/**
 * La matrice de compétences d'une UE (lot 3) : parmi les compétences visées
 * par la formation, lesquelles cette UE enseigne, met en œuvre, évalue — trois
 * colonnes cochables, regroupées par bloc, codes dérivés de la position, comme
 * la maquette de la fiche les rend.
 *
 * Deux lectures : le référentiel à plat de la formation (celle de l'URL,
 * invariant 1) et la matrice de l'UE. Une écriture : le remplacement intégral,
 * sans verrou — dernier écrit gagne, choix utilisateur — sous un bouton
 * propre, distinct de celui du syllabus de l'UE (deux écritures indépendantes ;
 * un 409 de la description ne concerne jamais la matrice, ni l'inverse). La
 * garde de saisie, elle, est unique : react-router ne tient qu'un bloqueur par
 * routeur, l'état modifié remonte donc à `FormulaireSyllabus`.
 *
 * Les cases sont un contrôle local (précédent : `ChampCouleur` de `Matiere`) :
 * `ChampCase` impose un libellé visible à sa droite, ici le nom accessible
 * porte l'axe et la compétence — « Enseignée — C1 Analyser les risques ».
 */

import { useEffect, useMemo } from 'react';
import { useForm, useController, type Control } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Info } from 'lucide-react';

import { Alert, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Skeleton } from '../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { fieldErrorsFor, messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';
import {
    AXES, cleMatrice, cleReferentiel, codeCompetence, enregistrerMatrice, fetchMatrice, fetchReferentiel, libelleBloc,
    type Axe, type LiaisonCompetence, type LigneReferentiel,
} from './entites/competences';

type Axes = Record<Axe, boolean>;

/** Les valeurs du formulaire : les trois axes de chaque compétence du référentiel. */
interface ValeursMatrice {
    lignes: Record<string, Axes>;
}

const AUCUN: Axes = { enseignee: false, mise_en_oeuvre: false, evaluee: false };

/** Le formulaire déduit du référentiel et des liaisons : une entrée par compétence, cochée ou non. */
function valeursDepuis(referentiel: readonly LigneReferentiel[], liaisons: readonly LiaisonCompetence[]): ValeursMatrice {
    const parCompetence = new Map(liaisons.map((liaison) => [liaison.competence_id, liaison]));
    const lignes: Record<string, Axes> = {};
    for (const competence of referentiel) {
        const liaison = parCompetence.get(competence.id);
        lignes[String(competence.id)] = liaison === undefined
            ? AUCUN
            : { enseignee: liaison.enseignee, mise_en_oeuvre: liaison.mise_en_oeuvre, evaluee: liaison.evaluee };
    }
    return { lignes };
}

/** Les lignes à envoyer : celles dont au moins un axe est vrai — la ligne absente est l'état « non adressée ». */
function lignesCochees(valeurs: ValeursMatrice): Omit<LiaisonCompetence, 'ue_id'>[] {
    return Object.entries(valeurs.lignes)
        .filter(([, axes]) => AXES.some((axe) => axes[axe]))
        .map(([competenceId, axes]) => ({ competence_id: Number(competenceId), ...axes }));
}

/** Le référentiel regroupé par bloc, dans l'ordre du serveur (bloc puis compétence). */
function grouperParBloc(referentiel: readonly LigneReferentiel[]) {
    const blocs: { id: number; libelle: string; competences: LigneReferentiel[] }[] = [];
    for (const ligne of referentiel) {
        const dernier = blocs.at(-1);
        if (dernier?.id === ligne.bloc_id) {
            dernier.competences.push(ligne);
        } else {
            blocs.push({ id: ligne.bloc_id, libelle: libelleBloc({ code: ligne.bloc_code, libelle: ligne.bloc_libelle }), competences: [ligne] });
        }
    }
    return blocs;
}

function CaseMatrice({ control, competence, axe, disabled }: {
    control: Control<ValeursMatrice>;
    competence: LigneReferentiel;
    axe: Axe;
    disabled: boolean;
}) {
    const { t } = useTranslation('syllabus');
    const { field: { ref: refChamp, value, onChange, onBlur } } = useController({
        control,
        name: `lignes.${String(competence.id)}.${axe}` as const,
    });
    return (
        <Checkbox
            inputRef={refChamp}
            checked={value}
            onCheckedChange={(coche) => { onChange(coche); }}
            onBlur={onBlur}
            disabled={disabled}
            aria-label={t('competences.matrice.case', {
                axe: t(`competences.matrice.${axe}`),
                code: codeCompetence(competence.ordre),
                action: competence.action,
            })}
        />
    );
}

interface PropsFormulaire {
    ueId: string;
    referentiel: readonly LigneReferentiel[];
    liaisons: readonly LiaisonCompetence[];
    peutEcrire: boolean;
    onModification: (modifie: boolean) => void;
}

function FormulaireMatrice({ ueId, referentiel, liaisons, peutEcrire, onModification }: PropsFormulaire) {
    const { t } = useTranslation('syllabus');
    const queryClient = useQueryClient();
    const blocs = useMemo(() => grouperParBloc(referentiel), [referentiel]);

    const { control, handleSubmit, reset, formState: { isDirty } } = useForm<ValeursMatrice>({
        defaultValues: valeursDepuis(referentiel, liaisons),
    });

    const mutation = useMutation({
        mutationFn: (valeurs: ValeursMatrice) => enregistrerMatrice(ueId, lignesCochees(valeurs)),
        onSuccess: (relue) => {
            queryClient.setQueryData<LiaisonCompetence[]>(cleMatrice(ueId), relue);
            // La matrice relue devient la référence : le formulaire redevient « non modifié ».
            reset(valeursDepuis(referentiel, relue));
            notifySuccess(t('competences.matrice.enregistre'));
        },
        onError: (error) => {
            // Le refus porte sur `competence_id` (hors formation, inconnue) :
            // aucun champ nommé à l'écran, le message va à la notification.
            const champs = fieldErrorsFor(error);
            notifyError(champs?.competence_id ?? messageForError(error));
        },
    });

    const modifie = peutEcrire && isDirty && !mutation.isPending;
    useEffect(() => { onModification(modifie); }, [modifie, onModification]);

    const enLectureSeule = !peutEcrire;

    return (
        <form
            noValidate
            onSubmit={(event) => { void handleSubmit((valeurs) => { mutation.mutate(valeurs); })(event); }}
            className="flex w-full max-w-[800px] flex-col gap-2.5"
        >
            <h2>{t('competences.matrice.titre')}</h2>
            <p className="text-sm text-muted-foreground">{t('competences.matrice.description')}</p>

            {blocs.length === 0 ? (
                <Alert variant="info">
                    <Info />
                    <AlertTitle>{t('competences.matrice.vide')}</AlertTitle>
                </Alert>
            ) : (
                <Table aria-label={t('competences.matrice.titre')}>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('competences.matrice.colonneCompetence')}</TableHead>
                            {AXES.map((axe) => (
                                <TableHead key={axe} className="w-28 text-center">{t(`competences.matrice.${axe}`)}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {blocs.map((bloc) => (
                            <FragmentBloc key={bloc.id} libelle={bloc.libelle} competences={bloc.competences} control={control} disabled={enLectureSeule} />
                        ))}
                    </TableBody>
                </Table>
            )}

            {peutEcrire && blocs.length > 0 && (
                <div className="mt-4 flex justify-end">
                    <Button type="submit" disabled={mutation.isPending}>
                        {t('competences.matrice.enregistrer')}
                    </Button>
                </div>
            )}
        </form>
    );
}

function FragmentBloc({ libelle, competences, control, disabled }: {
    libelle: string;
    competences: readonly LigneReferentiel[];
    control: Control<ValeursMatrice>;
    disabled: boolean;
}) {
    return (
        <>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={1 + AXES.length} className="font-medium">{libelle}</TableCell>
            </TableRow>
            {competences.map((competence) => (
                <TableRow key={competence.id}>
                    <TableCell>
                        {/* L'espace explicite entre le code et l'action : le nom
                            accessible de la cellule est « C1 Analyser… », ce
                            que les specs ciblent en exact. */}
                        <span className="font-mono text-xs text-muted-foreground">{codeCompetence(competence.ordre)}</span>
                        {' '}
                        {competence.action}
                    </TableCell>
                    {AXES.map((axe) => (
                        <TableCell key={axe} className="text-center">
                            <CaseMatrice control={control} competence={competence} axe={axe} disabled={disabled} />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </>
    );
}

interface Props {
    formationId: string;
    ueId: string;
    peutEcrire: boolean;
    /** L'état modifié de la matrice, pour la garde unique de l'écran. */
    onModification: (modifie: boolean) => void;
}

export function MatriceCompetences({ formationId, ueId, peutEcrire, onModification }: Props) {
    const { t } = useTranslation('syllabus');

    const referentiel = useQuery({
        queryKey: cleReferentiel(formationId),
        queryFn: () => fetchReferentiel(formationId),
    });
    const matrice = useQuery({
        queryKey: cleMatrice(ueId),
        queryFn: () => fetchMatrice(ueId),
    });

    if (referentiel.isError || matrice.isError) {
        return (
            <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t('competences.matrice.erreurChargement')}</AlertTitle>
            </Alert>
        );
    }
    if (referentiel.data === undefined || matrice.data === undefined) return <Skeleton className="h-[200px] rounded-lg" />;

    // Le formulaire naît avec ses valeurs de référence : remonté si le
    // référentiel change de forme (une compétence ajoutée entre-temps).
    return (
        <FormulaireMatrice
            key={referentiel.data.map((ligne) => ligne.id).join(',')}
            ueId={ueId}
            referentiel={referentiel.data}
            liaisons={matrice.data}
            peutEcrire={peutEcrire}
            onModification={onModification}
        />
    );
}
