/**
 * Tableau de saisie des notes d'un groupe sur un contrôle.
 *
 * Trois choix structurent ce composant :
 *
 * 1. Les lignes viennent de l'effectif, pas des notes. Un élève sans note est
 *    une ligne vide à remplir. `services/crud/` est construit pour l'inverse,
 *    il n'est donc pas réutilisé ici.
 * 2. Chaque ligne s'enregistre pour elle-même, et le succès ne recharge rien :
 *    seul l'état de la ligne concernée est mis à jour. C'est ce qui garantit
 *    qu'un échec réseau ne peut pas faire disparaître une saisie voisine, et
 *    qu'un conflit de version n'invalide pas la grille entière.
 * 3. Le clavier est le mode d'emploi principal : « Entrée » et « Tab »
 *    descendent d'une ligne dans la colonne Note, ce qui permet de saisir un
 *    groupe entier sans jamais toucher la souris.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
    Alert, Box, Checkbox, CircularProgress, IconButton, Skeleton, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import { useQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

import { apiInstance } from '../../services/api';
import { codeFor, fieldErrorsFor, messageForError } from '../../services/errorMessages';
import { ENDPOINT_NOTE_CONTROLE, ENDPOINT_NOTE_GRILLE, NOTE } from './def';
import { bornesNote, createNoteField, libelleNote } from './noteField';
import {
    analyserNote, empreinte, formaterNote, identiteDepuisServeur,
    ligneDepuisServeur, type IdentiteNote, type LigneGrille, type LigneGrilleServeur,
    type NoteEnregistree, type SaisieLigne, type StatutLigne,
} from './ligneNote';

/**
 * Clé de la grille. Elle se range sous celle des notes du contrôle pour que
 * l'invalidation posée par l'import Excel — qui ne connaît que ce préfixe — la
 * rafraîchisse aussi, sans que ce composant ait à s'y greffer.
 */
function cleGrille(controleId: string, groupeId: string): QueryKey {
    return [NOTE, 'controle', controleId, 'grille', groupeId];
}

/** Statuts dont la saisie survit à un rechargement de la grille. */
const STATUTS_CONSERVES: ReadonlySet<StatutLigne> = new Set<StatutLigne>([
    'en-attente', 'erreur', 'conflit',
]);

const MESSAGE_LIGNE_VIDE = 'Renseignez une note ou cochez « non évalué »';

/**
 * Échec sans code d'erreur applicatif : le serveur n'a pas répondu. Le libellé
 * générique de `messageForError` laisserait croire à un refus ; ici la saisie
 * est intacte et il suffit de relancer.
 */
const MESSAGE_RESEAU = 'Serveur injoignable. La saisie est conservée, relancez l’enregistrement.';

interface Props {
    controleId: string;
    groupeId: string;
    bareme?: number;
    isRattrapage: boolean;
    /**
     * Sans le rôle d'écriture des notes : champs désactivés, aucun
     * enregistrement automatique. La grille reste visible.
     */
    lectureSeule: boolean;
    /** Remonte l'état affiché : compteur de progression et graphique. */
    onLignesChange: (lignes: LigneGrille[]) => void;
}

