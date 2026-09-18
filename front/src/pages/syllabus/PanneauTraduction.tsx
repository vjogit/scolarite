/**
 * Le panneau de relecture de la traduction anglaise (lot 6), sous la fiche
 * d'une matière et sous le syllabus d'une UE : pour chaque champ qui a un
 * texte français ENREGISTRÉ, la source à gauche, la traduction à droite.
 *
 * La machine propose, le rédacteur dispose. « Traduire automatiquement »
 * demande au serveur une proposition champ par champ (une fiche entière
 * dépasserait ses délais), puis enregistre le tout d'un seul PUT en statut
 * `automatique` — un échec en route n'écrit rien. « Enregistrer comme relue »
 * écrit les textes du formulaire en statut `relue`, contre la source affichée :
 * c'est aussi le geste qui guérit une traduction périmée. La péremption est
 * signalée (ligne `role="status"`), jamais bloquante.
 *
 * Comme la matrice de compétences, le panneau a son propre bouton mais pas sa
 * propre garde : react-router ne tient qu'un bloqueur par routeur, l'état
 * modifié remonte par `onModification` vers la garde du formulaire principal.
 * Sans le rôle d'écriture : lecture seule, aucun bouton (invariant 3) ; sans
 * traducteur configuré côté serveur : pas de bouton « Traduire ».
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Languages, TriangleAlert } from 'lucide-react';

import { Alert, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { ChampTexte } from '../../services/ChampTexte';
import { messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';
import {
    cleTraduction, enregistrerTraduction, fetchTraduction, proposerTraduction,
    type CleTraduction, type NatureTraduction, type StatutTraduction, type TextesTraduits, type Traduction,
} from './entites/traduction';

/** Un champ traduisible : sa clé, et son texte français enregistré. */
export interface ChampSource {
    cle: CleTraduction;
    /** Le libellé du champ français, tel que le formulaire le nomme. */
    libelle: string;
    source: string | null;
}

interface Props {
    nature: NatureTraduction;
    id: string;
    /** Tous les champs de la nature, dans l'ordre de l'écran. */
    champs: ChampSource[];
    peutEcrire: boolean;
    /** Le formulaire français a des modifications non enregistrées. */
    sourceModifiee: boolean;
    onModification: (modifie: boolean) => void;
}

/** Le texte français a changé entre deux propositions : l'enchaînement s'arrête. */
class SourceChangee extends Error {}

const estRempli = (texte: string | null | undefined): texte is string => typeof texte === 'string' && texte.trim() !== '';

function LigneStatut({ traduction }: { traduction: Traduction }) {
    const { t, i18n } = useTranslation('syllabus');
    const date = traduction.traduit_le === null
        ? ''
        : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(traduction.traduit_le));

    let statut = t('traduction.statut.absente');
    if (traduction.version > 0) {
        if (traduction.statut === 'relue') statut = t('traduction.statut.relue', { date });
        else if (traduction.modele === null) statut = t('traduction.statut.automatiqueSansModele', { date });
        else statut = t('traduction.statut.automatique', { modele: traduction.modele, date });
    }

    return (
        <p role="status" className={traduction.perimee ? 'flex items-center gap-2 text-sm font-medium text-warning' : 'text-sm text-muted-foreground'}>
            {traduction.perimee && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
            <span>
                {statut}
                {traduction.perimee && ` ${t('traduction.statut.perimee')}`}
            </span>
        </p>
    );
}

interface PropsConfirmation {
    open: boolean;
    relue: boolean;
    onGarder: () => void;
    onRemplacer: () => void;
}

