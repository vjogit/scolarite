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

import { useCallback, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, FileDown, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
    Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from '../../components/ui/combobox';
import { InputGroupAddon } from '../../components/ui/input-group';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE } from '../structure/def';
import type { Groupe } from '../structure/Groupe';
import type { Controle } from './Controle';
import { AnnonceAxe } from './AnnonceAxe';
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

/** La pastille « Rattrapage » : la teinte d'avertissement du jury (lot 15). */
const CLASSES_BADGE_AVERTISSEMENT = 'border-transparent bg-warning/15 text-warning';

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
    const { t } = useTranslation('note');
    const idGroupe = useId();

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
        libelle: t('grilleNotes.voirNotesEleve'),
        onSelect: (ligne: LigneEleve) => {
            const chemin = cheminVersEleve(pathname, ligne.userId);
            if (chemin !== null) void navigate(chemin);
        },
    }], [pathname, navigate, t]);

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

    // Référence stable tant que la liste ne change pas : Base UI compare
    // `value` par référence pour resynchroniser le texte du champ (lot 14).
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
        // `Card` à marges latérales : le `Paper p={2}` et son `Stack spacing={2}`
        // (16 px de marge, 16 px entre les blocs) tiennent dans l'espacement
        // par défaut de la carte.
        <Card className="px-4">
            {/* Même annonce de nature que sur les quatre autres axes : ce que
                l'écran est, dit par lui et non déduit de ce qu'il permet. */}
            <AnnonceAxe axe={AXE_CONTROLE} />

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h6 className="m-0 text-lg font-medium">{controle?.name ?? t('grilleNotes.notesDuControleParDefaut')}</h6>
                    {controle?.coeff != null && (
                        <Badge variant="secondary">{t('grilleNotes.coeffChip', { coeff: formatNombre.format(controle.coeff) })}</Badge>
                    )}
                    {bareme != null && (
                        <Badge variant="secondary">{t('grilleNotes.baremeChip', { bareme: formatNombre.format(bareme) })}</Badge>
                    )}
                    {isRattrapage && <Badge className={CLASSES_BADGE_AVERTISSEMENT}>{t('commun.rattrapage')}</Badge>}
                </div>

                <Combobox
                    items={groupes}
                    itemToStringLabel={(groupe: Groupe) => groupe.name}
                    isItemEqualToValue={(a, b) => a.id === b.id}
                    value={groupeChoisi}
                    onValueChange={(valeur) => { choisirGroupe(valeur); }}
                >
                    <div className="flex min-w-[260px] flex-col gap-1.5">
                        {/* Le nom accessible vient du label, comme celui que le
                            TextField MUI posait : c'est le `combobox` « Groupe »
                            que la suite e2e cible. */}
                        <Label htmlFor={idGroupe}>{t('grilleNotes.groupeLabel')}</Label>
                        <ComboboxInput id={idGroupe} placeholder={t('grilleNotes.groupePlaceholder')} showClear>
                            {groupesEnCours && (
                                <InputGroupAddon align="inline-end">
                                    <Spinner aria-hidden />
                                </InputGroupAddon>
                            )}
                        </ComboboxInput>
                    </div>
                    <ComboboxContent>
                        <ComboboxEmpty />
                        <ComboboxList>
                            {(groupe: Groupe) => (
                                <ComboboxItem key={groupe.id} value={groupe}>{groupe.name}</ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-baseline gap-4">
                    <p className="m-0 text-sm" aria-label={t('grilleNotes.progressionSaisie')}>
                        {t('grilleNotes.saisieLabel')} <strong>{pourvues}/{lignes.length}</strong>
                    </p>
                    {/* Sans ce second cas, une grille aux champs tous grisés
                        n'expliquait pas pourquoi : elle passait pour en panne. */}
                    <span className="text-xs text-muted-foreground">
                        {lectureSeule
                            ? t('grilleNotes.consultationSeule')
                            : t('grilleNotes.raccourciSaisie')}
                    </span>
                </div>

                <div className="flex items-center">
                    <NoteChartButton onClick={() => { setGraphiqueOuvert(true); }} />
                    <Tooltip>
                        <TooltipTrigger
                            render={(
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('grilleNotes.exporterLaFiche')}
                                    onClick={() => { setExportOuvert(true); }}
                                />
                            )}
                        >
                            <FileDown />
                        </TooltipTrigger>
                        <TooltipContent>{t('grilleNotes.exporterLaFiche')}</TooltipContent>
                    </Tooltip>
                    {/* L'import écrit des notes ; l'export reste une lecture. */}
                    {!lectureSeule && <FicheImportButton controleId={Number(controleId)} />}
                </div>
            </div>

            {!optionId && (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{t('grilleNotes.contexteOptionIntrouvable')}</AlertDescription>
                </Alert>
            )}

            {optionId && !groupeId && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>{t('grilleNotes.choisirGroupe')}</AlertDescription>
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
        </Card>
    );
}
