/**
 * Axe Élève : le relevé complet d'un élève, période par période.
 *
 * L'écran d'origine vivait hors de tout — élève absent de l'URL, sélecteur non
 * filtré, ni fil ni barre de tâches, atteignable par une entrée de menu à part.
 * Il devient le cinquième axe, et l'élève un chaînon de l'URL comme le reste du
 * contexte : `…/periode/2/eleve/42/note`. Le lien se partage, le rechargement
 * le retrouve, le fil le nomme et offre ses frères.
 *
 * Le contexte de période choisit l'onglet ouvert et pré-filtre le sélecteur ; il
 * ne restreint pas la lecture. Le serveur rend le dossier entier, ce qui permet
 * de comparer deux semestres sans quitter l'écran.
 */

import { useId, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery, skipToken } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import {
    Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from '../../components/ui/combobox';
import { Label } from '../../components/ui/label';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ChampInterrupteur } from '../../services/ChampChoix';
import { UserSelector, type UserOption } from '../../services/UserSelector';
import { AXE_ELEVE, cheminVersEleve } from './axes';
import { AnnonceAxe } from './AnnonceAxe';
import {
    cleGpaEleve, cleNotesEleve, lireGpaEleve, lireNotesEleve, type NoteEleveLigne,
} from './entites/noteEleve';
import { createNotePeriodeRepository } from './entites/notePeriode';
import { nomEleve } from './entites/noteMatiere';
import { formatNote, libelleNonEvaluee, origineRattrapage } from './provenance';

/** La pastille d'un rattrapage validé : la teinte de succès du jury (lot 15). */
const CLASSES_BADGE_SUCCES = 'border-transparent bg-success/15 text-success';

/**
 * Le formulaire de l'écran : l'élève cherché hors contexte (`UserSelector`) et
 * l'interrupteur qui ouvre cette recherche. Le second n'est pas une donnée
 * métier, mais il passe par le contrat des champs partagés comme les
 * interrupteurs du jury (lot 15) — un écran ne recâble pas un `Switch`.
 */
interface ChampEleve {
    id: number;
    user_id: number | null | undefined;
    firstName?: string;
    lastName?: string;
    tous_les_eleves: boolean;
}

/** Un élève de l'effectif de la période, tel que le sélecteur le propose. */
interface EleveDuContexte {
    identifiant: string;
    nom: string;
}

