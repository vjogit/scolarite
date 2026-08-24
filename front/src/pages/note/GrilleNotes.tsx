/**
 * Grille de saisie des notes d'un contrôle.
 *
 * Elle remplace la liste au niveau contrôle. La liste était alimentée par les
 * notes existantes : saisir la note d'un élève supposait de le chercher dans un
 * formulaire page entière, puis de recommencer — trente allers-retours pour une
 * classe de trente. Ici les lignes viennent de l'effectif du groupe, elles sont
 * toutes présentes dès l'ouverture, et chacune s'enregistre seule.
 *
 * L'export et l'import Excel restent offerts en en-tête : ils redeviennent une
 * option, ils n'ont plus à servir de contournement.
 */

import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    Alert, Autocomplete, Box, Chip, CircularProgress, IconButton, Paper, Stack,
    TextField, Tooltip, Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useQuery } from '@tanstack/react-query';

import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE } from '../structure/def';
import type { Groupe } from '../structure/Groupe';
import type { Controle } from './Controle';
import { FicheExportModal } from './FicheExportModal';
import { FicheImportButton } from './FicheImportButton';
import { NoteChartButton } from './NoteChartButton';
import { NoteChartModal, type NoteData } from './NoteChartModal';
import { GrilleNotesTable } from './GrilleNotesTable';
import { analyserNote, estPourvue, type LigneEleve, type LigneGrille } from './ligneNote';
import { AXE_CONTROLE, cheminVersEleve } from './axes';
import type { ActionLigne } from '../../services/crud/actions';
import { createNoteField } from './noteField';
import { formatNombre } from '../../services/format';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';

/**
 * Le groupe choisi est mémorisé par contrôle, le temps de la session. Rouvrir
 * la grille d'un contrôle qu'on est en train de corriger ne doit pas coûter un
 * nouveau choix à chaque fois.
 */
const cleGroupeMemorise = (controleId: string) => `note_grille_groupe_${controleId}`;

interface Props {
    controleId: string;
    optionId: string | undefined;
    controle: Controle | undefined;
    isRattrapage: boolean;
    bareme?: number;
}

