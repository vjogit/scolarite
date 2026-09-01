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
    Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogContentText, DialogTitle, IconButton, Skeleton, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip,
} from '@mui/material';
import { CircleCheck, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { apiInstance } from '../../services/api';
import { notifyUndone } from '../../services/notify';
import { estNavigation, type ActionLigne } from '../../services/crud/actions';
import { MenuActionsLigne } from '../../services/crud/MenuActionsLigne';
import { codeFor, fieldErrorsFor, messageForError } from '../../services/errorMessages';
import { ENDPOINT_NOTE_CONTROLE, ENDPOINT_NOTE_GRILLE, NOTE } from './def';
import { bornesNote, createNoteField, libelleNote } from './noteField';
import {
    analyserNote, empreinte, formaterNote, identiteDepuisServeur,
    ligneDepuisServeur, SAISIE_VIERGE, type IdentiteNote, type LigneEleve, type LigneGrille,
    type LigneGrilleServeur, type NoteEnregistree, type SaisieLigne, type StatutLigne,
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
    /**
     * Actions de ligne, déclarées par l'écran selon le contrat d'`actions.ts`.
     * Cette table n'est pas une liste CRUD — ses lignes viennent de l'effectif,
     * pas des notes — mais la colonne d'actions, elle, est la même : un menu à
     * libellés, pas des icônes muettes.
     */
    actionsLigne?: readonly ActionLigne<LigneEleve>[];
}

export function GrilleNotesTable({ controleId, groupeId, bareme, isRattrapage, lectureSeule, onLignesChange, actionsLigne = [] }: Props) {
    const { t } = useTranslation('note');
    const champNote = useMemo(() => createNoteField(bareme), [bareme]);

    const { data, isLoading, error } = useQuery<LigneGrilleServeur[]>({
        queryKey: cleGrille(controleId, groupeId),
        queryFn: () => apiInstance
            .get<LigneGrilleServeur[]>(`${ENDPOINT_NOTE_GRILLE}?controle_id=${controleId}&groupe_id=${groupeId}`)
            .then(r => r.data),
    });

    const [lignes, setLignes] = useState<LigneGrille[]>([]);
    /** Ligne dont la suppression est proposée ; `null` hors confirmation. */
    const [aSupprimer, setASupprimer] = useState<LigneGrille | null>(null);


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
    //
    // Ajusté pendant le rendu, et non dans un effet : c'est le motif que React
    // recommande pour un état qui suit une donnée entrante. L'effet rendait une
    // première fois la grille vide, puis la reposait — un aller-retour visible
    // à chaque rafraîchissement, et une cascade de rendus à chaque frappe qui
    // faisait revenir la requête.
    const [donneeAmorcee, setDonneeAmorcee] = useState<LigneGrilleServeur[] | undefined>(undefined);
    if (data && data !== donneeAmorcee) {
        // `react-x` croit voir un effet ; c'est le corps du rendu. Le greffon
        // officiel `react-hooks` accepte ce motif, qui est celui que la
        // documentation de React prescrit pour ajuster un état sur une donnée
        // entrante — React relance le rendu sans rien valider entre les deux.
        // eslint-disable-next-line react-x/set-state-in-effect
        setDonneeAmorcee(data);
        const precedentes = new Map(lignesRef.current.map(l => [l.userId, l]));
        appliquerLignes(data.map(brut => {
            const precedente = precedentes.get(brut.user_id);
            if (precedente && STATUTS_CONSERVES.has(precedente.statut)) return precedente;
            identitesRef.current.set(brut.user_id, identiteDepuisServeur(brut));
            tentativesRef.current.delete(brut.user_id);
            return ligneDepuisServeur(brut);
        }));
    }

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
                : { ...l, statut: 'erreur', message: t('grilleNotesTable.ligneVide') }));
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
                    message: t('grilleNotesTable.conflitVersion'),
                }));
                return;
            }
            // La saisie reste à l'écran : c'est le serveur qui n'a pas suivi,
            // pas l'utilisateur qui s'est trompé.
            const message = fieldErrorsFor(erreur)?.note
                ?? (codeFor(erreur) === null ? t('grilleNotesTable.reseauIndisponible') : messageForError(erreur));
            majLigne(userId, l => ({ ...l, statut: 'erreur', message }));
        }
    }, [champNote, controleId, majLigne, t]);

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

    const supprimerNote = useCallback(async (ligne: LigneGrille) => {
        const noteId = identitesRef.current.get(ligne.userId)?.noteId;
        // La ligne a pu être vidée entre l'ouverture du menu et la confirmation.
        if (noteId == null) return;

        majLigne(ligne.userId, l => ({ ...l, statut: 'en-attente', message: null }));
        try {
            // Le point d'entrée est collectif malgré l'apparence de sa route :
            // `DELETE /controle/{noteID}` ignore l'identifiant du chemin et lit
            // `{ ids }` dans le corps. `createRepository` l'appelle déjà ainsi,
            // avec `bulk` en guise d'identifiant ; on ne s'en écarte pas.
            await apiInstance.delete(`${ENDPOINT_NOTE_CONTROLE}/bulk`, { data: { ids: [noteId] } });

            // L'élève reste à l'effectif, sa note n'existe plus : la ligne
            // redevient exactement celle d'un élève jamais noté. Oublier
            // l'identité est ce qui compte — sans quoi la saisie suivante
            // tenterait un PUT sur une note détruite.
            identitesRef.current.delete(ligne.userId);
            tentativesRef.current.delete(ligne.userId);
            majLigne(ligne.userId, l => ({
                ...l,
                saisie: SAISIE_VIERGE,
                enregistre: SAISIE_VIERGE,
                statut: 'inchange',
                message: null,
            }));
            notifyUndone(t('grilleNotesTable.noteSupprimee', { nom: ligne.nom, prenom: ligne.prenom }).trim());
        } catch (erreur) {
            majLigne(ligne.userId, l => ({ ...l, statut: 'erreur', message: messageForError(erreur) }));
        }
    }, [majLigne, t]);

    // Même file que les écritures : une suppression et un enregistrement en vol
    // sur la même ligne se disputeraient `identitesRef`, et la seconde écrirait
    // sur une note que la première vient de détruire.
    const planifierSuppression = useCallback((ligne: LigneGrille) => {
        const precedente = chainesRef.current.get(ligne.userId) ?? Promise.resolve();
        chainesRef.current.set(ligne.userId, precedente.then(() => supprimerNote(ligne)));
    }, [supprimerNote]);

    /**
     * Les actions d'une ligne : celles que l'écran déclare, plus la suppression.
     *
     * `actions.ts` veut que l'écran déclare ce qu'une ligne permet. La table
     * ajoute pourtant celle-ci, et c'est délibéré : elle est seule à savoir si
     * la ligne porte réellement une note — l'identifiant vit dans
     * `identitesRef`, hors de l'état de rendu — et seule à pouvoir remettre la
     * ligne d'aplomb après coup. L'écran ne pourrait déclarer ni sa visibilité,
     * ni son effet.
     */
    const actionsPourLigne = useCallback((ligne: LigneGrille): ActionLigne<LigneEleve>[] => {
        const declarees = actionsLigne.filter(action => action.estVisible?.(ligne) ?? true);
        if (lectureSeule || identitesRef.current.get(ligne.userId)?.noteId == null) {
            return declarees;
        }
        return [...declarees, {
            id: 'supprimer-note',
            libelle: t('grilleNotesTable.supprimerLaNote'),
            icone: Trash2,
            destructive: true,
            onSelect: () => { setASupprimer(ligne); },
        }];
    }, [actionsLigne, lectureSeule, t]);

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
    if (error) return <Alert severity="error">{t('grilleNotesTable.effectifIntrouvable')}</Alert>;
    if (lignes.length === 0) {
        return <Alert severity="warning">{t('grilleNotesTable.aucunEleveRattache')}</Alert>;
    }

    return (
        <TableContainer>
            <Table size="small" aria-label={t('grilleNotesTable.grilleAriaLabel')}>
                <TableHead>
                    <TableRow>
                        <TableCell>{t('commun.eleve')}</TableCell>
                        <TableCell sx={{ width: 140 }}>{libelleNote(bareme)}</TableCell>
                        <TableCell sx={{ width: 90 }} align="center">
                            <Tooltip title={t('noteControle.nonEvalueLabel')}><span>{t('noteControle.nonEvalueAbrege')}</span></Tooltip>
                        </TableCell>
                        {isRattrapage && <TableCell sx={{ width: 90 }} align="center">{t('grilleNotesTable.colonneValidee')}</TableCell>}
                        <TableCell>{t('commun.remarque')}</TableCell>
                        <TableCell sx={{ width: 80 }} align="center">{t('grilleNotesTable.colonneEtat')}</TableCell>
                        {/* La colonne existe dès qu'une ligne peut porter une
                            action : celles que l'écran déclare, ou la suppression
                            que la table ajoute pour qui a le droit d'écrire. */}
                        {(actionsLigne.length > 0 || !lectureSeule)
                            && <TableCell sx={{ width: 64 }} align="center">{t('grilleNotesTable.colonneActions')}</TableCell>}
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
                                                'aria-label': t('grilleNotesTable.noteEleveAriaLabel', { eleve }),
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
                                        slotProps={{ input: { 'aria-label': t('grilleNotesTable.nonEvaluePourEleveAriaLabel', { eleve }) } }}
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
                                            slotProps={{ input: { 'aria-label': t('grilleNotesTable.valideePourEleveAriaLabel', { eleve }) } }}
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
                                        slotProps={{ htmlInput: { 'aria-label': t('grilleNotesTable.remarquePourEleveAriaLabel', { eleve }) } }}
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
                                {(actionsLigne.length > 0 || !lectureSeule) && (
                                <TableCell align="center">
                                    <MenuActionsLigne
                                        actions={actionsPourLigne(ligne)}
                                        nomLigne={eleve}
                                        onChoisir={(action) => {
                                            // Aucune navigation déclarative ici : la cible de
                                            // l'axe Élève ne se déduit pas d'un `rootPath`,
                                            // elle se calcule depuis les chaînons de l'URL.
                                            if (!estNavigation(action)) action.onSelect(ligne);
                                        }}
                                    />
                                </TableCell>
                                )}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <ConfirmerSuppressionNote
                ligne={aSupprimer}
                onAnnuler={() => { setASupprimer(null); }}
                onConfirmer={() => {
                    if (aSupprimer) planifierSuppression(aSupprimer);
                    setASupprimer(null);
                }}
            />
        </TableContainer>
    );
}