export function GrilleNotesTable({ controleId, groupeId, bareme, isRattrapage, lectureSeule, onLignesChange }: Props) {
    const champNote = useMemo(() => createNoteField(bareme), [bareme]);

    const { data, isLoading, error } = useQuery<LigneGrilleServeur[]>({
        queryKey: cleGrille(controleId, groupeId),
        queryFn: () => apiInstance
            .get<LigneGrilleServeur[]>(`${ENDPOINT_NOTE_GRILLE}?controle_id=${controleId}&groupe_id=${groupeId}`)
            .then(r => r.data),
    });

    const [lignes, setLignes] = useState<LigneGrille[]>([]);

    // Miroir de l'état, lu par les enregistrements qui se résolvent après coup.
    // Toutes les écritures passent par `appliquerLignes` : l'état de rendu et le
    // miroir ne peuvent donc pas diverger, et aucune fermeture ne capture une
    // version périmée des lignes.
    const lignesRef = useRef<LigneGrille[]>([]);

    // Identifiant et version de chaque note, tenus hors de l'état de rendu :
    // ils ne s'affichent pas, mais une écriture qui suit une autre sur la même
    // ligne a besoin de ceux que la précédente vient de rapporter.
    const identitesRef = useRef(new Map<number, IdentiteNote>());

    // Dernière saisie effectivement envoyée par ligne. C'est ce qui empêche le
    // `blur` déclenché par le déplacement du focus après « Entrée » de réémettre
    // la même écriture une seconde fois.
    const tentativesRef = useRef(new Map<number, string>());

    // Les écritures d'une même ligne sont sérialisées : deux créations
    // concurrentes se heurteraient à uk_note_controle_user, et la seconde
    // modification a besoin de la version que la première rapporte.
    const chainesRef = useRef(new Map<number, Promise<void>>());

    const champsRef = useRef<(HTMLInputElement | null)[]>([]);

    const appliquerLignes = useCallback((suivantes: LigneGrille[]) => {
        lignesRef.current = suivantes;
        setLignes(suivantes);
    }, []);

    const majLigne = useCallback((userId: number, transformer: (ligne: LigneGrille) => LigneGrille) => {
        appliquerLignes(lignesRef.current.map(l => (l.userId === userId ? transformer(l) : l)));
    }, [appliquerLignes]);

    // Réamorçage depuis le serveur : au premier chargement, et après un import
    // Excel qui invalide le préfixe de la clé. Une ligne dont l'écriture a
    // échoué ou qui attend encore garde sa saisie — c'est l'exigence « ne jamais
    // perdre une saisie », qui vaut aussi contre nos propres rechargements.
    useEffect(() => {
        if (!data) return;
        const precedentes = new Map(lignesRef.current.map(l => [l.userId, l]));
        appliquerLignes(data.map(brut => {
            const precedente = precedentes.get(brut.user_id);
            if (precedente && STATUTS_CONSERVES.has(precedente.statut)) return precedente;
            identitesRef.current.set(brut.user_id, identiteDepuisServeur(brut));
            tentativesRef.current.delete(brut.user_id);
            return ligneDepuisServeur(brut);
        }));
    }, [data, appliquerLignes]);

    useEffect(() => { onLignesChange(lignes); }, [lignes, onLignesChange]);

    const enregistrer = useCallback(async (userId: number, saisie: SaisieLigne) => {
        const identite = identitesRef.current.get(userId) ?? { noteId: null, version: null };

        // Validation du barème avant tout appel : une valeur hors plage est
        // signalée sur la ligne et n'atteint pas le réseau.
        const analyse = analyserNote(saisie.note, champNote);
        if (!analyse.ok) {
            majLigne(userId, l => ({ ...l, statut: 'erreur', message: analyse.message }));
            return;
        }

        const valeur = saisie.notEvaluated ? null : analyse.valeur;
        if (valeur == null && !saisie.notEvaluated) {
            // Une note effacée n'est pas une suppression : on ne détruit rien
            // sur un champ vidé par mégarde, on dit ce qui manque. Une ligne
            // restée entièrement vierge, elle, n'a simplement rien à écrire.
            const vierge = !saisie.isValidated && saisie.remarque.trim() === '';
            majLigne(userId, l => (vierge && identite.noteId == null
                ? { ...l, statut: 'inchange', message: null }
                : { ...l, statut: 'erreur', message: MESSAGE_LIGNE_VIDE }));
            return;
        }

        majLigne(userId, l => ({ ...l, statut: 'en-attente', message: null }));

        const corps = {
            note: valeur,
            remarque: saisie.remarque.trim() === '' ? null : saisie.remarque,
            user_id: userId,
            controle_id: Number(controleId),
            is_validated: saisie.isValidated,
            not_evaluated: saisie.notEvaluated,
        };

        try {
            const enregistree = identite.noteId == null
                ? (await apiInstance.post<NoteEnregistree>(ENDPOINT_NOTE_CONTROLE, corps)).data
                : (await apiInstance.put<NoteEnregistree>(
                    `${ENDPOINT_NOTE_CONTROLE}/${String(identite.noteId)}`,
                    { ...corps, id: identite.noteId, version: identite.version },
                )).data;

            identitesRef.current.set(userId, { noteId: enregistree.id, version: enregistree.version });
            // L'utilisateur a pu continuer à taper pendant l'aller-retour : la
            // ligne n'est « enregistrée » que si elle vaut encore ce qui a été
            // envoyé, sinon elle reste à écrire.
            majLigne(userId, l => ({
                ...l,
                enregistre: saisie,
                statut: empreinte(l.saisie) === empreinte(saisie) ? 'enregistre' : 'modifie',
                message: null,
            }));
        } catch (erreur) {
            if (codeFor(erreur) === 'OPTIMISTIC_LOCKING_FAILURE') {
                majLigne(userId, l => ({
                    ...l,
                    statut: 'conflit',
                    message: 'Cette note a été modifiée ailleurs. Rechargez la ligne avant de réenregistrer.',
                }));
                return;
            }
            // La saisie reste à l'écran : c'est le serveur qui n'a pas suivi,
            // pas l'utilisateur qui s'est trompé.
            const message = fieldErrorsFor(erreur)?.note
                ?? (codeFor(erreur) === null ? MESSAGE_RESEAU : messageForError(erreur));
            majLigne(userId, l => ({ ...l, statut: 'erreur', message }));
        }
    }, [champNote, controleId, majLigne]);

    const planifier = useCallback((userId: number, saisie: SaisieLigne) => {
        const precedente = chainesRef.current.get(userId) ?? Promise.resolve();
        chainesRef.current.set(userId, precedente.then(() => enregistrer(userId, saisie)));
    }, [enregistrer]);

    const enregistrerSiModifiee = useCallback((userId: number) => {
        // En lecture seule les champs sont désactivés ; ce garde couvre les
        // chemins résiduels (relance, raccourcis) : rien ne part vers le serveur.
        if (lectureSeule) return;
        const ligne = lignesRef.current.find(l => l.userId === userId);
        if (!ligne) return;

        const cle = empreinte(ligne.saisie);
        if (cle === empreinte(ligne.enregistre)) {
            // Revenue à l'état du serveur : rien à écrire, et l'erreur qu'une
            // saisie intermédiaire avait soulevée n'a plus lieu d'être. Un
            // conflit, lui, survit — la version reste périmée.
            if (ligne.statut === 'modifie' || ligne.statut === 'erreur') {
                majLigne(userId, l => ({ ...l, statut: 'inchange', message: null }));
            }
            return;
        }
        if (tentativesRef.current.get(userId) === cle) return;

        tentativesRef.current.set(userId, cle);
        planifier(userId, ligne.saisie);
    }, [lectureSeule, majLigne, planifier]);

    const modifierSaisie = useCallback((userId: number, changement: Partial<SaisieLigne>) => {
        majLigne(userId, l => ({
            ...l,
            saisie: { ...l.saisie, ...changement },
            // Un conflit ne se dissipe pas parce qu'on retape : il faut relire
            // la ligne. Les autres messages, eux, portent sur la valeur qui
            // vient d'être remplacée.
            statut: l.statut === 'conflit' ? 'conflit' : 'modifie',
            message: l.statut === 'conflit' ? l.message : null,
        }));
    }, [majLigne]);

    const focusNote = useCallback((index: number) => {
        const champ = champsRef.current[Math.min(Math.max(index, 0), lignesRef.current.length - 1)];
        champ?.focus();
        champ?.select();
    }, []);

    const rechargerLigne = useCallback(async (userId: number) => {
        const noteId = identitesRef.current.get(userId)?.noteId;
        if (noteId == null) return;

        majLigne(userId, l => ({ ...l, statut: 'en-attente', message: null }));
        try {
            const { data: note } = await apiInstance.get<NoteEnregistree>(`${ENDPOINT_NOTE_CONTROLE}/${String(noteId)}`);
            identitesRef.current.set(userId, { noteId: note.id, version: note.version });
            tentativesRef.current.delete(userId);
            const saisie: SaisieLigne = {
                note: formaterNote(note.note),
                notEvaluated: note.not_evaluated,
                isValidated: note.is_validated,
                remarque: note.remarque ?? '',
            };
            majLigne(userId, l => ({ ...l, saisie, enregistre: saisie, statut: 'inchange', message: null }));
        } catch (erreur) {
            majLigne(userId, l => ({ ...l, statut: 'conflit', message: messageForError(erreur) }));
        }
    }, [majLigne]);

    const relancer = useCallback((userId: number) => {
        tentativesRef.current.delete(userId);
        enregistrerSiModifiee(userId);
    }, [enregistrerSiModifiee]);

    const basculerNonEvalue = useCallback((userId: number, index: number, coche: boolean) => {
        majLigne(userId, l => ({
            ...l,
            saisie: { ...l.saisie, notEvaluated: coche, note: coche ? '' : l.saisie.note },
            statut: 'modifie',
            message: null,
        }));
        if (coche) {
            // Cocher rend la ligne complète : elle part tout de suite.
            enregistrerSiModifiee(userId);
        } else {
            // Décocher la vide. Refuser l'écriture avant même que la note soit
            // tapée n'apprendrait rien ; on rend la main au champ.
            focusNote(index);
        }
    }, [enregistrerSiModifiee, focusNote, majLigne]);

    const surToucheNote = useCallback((event: KeyboardEvent<HTMLElement>, userId: number, index: number) => {
        // « Entrée » et « Tab » descendent d'une ligne dans la colonne Note :
        // c'est ce qui rend la saisie d'un groupe entier faisable sans souris.
        // « Maj+Tab » n'est pas intercepté et garde l'ordre naturel, qui laisse
        // « non évalué » et « remarque » atteignables au clavier.
        if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
            event.preventDefault();
            enregistrerSiModifiee(userId);
            focusNote(index + 1);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusNote(index + 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusNote(index - 1);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            tentativesRef.current.delete(userId);
            majLigne(userId, l => ({ ...l, saisie: l.enregistre, statut: 'inchange', message: null }));
        }
    }, [enregistrerSiModifiee, focusNote, majLigne]);

    if (isLoading) return <Skeleton variant="rounded" height={360} />;
    if (error) return <Alert severity="error">Impossible de charger l'effectif du groupe.</Alert>;
    if (lignes.length === 0) {
        return <Alert severity="warning">Ce groupe ne compte aucun élève rattaché à ce contrôle.</Alert>;
    }

    return (
        <TableContainer>
            <Table size="small" aria-label="Grille de saisie des notes">
                <TableHead>
                    <TableRow>
                        <TableCell>Élève</TableCell>
                        <TableCell sx={{ width: 140 }}>{libelleNote(bareme)}</TableCell>
                        <TableCell sx={{ width: 90 }} align="center">
                            <Tooltip title="Non évalué"><span>N.É.</span></Tooltip>
                        </TableCell>
                        {isRattrapage && <TableCell sx={{ width: 90 }} align="center">Validée</TableCell>}
                        <TableCell>Remarque</TableCell>
                        <TableCell sx={{ width: 80 }} align="center">État</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {lignes.map((ligne, index) => {
                        const eleve = `${ligne.nom} ${ligne.prenom}`.trim();
                        return (
                            <TableRow key={ligne.userId} hover>
                                <TableCell>{eleve}</TableCell>
                                <TableCell>
                                    <TextField
                                        inputRef={(element: HTMLInputElement | null) => { champsRef.current[index] = element; }}
                                        value={ligne.saisie.note}
                                        onChange={(e) => { modifierSaisie(ligne.userId, { note: e.target.value }); }}
                                        onKeyDown={(e) => { surToucheNote(e, ligne.userId, index); }}
                                        onBlur={() => { enregistrerSiModifiee(ligne.userId); }}
                                        disabled={lectureSeule || ligne.saisie.notEvaluated}
                                        // Le message vaut pour l'erreur comme pour le
                                        // conflit : le second n'était visible qu'en
                                        // infobulle, donc invisible au clavier.
                                        error={ligne.statut === 'erreur' || ligne.statut === 'conflit'}
                                        helperText={ligne.message ?? undefined}
                                        size="small"
                                        variant="outlined"
                                        slotProps={{
                                            htmlInput: {
                                                // Champ texte et non numérique : « 15,5 » doit
                                                // survivre à la frappe. Les bornes du barème
                                                // restent annoncées aux technologies d'assistance.
                                                inputMode: 'decimal',
                                                'aria-label': `Note de ${eleve}`,
                                                'aria-valuemin': bornesNote(bareme).min,
                                                'aria-valuemax': bornesNote(bareme).max,
                                            },
                                        }}
                                        sx={{ width: 120 }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Checkbox
                                        checked={ligne.saisie.notEvaluated}
                                        disabled={lectureSeule}
                                        onChange={(e) => { basculerNonEvalue(ligne.userId, index, e.target.checked); }}
                                        slotProps={{ input: { 'aria-label': `Non évalué pour ${eleve}` } }}
                                    />
                                </TableCell>
                                {isRattrapage && (
                                    <TableCell align="center">
                                        <Checkbox
                                            checked={ligne.saisie.isValidated}
                                            disabled={lectureSeule}
                                            onChange={(e) => {
                                                modifierSaisie(ligne.userId, { isValidated: e.target.checked });
                                                enregistrerSiModifiee(ligne.userId);
                                            }}
                                            slotProps={{ input: { 'aria-label': `Validée pour ${eleve}` } }}
                                        />
                                    </TableCell>
                                )}
                                <TableCell>
                                    <TextField
                                        value={ligne.saisie.remarque}
                                        disabled={lectureSeule}
                                        onChange={(e) => { modifierSaisie(ligne.userId, { remarque: e.target.value }); }}
                                        onBlur={() => { enregistrerSiModifiee(ligne.userId); }}
                                        size="small"
                                        variant="outlined"
                                        fullWidth
                                        slotProps={{ htmlInput: { 'aria-label': `Remarque pour ${eleve}` } }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <IndicateurLigne
                                        ligne={ligne}
                                        eleve={eleve}
                                        onRelancer={() => { relancer(ligne.userId); }}
                                        onRecharger={() => { void rechargerLigne(ligne.userId); }}
                                    />
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

/**
 * Indicateur d'enregistrement d'une ligne. Discret par principe : la saisie est
 * automatique, l'utilisateur n'a à regarder ici que lorsque quelque chose bloque.
 */
function IndicateurLigne({ ligne, eleve, onRelancer, onRecharger }: {
    ligne: LigneGrille;
    eleve: string;
    onRelancer: () => void;
    onRecharger: () => void;
}) {
    switch (ligne.statut) {
        case 'en-attente':
            return <CircularProgress size={16} aria-label={`Enregistrement en cours pour ${eleve}`} />;
        case 'enregistre':
            return (
                <Tooltip title="Enregistrée">
                    <CheckCircleOutlineIcon fontSize="small" color="success" aria-label={`Note enregistrée pour ${eleve}`} />
                </Tooltip>
            );
        case 'modifie':
            return (
                <Tooltip title="Modifiée, pas encore enregistrée">
                    <Box
                        aria-label={`Modification non enregistrée pour ${eleve}`}
                        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', mx: 'auto' }}
                    />
                </Tooltip>
            );
        case 'erreur':
            return (
                <Tooltip title={ligne.message ?? 'Échec de l’enregistrement'}>
                    <IconButton size="small" color="error" onClick={onRelancer} aria-label={`Réessayer l'enregistrement pour ${eleve}`}>
                        <ReplayIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            );
        case 'conflit':
            return (
                <Tooltip title={ligne.message ?? 'Conflit de version'}>
                    <IconButton size="small" color="warning" onClick={onRecharger} aria-label={`Recharger la ligne de ${eleve}`}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            );
        default:
            return null;
    }
}