export function AxeNoteEleve() {
    const { periodeId, eleveId } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { t } = useTranslation('note');
    const idEleve = useId();

    // `null` tant que l'utilisateur n'a pas choisi d'onglet : le défaut vient
    // alors du contexte. Après un clic, son choix tient — clamé au nombre de
    // périodes, sans quoi passer à un dossier plus court laisserait l'onglet
    // au-delà du dernier et n'afficherait aucune note.
    const [ongletChoisi, setOngletChoisi] = useState<number | null>(null);

    const allerVers = (userId: number) => {
        const chemin = cheminVersEleve(pathname, userId);
        if (chemin !== null) void navigate(chemin);
    };

    // ── Sélecteur contextuel : l'effectif de la période ────────────────────
    // Même repository et même clé que l'axe Période : quand celui-ci a déjà été
    // affiché, la liste sort du cache sans un appel de plus. C'est l'argument
    // de `freres.ts`, appliqué ici.
    const depotPeriode = useMemo(
        () => periodeId === undefined ? null : createNotePeriodeRepository(periodeId),
        [periodeId],
    );
    const { data: effectif = [] } = useQuery({
        queryKey: depotPeriode?.queryKey ?? ['note', 'periode', 'sans-objet'],
        queryFn: depotPeriode?.fetchAll ?? skipToken,
    });

    const options = useMemo<EleveDuContexte[]>(
        () => effectif.map(ligne => ({
            identifiant: String(ligne.user_id),
            nom: nomEleve(ligne),
        })),
        [effectif],
    );
    // Référence stable tant que l'effectif ne change pas : Base UI compare
    // `value` par référence pour resynchroniser le texte du champ (lot 14).
    const choisi = options.find(option => option.identifiant === eleveId) ?? null;

    // ── Sélecteur global, pour sortir du contexte ──────────────────────────
    const { control, formState: { errors }, getValues, setValue } = useForm<ChampEleve>({
        defaultValues: { id: 0, user_id: null, tous_les_eleves: false },
    });
    // Lu pour que le champ reste contrôlé ; la navigation, elle, part du choix.
    useWatch({ control, name: 'user_id' });
    const tousLesEleves = useWatch({ control, name: 'tous_les_eleves' });

    // ── Le relevé ──────────────────────────────────────────────────────────
    const { data: notes = [], isLoading } = useQuery({
        queryKey: cleNotesEleve(eleveId ?? ''),
        queryFn: eleveId === undefined ? skipToken : lireNotesEleve(eleveId),
    });
    const { data: gpa = [] } = useQuery({
        queryKey: cleGpaEleve(eleveId ?? ''),
        queryFn: eleveId === undefined ? skipToken : lireGpaEleve(eleveId),
    });

    // Groupement par période puis par UE, l'ordre du serveur conservé.
    const periodes = useMemo(() => {
        const parPeriode = new Map<number, { nom: string; ues: Map<string, NoteEleveLigne[]> }>();
        for (const note of notes) {
            let periode = parPeriode.get(note.periode_id);
            if (!periode) {
                periode = { nom: note.periode_name, ues: new Map() };
                parPeriode.set(note.periode_id, periode);
            }
            let lignes = periode.ues.get(note.unite_enseignement_name);
            if (!lignes) {
                lignes = [];
                periode.ues.set(note.unite_enseignement_name, lignes);
            }
            lignes.push(note);
        }
        return [...parPeriode.entries()].map(([id, contenu]) => ({ id, ...contenu }));
    }, [notes]);

    const gpaParPeriode = useMemo(
        () => new Map(gpa.map(ligne => [ligne.periode_id, ligne])),
        [gpa],
    );

    // Sans choix explicite, la période du contexte : on arrive presque toujours
    // ici depuis un écran qui en désigne une, et ouvrir un autre semestre serait
    // une position que l'utilisateur n'a pas demandée.
    const rangContexte = periodes.findIndex(periode => String(periode.id) === periodeId);
    const ongletDefaut = rangContexte === -1 ? 0 : rangContexte;
    const onglet = ongletChoisi !== null && ongletChoisi < periodes.length
        ? ongletChoisi
        : ongletDefaut;
    const periodeActive = periodes[onglet];

    return (
        <div className="flex flex-col gap-4 p-4">
            <AnnonceAxe axe={AXE_ELEVE} />

            <div className="flex flex-wrap items-center gap-4">
                {tousLesEleves ? (
                    <div className="min-w-[320px] [&>div]:mb-0">
                        <UserSelector
                            control={control}
                            errors={errors}
                            getValues={getValues}
                            setValue={setValue}
                            onChoisir={(eleve: UserOption | null) => {
                                if (eleve) allerVers(eleve.id);
                            }}
                        />
                    </div>
                ) : (
                    <Combobox
                        items={options}
                        itemToStringLabel={(option: EleveDuContexte) => option.nom}
                        isItemEqualToValue={(a, b) => a.identifiant === b.identifiant}
                        value={choisi}
                        onValueChange={(valeur) => {
                            if (valeur) allerVers(Number(valeur.identifiant));
                        }}
                    >
                        <div className="flex min-w-[320px] flex-col gap-1.5">
                            {/* Le nom accessible vient du label : c'est le
                                `combobox` « Élève de la période » que la suite
                                e2e cible (`notes-unifie.spec.ts`). */}
                            <Label htmlFor={idEleve}>{t('noteEleveAxe.eleveLabel')}</Label>
                            <ComboboxInput id={idEleve} placeholder={t('noteEleveAxe.elevePlaceholder')} showClear />
                        </div>
                        <ComboboxContent>
                            <ComboboxEmpty>{t('noteEleveAxe.aucunElevePeriode')}</ComboboxEmpty>
                            <ComboboxList>
                                {(option: EleveDuContexte) => (
                                    <ComboboxItem key={option.identifiant} value={option}>{option.nom}</ComboboxItem>
                                )}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                )}

                <ChampInterrupteur
                    name="tous_les_eleves"
                    control={control}
                    label={t('noteEleveAxe.tousLesEleves')}
                    className="mb-0 w-auto"
                />
            </div>

            {eleveId === undefined && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>{t('noteEleveAxe.choisirEleveInfo')}</AlertDescription>
                </Alert>
            )}

            {eleveId !== undefined && isLoading && <p className="m-0">{t('commun.chargement')}</p>}

            {eleveId !== undefined && !isLoading && periodes.length === 0 && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>{t('noteEleveAxe.aucuneNoteInfo')}</AlertDescription>
                </Alert>
            )}

            {periodes.length > 0 && (
                <div className="rounded-xl border bg-card text-card-foreground">
                    <Tabs
                        value={onglet}
                        onValueChange={(valeur) => { if (typeof valeur === 'number') setOngletChoisi(valeur); }}
                        className="gap-0"
                    >
                        {/* Le débordement défile ici — l'héritier du
                            `variant="scrollable"` MUI. Le `py-1` dégage le
                            soulignement de l'onglet actif, posé sous la liste
                            (piège `BarreWorkflows`, lot 5). */}
                        <div className="overflow-x-auto border-b px-2 py-1">
                            <TabsList variant="line" aria-label={t('noteEleveAxe.periodesRelevAriaLabel')}>
                                {periodes.map((periode, rang) => (
                                    <TabsTrigger key={periode.id} value={rang} className="flex-none">
                                        {periode.nom}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>

                        {periodeActive && (
                            <div className="flex flex-col gap-4 p-4">
                                <ChipsGpa gpa={gpaParPeriode.get(periodeActive.id)} />
                                {[...periodeActive.ues.entries()].map(([ue, lignes]) => (
                                    <TableauUe key={ue} ue={ue} lignes={lignes} />
                                ))}
                            </div>
                        )}
                    </Tabs>
                </div>
            )}
        </div>
    );
}

/**
 * Les deux GPA de la période. Chacun peut manquer sans que le dossier soit
 * incomplet : le dénominateur est un `NULLIF`, et une absence se dit.
 */
function ChipsGpa({ gpa }: { gpa: { gpa_periode: number | null; gpa_academique_periode: number | null } | undefined }) {
    const { t } = useTranslation('note');
    if (!gpa) {
        return <p className="m-0 text-sm text-muted-foreground">{t('noteEleveAxe.aucunGpaInfo')}</p>;
    }
    const texte = (valeur: number | null) => valeur == null ? t('noteEleveAxe.nonCalcule') : formatNote.format(valeur);
    return (
        <div className="flex flex-wrap gap-4">
            <Badge>{t('noteEleveAxe.gpaPeriode', { valeur: texte(gpa.gpa_periode) })}</Badge>
            <Badge variant="secondary">{t('noteEleveAxe.gpaAcademique', { valeur: texte(gpa.gpa_academique_periode) })}</Badge>
        </div>
    );
}

function TableauUe({ ue, lignes }: { ue: string; lignes: NoteEleveLigne[] }) {
    const { t } = useTranslation('note');
    return (
        <div>
            <h6 className="m-0 mb-1 flex items-center gap-2 text-base font-semibold">
                {ue}
                <Badge variant="secondary">{t('noteEleveAxe.ectsChip', { valeur: String(lignes[0]?.unite_enseignement_ects ?? 0) })}</Badge>
            </h6>
            <div className="overflow-x-auto rounded-lg border">
                <Table className="table-fixed">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[28%]">{t('noteEleveAxe.colonneMatiere')}</TableHead>
                            <TableHead className="w-[25%]">{t('noteEleveAxe.colonneControle')}</TableHead>
                            <TableHead className="w-[9%] text-center">{t('noteEleveAxe.colonneCoeff')}</TableHead>
                            <TableHead className="w-[16%] text-center">{t('commun.note')}</TableHead>
                            <TableHead className="w-[22%] text-center">{t('noteEleveAxe.colonneType')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lignes.map(ligne => (
                            <TableRow key={ligne.id}>
                                <TableCell>{ligne.matiere_name}</TableCell>
                                <TableCell>{ligne.controle_name}</TableCell>
                                <TableCell className="text-center">{ligne.controle_coeff}</TableCell>
                                <TableCell className="text-center"><CelluleNote ligne={ligne} /></TableCell>
                                <TableCell className="text-center"><CelluleType ligne={ligne} /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

/** Une cellule vide se lit comme une saisie oubliée ; « N.E. » ne se lit pas. */
function CelluleNote({ ligne }: { ligne: NoteEleveLigne }) {
    if (ligne.not_evaluated || ligne.note == null) {
        return <span className="text-sm text-muted-foreground">{libelleNonEvaluee()}</span>;
    }
    return <>{formatNote.format(ligne.note)}</>;
}

/**
 * Un rattrapage validé n'est pas un rattrapage comme un autre : c'est lui qui
 * porte la matière au seuil « E » de la promotion. La distinction ne s'affichait
 * nulle part, alors qu'elle explique à elle seule une moyenne de matière qui ne
 * correspond à aucune copie.
 */
function CelluleType({ ligne }: { ligne: NoteEleveLigne }) {
    const { t } = useTranslation('note');
    if (!ligne.is_rattrapage) return <Badge variant="outline">{t('commun.normal')}</Badge>;
    if (!ligne.is_validated) return <Badge variant="secondary">{t('commun.rattrapage')}</Badge>;
    return (
        <span className="inline-flex items-center">
            <Badge className={CLASSES_BADGE_SUCCES}>{t('commun.rattrapageValide')}</Badge>
            {/* Voir `CelluleNote.tsx` : une puce tient dans une colonne, sa
                phrase non. */}
            <span className="sr-only">{origineRattrapage()}</span>
        </span>
    );
}