export function GrilleNotes({ controleId, optionId, controle, isRattrapage, bareme }: Props) {
    // Sans le rôle d'écriture des notes, la grille s'affiche en lecture seule :
    // consulter les notes reste légitime, seule la saisie disparaît.
    const { possedeRole } = useDroits();
    const lectureSeule = !possedeRole(Role.NOTES_ECRITURE);

    const navigate = useNavigate();
    const { pathname } = useLocation();

    /**
     * La couture entre l'axe de saisie et l'axe Élève : depuis la ligne d'un
     * élève, son relevé complet. Sans icône, donc dans le menu à libellés et
     * non promue en bouton — une icône de plus dans une grille de saisie
     * détournerait du geste principal, qui est de taper des notes.
     *
     * Une action de rappel et non de navigation : la cible ne se déduit pas
     * d'un `rootPath` mais des chaînons de l'URL, la période du contexte étant
     * conservée et tout ce qui la suit abandonné.
     */
    const actionsLigne = useMemo<readonly ActionLigne<LigneEleve>[]>(() => [{
        id: 'notes-eleve',
        libelle: "Voir les notes de l'élève",
        onSelect: (ligne: LigneEleve) => {
            const chemin = cheminVersEleve(pathname, ligne.userId);
            if (chemin !== null) void navigate(chemin);
        },
    }], [pathname, navigate]);

    const [groupeId, setGroupeId] = useState<string | null>(
        () => sessionStorage.getItem(cleGroupeMemorise(controleId)),
    );
    const [lignes, setLignes] = useState<LigneGrille[]>([]);
    const [exportOuvert, setExportOuvert] = useState(false);
    const [graphiqueOuvert, setGraphiqueOuvert] = useState(false);

    const { data: groupes = [], isLoading: groupesEnCours } = useQuery<Groupe[]>({
        queryKey: ['groupe', optionId],
        queryFn: () => apiInstance.get<Groupe[]>(`${ENDPOINT_GROUPE}?option_id=${optionId ?? ''}`).then(r => r.data),
        enabled: !!optionId,
    });

    const groupeChoisi = groupes.find(g => String(g.id) === groupeId) ?? null;

    const choisirGroupe = useCallback((groupe: Groupe | null) => {
        const identifiant = groupe ? String(groupe.id) : null;
        setGroupeId(identifiant);
        if (identifiant) sessionStorage.setItem(cleGroupeMemorise(controleId), identifiant);
        else sessionStorage.removeItem(cleGroupeMemorise(controleId));
    }, [controleId]);

    const champNote = useMemo(() => createNoteField(bareme), [bareme]);

    // Progression fondée sur ce qui est à l'écran : une note valide saisie ou
    // une ligne marquée non évaluée. Elle avance donc à la frappe, sans attendre
    // le verdict du serveur.
    const pourvues = useMemo(
        () => lignes.filter(l => estPourvue(l.saisie, champNote)).length,
        [lignes, champNote],
    );

    const donneesGraphique = useMemo<NoteData[]>(() => lignes.map(ligne => {
        const analyse = analyserNote(ligne.saisie.note, champNote);
        return {
            note: analyse.ok ? analyse.valeur : null,
            firstName: ligne.prenom,
            lastName: ligne.nom,
        };
    }), [lignes, champNote]);

    return (
        <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
                {/* Même annonce de nature que sur les quatre autres axes : ce que
                    l'écran est, dit par lui et non déduit de ce qu'il permet. */}
                <Alert severity="info" icon={false} variant="outlined" sx={{ py: 0.25 }}>
                    {AXE_CONTROLE.annonce}
                </Alert>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        <Typography variant="h6">{controle?.name ?? 'Notes du contrôle'}</Typography>
                        {controle?.coeff != null && (
                            <Chip size="small" label={`Coeff. ${formatNombre.format(controle.coeff)}`} />
                        )}
                        {bareme != null && (
                            <Chip size="small" label={`Barème /${formatNombre.format(bareme)}`} />
                        )}
                        {isRattrapage && <Chip size="small" color="warning" label="Rattrapage" />}
                    </Box>

                    <Autocomplete
                        sx={{ minWidth: 260 }}
                        size="small"
                        options={groupes}
                        getOptionLabel={(g) => g.name}
                        value={groupeChoisi}
                        onChange={(_, valeur) => { choisirGroupe(valeur); }}
                        loading={groupesEnCours}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Groupe"
                                placeholder="Choisir un groupe"
                                slotProps={{
                                    input: {
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {groupesEnCours && <CircularProgress size={18} />}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    },
                                }}
                            />
                        )}
                    />
                </Box>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
                        <Typography variant="body2" aria-label="Progression de la saisie">
                            Saisie : <strong>{pourvues}/{lignes.length}</strong>
                        </Typography>
                        {/* Sans ce second cas, une grille aux champs tous grisés
                            n'expliquait pas pourquoi : elle passait pour en panne. */}
                        <Typography variant="caption" color="text.secondary">
                            {lectureSeule
                                ? "Consultation seule : la saisie demande le rôle d'écriture des notes."
                                : "Entrée ou Tab enregistre la ligne et passe à l'élève suivant."}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <NoteChartButton onClick={() => { setGraphiqueOuvert(true); }} />
                        <Tooltip title="Exporter la fiche">
                            <IconButton onClick={() => { setExportOuvert(true); }} aria-label="Exporter la fiche">
                                <FileDownloadIcon />
                            </IconButton>
                        </Tooltip>
                        {/* L'import écrit des notes ; l'export reste une lecture. */}
                        {!lectureSeule && <FicheImportButton controleId={Number(controleId)} />}
                    </Box>
                </Box>

                {!optionId && (
                    <Alert severity="error">
                        Le contexte de l'option est introuvable : impossible de lister les groupes.
                    </Alert>
                )}

                {optionId && !groupeId && (
                    <Alert severity="info">
                        Choisissez un groupe pour afficher son effectif et saisir les notes.
                    </Alert>
                )}

                {optionId && groupeId && (
                    // Remontage à chaque changement de groupe : l'état de saisie
                    // d'un effectif n'a aucun sens pour un autre.
                    <GrilleNotesTable
                        key={groupeId}
                        controleId={controleId}
                        groupeId={groupeId}
                        bareme={bareme}
                        isRattrapage={isRattrapage}
                        lectureSeule={lectureSeule}
                        onLignesChange={setLignes}
                        actionsLigne={actionsLigne}
                    />
                )}
            </Stack>

            <FicheExportModal
                open={exportOuvert}
                controleId={Number(controleId)}
                optionId={optionId ?? ''}
                onClose={() => { setExportOuvert(false); }}
            />
            <NoteChartModal
                open={graphiqueOuvert}
                onClose={() => { setGraphiqueOuvert(false); }}
                data={donneesGraphique}
            />
        </Paper>
    );
}