/** Sur le modèle d'`UnsavedChangesDialog` : deux issues nommées par leur conséquence, focus sur celle qui préserve. */
function ConfirmationRemplacement({ open, relue, onGarder, onRemplacer }: PropsConfirmation) {
    const { t } = useTranslation('syllabus');
    const garderRef = useRef<HTMLButtonElement>(null);

    return (
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onGarder(); }}>
            <DialogContent showCloseButton={false} initialFocus={garderRef}>
                <DialogHeader>
                    <DialogTitle>{t('traduction.confirmation.titre')}</DialogTitle>
                    <DialogDescription>
                        {relue ? t('traduction.confirmation.corpsRelue') : t('traduction.confirmation.corps')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" ref={garderRef} onClick={onGarder}>
                        {t('traduction.confirmation.garder')}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onRemplacer}>
                        {t('traduction.confirmation.remplacer')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface PropsFormulaire extends Props {
    traduction: Traduction;
}

function FormulaireTraduction({ nature, id, champs, peutEcrire, sourceModifiee, onModification, traduction }: PropsFormulaire) {
    const { t } = useTranslation('syllabus');
    const queryClient = useQueryClient();
    const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null);
    const [confirmation, setConfirmation] = useState(false);

    const aTraduire = useMemo(() => champs.filter((champ) => estRempli(champ.source)), [champs]);
    const valeursInitiales = useMemo(
        () => Object.fromEntries(champs.map(({ cle }) => [cle, traduction.textes[cle] ?? ''])) as Record<string, string>,
        [champs, traduction],
    );
    const { control, handleSubmit, formState: { isDirty } } = useForm<Record<string, string>>({ defaultValues: valeursInitiales });

    /** Écrit contre la source affichée ; le panneau se remonte sur la nouvelle version (`key` du parent). */
    const ecrire = async (statut: StatutTraduction, textes: TextesTraduits): Promise<Traduction> => {
        const sauvee = await enregistrerTraduction(nature, id, {
            version: traduction.version,
            statut,
            version_source: traduction.source_version,
            empreinte_source: traduction.source_empreinte,
            textes,
        });
        queryClient.setQueryData(cleTraduction(nature, id), sauvee);
        return sauvee;
    };

    const relire = useMutation({
        mutationFn: (valeurs: Record<string, string>) => {
            const textes: TextesTraduits = {};
            for (const { cle } of champs) textes[cle] = estRempli(valeurs[cle]) ? valeurs[cle] : null;
            return ecrire('relue', textes);
        },
        onSuccess: () => { notifySuccess(t('traduction.enregistre')); },
        onError: (erreur) => { notifyError(messageForError(erreur)); },
    });

    const traduire = useMutation({
        mutationFn: async () => {
            const textes: TextesTraduits = {};
            for (const { cle } of champs) textes[cle] = null;
            setProgression({ fait: 0, total: aTraduire.length });
            for (const [rang, { cle }] of aTraduire.entries()) {
                const proposition = await proposerTraduction(nature, id, cle);
                if (proposition.source_empreinte !== traduction.source_empreinte) throw new SourceChangee();
                textes[cle] = proposition.texte;
                setProgression({ fait: rang + 1, total: aTraduire.length });
            }
            return ecrire('automatique', textes);
        },
        onSuccess: () => { notifySuccess(t('traduction.traduit')); },
        onError: (erreur) => {
            if (erreur instanceof SourceChangee) {
                notifyError(t('traduction.sourceChangee'));
                void queryClient.invalidateQueries({ queryKey: cleTraduction(nature, id) });
                return;
            }
            notifyError(messageForError(erreur));
        },
        onSettled: () => { setProgression(null); },
    });

    const occupe = relire.isPending || traduire.isPending;
    const modifie = (peutEcrire && isDirty && !relire.isPending) || traduire.isPending;
    useEffect(() => { onModification(modifie); }, [modifie, onModification]);
    // Le panneau démonté (autre fiche, autre version) ne retient plus la garde.
    useEffect(() => () => { onModification(false); }, [onModification]);

    const demanderTraduction = () => {
        if (traduction.version > 0) setConfirmation(true);
        else traduire.mutate();
    };

    if (aTraduire.length === 0) return <p className="text-sm text-muted-foreground">{t('traduction.rienATraduire')}</p>;

    return (
        <form
            noValidate
            onSubmit={(event) => { void handleSubmit((valeurs) => { relire.mutate(valeurs); })(event); }}
            className="flex flex-col gap-2.5"
        >
            {aTraduire.map(({ cle, libelle, source }) => (
                <div key={cle} className="grid gap-x-4 md:grid-cols-2">
                    <div className="mb-4 flex flex-col gap-1.5">
                        <span className="text-sm font-medium">{t('traduction.source', { champ: libelle })}</span>
                        <p lang="fr" className="grow rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground">{source}</p>
                    </div>
                    <div lang="en">
                        <ChampTexte name={cle} control={control} label={t(`traduction.champs.${cle}`)} disabled={!peutEcrire || occupe} multiline rows={5} />
                    </div>
                </div>
            ))}

            {peutEcrire && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-4">
                    {traduction.traduction_automatique && sourceModifiee && (
                        <p className="mr-auto text-sm text-muted-foreground">{t('traduction.traduireSourceModifiee')}</p>
                    )}
                    {traduction.traduction_automatique && (
                        <Button type="button" variant="outline" disabled={occupe || sourceModifiee} onClick={demanderTraduction}>
                            <Languages aria-hidden />
                            {progression === null ? t('traduction.traduire') : t('traduction.traduireEnCours', progression)}
                        </Button>
                    )}
                    <Button type="submit" disabled={occupe}>{t('traduction.marquerRelue')}</Button>
                </div>
            )}

            <ConfirmationRemplacement
                open={confirmation}
                relue={traduction.statut === 'relue'}
                onGarder={() => { setConfirmation(false); }}
                onRemplacer={() => { setConfirmation(false); traduire.mutate(); }}
            />
        </form>
    );
}

export function PanneauTraduction(props: Props) {
    const { nature, id } = props;
    const { t } = useTranslation('syllabus');

    const { data: traduction, isError } = useQuery({
        queryKey: cleTraduction(nature, id),
        queryFn: () => fetchTraduction(nature, id),
    });

    return (
        <section className="flex w-full max-w-[800px] flex-col gap-2.5" aria-labelledby={`traduction-${nature}-${id}`}>
            <h2 id={`traduction-${nature}-${id}`}>{t('traduction.titre')}</h2>
            <p className="text-sm text-muted-foreground">{t('traduction.intro')}</p>
            {isError && (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>{t('traduction.erreurChargement')}</AlertTitle>
                </Alert>
            )}
            {!isError && traduction === undefined && <Skeleton className="h-[200px] rounded-lg" />}
            {traduction !== undefined && (
                <>
                    <LigneStatut traduction={traduction} />
                    {/* La `key` remonte le formulaire sur chaque version écrite :
                        ses valeurs de référence sont celles du montage. */}
                    <FormulaireTraduction key={traduction.version} {...props} traduction={traduction} />
                </>
            )}
        </section>
    );
}
