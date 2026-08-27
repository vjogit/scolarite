import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FieldValues } from 'react-hook-form';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import type { DeleteImpact, DeleteImpactEntry, EntiteCrud } from './def';
import { messageForError } from '../errorMessages';
import { formatNombre } from '../format';

/** Au-delà de ce nombre de descendants, la saisie de confirmation est exigée. */
const SEUIL_CONFIRMATION = 100;

/** Nombre d'objets nommés avant le repli sur « et N autres ». */
const MAX_NOMS_AFFICHES = 5;

/** « 3 promotions », « 1 847 notes ». */
function formatEntry(entry: DeleteImpactEntry): string {
    return `${formatNombre.format(entry.count)} ${entry.label}`;
}

/** Énumération : « a, b et c » (le séparateur final vient du namespace `crud`). */
function joinEnumeration(parts: string[], t: TFunction<'crud'>): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} ${t('deleteDialog.et', { ns: 'crud' })} ${parts.at(-1) ?? ''}`;
}

interface Props<D extends FieldValues> {
    open: boolean;
    /**
     * L'entité visée, réduite à ce que la modale lit vraiment : identifiant,
     * nom, libellés, impact. Un `Datasource` en est un — la liste passe le
     * sien —, mais l'arbre de la structure, qui supprime sans table, n'a pas de
     * colonnes à fournir.
     */
    entite: EntiteCrud<D>;
    /** Les objets visés eux-mêmes, et non les lignes d'une table. */
    objets: readonly D[];
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Modale de confirmation de suppression : nomme les objets visés et affiche
 * l'impact réel de la cascade, calculé par le serveur.
 */
export function DeleteConfirmDialog<D extends FieldValues>({
    open,
    entite,
    objets,
    onClose,
    onConfirm,
}: Props<D>) {
    const { t } = useTranslation('crud');
    const [saisie, setSaisie] = useState('');
    const saisieRef = useRef<HTMLInputElement>(null);
    // Cible du focus d'ouverture quand aucune saisie n'est exigée — la parité
    // avec l'`autoFocus` que portait le bouton « Annuler » MUI.
    const annulerRef = useRef<HTMLButtonElement>(null);
    const idSaisie = useId();

    const ids = useMemo(
        () => objets.map((objet) => entite.getId(objet)),
        [objets, entite],
    );
    const noms = useMemo(
        () => objets.map((objet) => entite.getName(objet)),
        [objets, entite],
    );

    const fetchImpact = entite.deleteImpact;
    const supporteImpact = Boolean(fetchImpact);

    const impactQuery = useQuery<DeleteImpact>({
        queryKey: [...entite.queryKey, 'delete-impact', ids],
        queryFn: fetchImpact && open && ids.length > 0
            ? () => fetchImpact(ids)
            : skipToken,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });

    const impact = impactQuery.data;
    const impactEnCours = supporteImpact && impactQuery.isPending;
    const impactEnEchec = supporteImpact && impactQuery.isError;

    const totalCascade = useMemo(
        () => (impact?.cascade ?? []).reduce((total, entry) => total + entry.count, 0),
        [impact],
    );

    const blocages = impact?.blocking ?? [];
    const estBloque = blocages.length > 0;

    // Confirmation renforcée : entité de haut niveau, cascade massive, ou
    // impact inconnu — dans ce dernier cas on ne prétend surtout pas qu'il est nul.
    const confirmationRequise =
        supporteImpact &&
        (entite.deleteRequiresNameConfirmation === true ||
            totalCascade > SEUIL_CONFIRMATION ||
            impactEnEchec);

    // La saisie exigée peut naître plus tard que la modale : c'est le cas
    // quand c'est l'ampleur de la cascade, ou l'échec de son analyse, qui la
    // déclenche. Le piège à focus de la modale a alors rendu la main depuis
    // longtemps, un `focus()` direct suffit. Le cas symétrique — saisie
    // présente dès l'ouverture — est traité par `initialFocus` sur la modale.
    useEffect(() => {
        if (open && confirmationRequise) saisieRef.current?.focus();
    }, [open, confirmationRequise]);

    // Sur sélection multiple, recopier cinq noms n'aurait aucun sens.
    const motConfirmation = t('deleteDialog.motConfirmation');
    const phraseAttendue = objets.length === 1 ? (noms[0] ?? motConfirmation) : motConfirmation;
    const confirmationOk = !confirmationRequise || saisie.trim() === phraseAttendue;

    const suppressionPossible = !estBloque && !impactEnCours && confirmationOk;

    const titre = (() => {
        if (objets.length === 1) {
            const libelle = entite.entityLabelAvecArticle ? `${entite.entityLabelAvecArticle} ` : '';
            return t('deleteDialog.titreUn', { libelle, nom: noms[0] ?? '' });
        }
        // Sans libellé explicite, on conserve le mot neutre déjà utilisé par la
        // modale d'origine : certains titres de liste ne sont pas des pluriels.
        const pluriel = entite.entityLabelPlural ?? t('deleteDialog.pluralielGenerique');
        return t('deleteDialog.titrePluriel', { nombre: formatNombre.format(objets.length), pluriel });
    })();

    // Chaque nom voyage avec l'identifiant de son objet : c'est lui la clé de
    // liste, et le réindexer au rendu obligeait à retomber sur la position.
    const objetsAffiches = objets.slice(0, MAX_NOMS_AFFICHES)
        .map((objet, rang) => ({ id: entite.getId(objet), nom: noms[rang] ?? '' }));
    const nomsRestants = noms.length - objetsAffiches.length;

    return (
        <Dialog
            open={open}
            onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}
            // La saisie ne doit jamais survivre à la fermeture. La vider à la
            // fin de la transition plutôt qu'à la fermeture évite que le champ
            // se vide sous les yeux de l'utilisateur pendant que la modale
            // s'efface — l'équivalent de l'`onExited` MUI.
            onOpenChangeComplete={(ouvert) => { if (!ouvert) setSaisie(''); }}
        >
            {/* Pas de croix de fermeture : la modale MUI n'en avait pas, les
                deux issues restent « Annuler » et « Supprimer ».
                `initialFocus` : la saisie quand elle est exigée dès l'ouverture
                (entité de haut niveau, marqueur connu avant toute réponse
                serveur), sinon « Annuler » — la parité avec l'`autoFocus` MUI,
                sans le contournement du piège à focus devenu inutile. */}
            <DialogContent
                className="sm:max-w-xl"
                showCloseButton={false}
                initialFocus={confirmationRequise ? saisieRef : annulerRef}
            >
                <DialogHeader>
                    <DialogTitle>{titre}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {objets.length > 1 && (
                        <div>
                            <p className="text-sm text-muted-foreground">{t('deleteDialog.objetsSelectionnes')}</p>
                            <ul className="pl-2">
                                {objetsAffiches.map(({ id, nom }) => (
                                    <li key={id} className="text-sm">{`• ${nom}`}</li>
                                ))}
                            </ul>
                            {nomsRestants > 0 && (
                                <p className="pl-2 text-sm text-muted-foreground">
                                    {t('deleteDialog.etAutres', { count: nomsRestants, nombre: formatNombre.format(nomsRestants) })}
                                </p>
                            )}
                        </div>
                    )}

                    {impactEnCours && (
                        <div className="flex items-center gap-2">
                            {/* Le texte voisin porte l'information : le spinner
                                n'a rien à annoncer de plus au lecteur d'écran. */}
                            <Spinner aria-hidden />
                            <span className="text-sm">{t('deleteDialog.analyseEnCours')}</span>
                        </div>
                    )}

                    {impactEnEchec && (
                        <Alert variant="warning">
                            <WarningAmberIcon />
                            <AlertDescription>
                                {t('deleteDialog.impactEchec', { erreur: messageForError(impactQuery.error) })}
                            </AlertDescription>
                        </Alert>
                    )}

                    {impact && !estBloque && (
                        <>
                            {impact.cascade.length === 0 ? (
                                <Alert variant="info">
                                    <InfoOutlinedIcon />
                                    <AlertDescription>{t('deleteDialog.aucuneDonneeLiee')}</AlertDescription>
                                </Alert>
                            ) : (
                                <Alert variant="warning">
                                    <WarningAmberIcon />
                                    <AlertDescription>
                                        {objets.length === 1
                                            ? t('deleteDialog.cascadeUnContient', { nom: noms[0] ?? '' })
                                            : t('deleteDialog.cascadeSelectionContient')}
                                        <strong>{joinEnumeration(impact.cascade.map(formatEntry), t)}</strong>.{' '}
                                        {entite.suppressionEnCorbeille
                                            ? t('deleteDialog.cascadeCorbeille')
                                            : t('deleteDialog.cascadeDefinitive')}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {entite.suppressionEnCorbeille && (
                                <Alert variant="info">
                                    <InfoOutlinedIcon />
                                    <AlertDescription>{t('deleteDialog.restaurable')}</AlertDescription>
                                </Alert>
                            )}

                            {impact.detached.length > 0 && (
                                <Alert variant="info">
                                    <InfoOutlinedIcon />
                                    <AlertDescription>
                                        {t('deleteDialog.detache', { liste: joinEnumeration(impact.detached.map(formatEntry), t) })}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </>
                    )}

                    {estBloque && (
                        <Alert variant="destructive">
                            <ErrorOutlineIcon />
                            <AlertDescription className="flex flex-col gap-1">
                                {blocages.map((blocage) => (
                                    <span key={blocage.reason}>{blocage.message}</span>
                                ))}
                            </AlertDescription>
                        </Alert>
                    )}

                    {!supporteImpact && (
                        <p className="text-sm text-muted-foreground">
                            {t('deleteDialog.irreversible')}
                        </p>
                    )}

                    {!estBloque && confirmationRequise && (
                        <div>
                            <p className="mb-2 text-sm">
                                {t('deleteDialog.confirmerSaisiePrefixe')} <strong>{phraseAttendue}</strong> :
                            </p>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={idSaisie}>{t('deleteDialog.confirmationLabel')}</Label>
                                <Input
                                    id={idSaisie}
                                    ref={saisieRef}
                                    value={saisie}
                                    onChange={(event) => { setSaisie(event.target.value); }}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" ref={annulerRef} onClick={onClose}>
                        {t('deleteDialog.annuler')}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onConfirm} disabled={!suppressionPossible}>
                        {t('deleteDialog.supprimer')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
