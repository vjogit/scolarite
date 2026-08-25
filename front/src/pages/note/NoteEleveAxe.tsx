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

import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery, skipToken } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    Alert, Autocomplete, Box, Chip, FormControlLabel, Paper, Stack, Switch, Tab, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';

import { UserSelector, type UserOption } from '../../services/UserSelector';
import { AXE_ELEVE, cheminVersEleve } from './axes';
import {
    cleGpaEleve, cleNotesEleve, lireGpaEleve, lireNotesEleve, type NoteEleveLigne,
} from './entites/noteEleve';
import { createNotePeriodeRepository } from './entites/notePeriode';
import { nomEleve } from './entites/noteMatiere';
import { formatNote, libelleNonEvaluee, origineRattrapage } from './provenance';

/** Voir `CelluleNote.tsx` : une puce tient dans une colonne, sa phrase non. */
const POUR_LECTEUR_ECRAN = {
    position: 'absolute', width: 1, height: 1,
    overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
} as const;

interface ChampEleve {
    id: number;
    user_id: number | null | undefined;
    firstName?: string;
    lastName?: string;
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

    const [tousLesEleves, setTousLesEleves] = useState(false);
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
    const choisi = options.find(option => option.identifiant === eleveId) ?? null;

    // ── Sélecteur global, pour sortir du contexte ──────────────────────────
    const { control, formState: { errors }, getValues, setValue } = useForm<ChampEleve>({
        defaultValues: { id: 0, user_id: null },
    });
    // Lu pour que le champ reste contrôlé ; la navigation, elle, part du choix.
    useWatch({ control, name: 'user_id' });

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
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info" icon={false} variant="outlined" sx={{ py: 0.25 }}>
                {AXE_ELEVE.annonce}
            </Alert>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                {tousLesEleves ? (
                    <Box sx={{ minWidth: 320 }}>
                        <UserSelector
                            control={control}
                            errors={errors}
                            getValues={getValues}
                            setValue={setValue}
                            onChoisir={(eleve: UserOption | null) => {
                                if (eleve) allerVers(eleve.id);
                            }}
                        />
                    </Box>
                ) : (
                    <Autocomplete
                        sx={{ minWidth: 320 }}
                        size="small"
                        options={options}
                        getOptionLabel={(option) => option.nom}
                        isOptionEqualToValue={(a, b) => a.identifiant === b.identifiant}
                        value={choisi}
                        onChange={(_, valeur) => {
                            if (valeur) allerVers(Number(valeur.identifiant));
                        }}
                        noOptionsText={t('noteEleveAxe.aucunElevePeriode')}
                        renderInput={(params) => (
                            <TextField {...params} label={t('noteEleveAxe.eleveLabel')} placeholder={t('noteEleveAxe.elevePlaceholder')} />
                        )}
                    />
                )}

                <FormControlLabel
                    control={(
                        <Switch
                            checked={tousLesEleves}
                            onChange={(event) => { setTousLesEleves(event.target.checked); }}
                        />
                    )}
                    label={t('noteEleveAxe.tousLesEleves')}
                />
            </Stack>

            {eleveId === undefined && (
                <Alert severity="info">
                    {t('noteEleveAxe.choisirEleveInfo')}
                </Alert>
            )}

            {eleveId !== undefined && isLoading && <Typography>{t('commun.chargement')}</Typography>}

            {eleveId !== undefined && !isLoading && periodes.length === 0 && (
                <Alert severity="info">
                    {t('noteEleveAxe.aucuneNoteInfo')}
                </Alert>
            )}

            {periodes.length > 0 && (
                <Paper variant="outlined">
                    <Tabs
                        value={onglet}
                        onChange={(_, valeur: number) => { setOngletChoisi(valeur); }}
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label={t('noteEleveAxe.periodesRelevAriaLabel')}
                    >
                        {periodes.map(periode => <Tab key={periode.id} label={periode.nom} />)}
                    </Tabs>

                    {periodeActive && (
                        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <ChipsGpa gpa={gpaParPeriode.get(periodeActive.id)} />
                            {[...periodeActive.ues.entries()].map(([ue, lignes]) => (
                                <TableauUe key={ue} ue={ue} lignes={lignes} />
                            ))}
                        </Box>
                    )}
                </Paper>
            )}
        </Box>
    );
}

/**
 * Les deux GPA de la période. Chacun peut manquer sans que le dossier soit
 * incomplet : le dénominateur est un `NULLIF`, et une absence se dit.
 */
function ChipsGpa({ gpa }: { gpa: { gpa_periode: number | null; gpa_academique_periode: number | null } | undefined }) {
    const { t } = useTranslation('note');
    if (!gpa) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('noteEleveAxe.aucunGpaInfo')}
            </Typography>
        );
    }
    const texte = (valeur: number | null) => valeur == null ? t('noteEleveAxe.nonCalcule') : formatNote.format(valeur);
    return (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip label={t('noteEleveAxe.gpaPeriode', { valeur: texte(gpa.gpa_periode) })} color="primary" />
            <Chip label={t('noteEleveAxe.gpaAcademique', { valeur: texte(gpa.gpa_academique_periode) })} color="secondary" />
        </Box>
    );
}

function TableauUe({ ue, lignes }: { ue: string; lignes: NoteEleveLigne[] }) {
    const { t } = useTranslation('note');
    return (
        <Box>
            <Typography variant="subtitle1" sx={{ mb: 0.5, fontWeight: 600 }}>
                {ue}
                <Chip label={t('noteEleveAxe.ectsChip', { valeur: String(lignes[0]?.unite_enseignement_ects ?? 0) })} size="small" sx={{ ml: 1 }} />
            </Typography>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: '28%' }}>{t('noteEleveAxe.colonneMatiere')}</TableCell>
                            <TableCell sx={{ width: '25%' }}>{t('noteEleveAxe.colonneControle')}</TableCell>
                            <TableCell align="center" sx={{ width: '9%' }}>{t('noteEleveAxe.colonneCoeff')}</TableCell>
                            <TableCell align="center" sx={{ width: '16%' }}>{t('commun.note')}</TableCell>
                            <TableCell align="center" sx={{ width: '22%' }}>{t('noteEleveAxe.colonneType')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lignes.map(ligne => (
                            <TableRow key={ligne.id}>
                                <TableCell>{ligne.matiere_name}</TableCell>
                                <TableCell>{ligne.controle_name}</TableCell>
                                <TableCell align="center">{ligne.controle_coeff}</TableCell>
                                <TableCell align="center"><CelluleNote ligne={ligne} /></TableCell>
                                <TableCell align="center"><CelluleType ligne={ligne} /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

/** Une cellule vide se lit comme une saisie oubliée ; « N.E. » ne se lit pas. */
function CelluleNote({ ligne }: { ligne: NoteEleveLigne }) {
    if (ligne.not_evaluated || ligne.note == null) {
        return (
            <Typography component="span" variant="body2" color="text.secondary">
                {libelleNonEvaluee()}
            </Typography>
        );
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
    if (!ligne.is_rattrapage) return <Chip label={t('commun.normal')} size="small" />;
    if (!ligne.is_validated) return <Chip label={t('commun.rattrapage')} size="small" color="secondary" />;
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <Chip label={t('commun.rattrapageValide')} size="small" color="success" />
            <Box component="span" sx={POUR_LECTEUR_ECRAN}>{origineRattrapage()}</Box>
        </Box>
    );
}