/**
 * Confirmation de la suppression d'une note.
 *
 * Une modale dédiée plutôt que `DeleteConfirmDialog` : celle-ci est bâtie pour
 * une collection CRUD — elle réclame un repository, un endpoint d'analyse
 * d'impact et une sélection de lignes, dont rien n'existe ici.
 *
 * Elle dit surtout ce qu'une confirmation générique ne dirait pas : supprimer
 * n'est pas déclarer l'élève non évalué. La case « N.É. » affirme qu'il était
 * concerné sans être évalué ; supprimer retire la ligne des calculs comme si
 * elle n'avait jamais existé. Ce sont deux gestes différents, et c'est le seul
 * endroit où l'on peut encore les distinguer avant que l'un soit irréversible.
 */
function ConfirmerSuppressionNote({ ligne, onAnnuler, onConfirmer }: {
    ligne: LigneGrille | null;
    onAnnuler: () => void;
    onConfirmer: () => void;
}) {
    const { t } = useTranslation('note');
    // `keepMounted` absent : la modale se démonte, mais `ligne` doit survivre au
    // rendu de fermeture pour que le nom ne disparaisse pas pendant l'animation.
    const [derniere, setDerniere] = useState<LigneGrille | null>(null);
    if (ligne !== null && ligne !== derniere) {
        setDerniere(ligne);
    }
    const affichee = ligne ?? derniere;
    if (!affichee) return null;

    const eleve = `${affichee.nom} ${affichee.prenom}`.trim();
    const valeur = affichee.enregistre.notEvaluated
        ? t('grilleNotesTable.declareNonEvalue')
        : affichee.enregistre.note.trim() === ''
            ? t('grilleNotesTable.sansValeur')
            : t('grilleNotesTable.notee', { valeur: affichee.enregistre.note });

    return (
        <Dialog open={ligne !== null} onClose={onAnnuler} maxWidth="xs" fullWidth>
            <DialogTitle>{t('grilleNotesTable.supprimerLaNoteTitre')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {t('grilleNotesTable.confirmationSuppressionPrefixe')} <strong>{eleve}</strong> {t('grilleNotesTable.confirmationSuppressionSuffixe', { valeur })}
                </DialogContentText>
                <DialogContentText sx={{ mt: 2 }}>
                    {t('grilleNotesTable.conseilNonEvalue')}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onAnnuler}>{t('commun.annuler')}</Button>
                <Button onClick={onConfirmer} color="error" variant="contained">
                    {t('grilleNotesTable.supprimerLaNote')}
                </Button>
            </DialogActions>
        </Dialog>
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
    const { t } = useTranslation('note');
    switch (ligne.statut) {
        case 'en-attente':
            return <CircularProgress size={16} aria-label={t('grilleNotesTable.enregistrementEnCoursAriaLabel', { eleve })} />;
        case 'enregistre':
            return (
                <Tooltip title={t('grilleNotesTable.enregistreeTitre')}>
                    <CircleCheck size={20} className="text-success" aria-label={t('grilleNotesTable.noteEnregistreePourEleveAriaLabel', { eleve })} />
                </Tooltip>
            );
        case 'modifie':
            return (
                <Tooltip title={t('grilleNotesTable.modifieePasEnregistreeTitre')}>
                    <Box
                        aria-label={t('grilleNotesTable.modificationNonEnregistreePourEleveAriaLabel', { eleve })}
                        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', mx: 'auto' }}
                    />
                </Tooltip>
            );
        case 'erreur':
            return (
                <Tooltip title={ligne.message ?? t('grilleNotesTable.echecEnregistrement')}>
                    <IconButton size="small" color="error" onClick={onRelancer} aria-label={t('grilleNotesTable.reessayerPourEleveAriaLabel', { eleve })}>
                        <RotateCcw size={20} />
                    </IconButton>
                </Tooltip>
            );
        case 'conflit':
            return (
                <Tooltip title={ligne.message ?? t('grilleNotesTable.conflitDeVersion')}>
                    <IconButton size="small" color="warning" onClick={onRecharger} aria-label={t('grilleNotesTable.rechargerLigneDeEleveAriaLabel', { eleve })}>
                        <RefreshCw size={20} />
                    </IconButton>
                </Tooltip>
            );
        default:
            return null;
    }
}
