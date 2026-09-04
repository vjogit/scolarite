import { useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArchiveRestore, CircleAlert, Info, Trash, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '../../components/ui/card';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { fetchCorbeille, purgerOperation, restaurerOperation, type OperationCorbeille } from './service';
import { CORBEILLE } from './def';
import type { DeleteImpactEntry } from '../../services/crud/def';
import { blockingMessageFor, messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';
import { formatNombre } from '../../services/format';

/** « 3 promotions », « 1 847 notes » — même règle que la modale de suppression. */
function formatEntry(entry: DeleteImpactEntry): string {
    return `${formatNombre.format(entry.count)} ${entry.label}`;
}

/** Énumération : « a, b et c » (le séparateur final vient du namespace `corbeille`). */
function joinEnumeration(parts: string[], t: TFunction<'corbeille'>): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} ${t('et')} ${parts.at(-1) ?? ''}`;
}

/** Le type de racine (`formation`, `promotion`, `option`, `periode`) traduit. */
function libelleRacine(racineType: string, pluriel: boolean, t: TFunction<'corbeille'>): string {
    switch (racineType) {
        case 'formation': return pluriel ? t('racinesPluriel.formation') : t('racines.formation');
        case 'promotion': return pluriel ? t('racinesPluriel.promotion') : t('racines.promotion');
        case 'option': return pluriel ? t('racinesPluriel.option') : t('racines.option');
        case 'periode': return pluriel ? t('racinesPluriel.periode') : t('racines.periode');
        default: return racineType;
    }
}

function titreOperation(op: OperationCorbeille, t: TFunction<'corbeille'>): string {
    const noms = op.items.map((item) => `« ${item.name} »`);
    if (noms.length === 1) return `${libelleRacine(op.racineType, false, t)} ${noms[0] ?? ''}`;
    return `${formatNombre.format(noms.length)} ${libelleRacine(op.racineType, true, t)} : ${joinEnumeration(noms, t)}`;
}

function sousTitreOperation(op: OperationCorbeille, t: TFunction<'corbeille'>): string {
    const date = new Date(op.deletedAt).toLocaleString();
    const auteur = op.deletedByNom ?? op.deletedBy;
    return t('supprimeLe', { date, auteur });
}

/**
 * Purge : friction maximale, comme la modale de suppression d'origine —
 * impact chiffré sous les yeux, saisie du nom (ou de CONFIRMER en cas de
 * racines multiples) avant que le bouton ne s'arme. La purge est le seul
 * geste réellement irréversible de la corbeille.
 */
function PurgeDialog({
    operation,
    onClose,
    onConfirm,
    enCours,
}: {
    operation: OperationCorbeille | null;
    onClose: () => void;
    onConfirm: (op: OperationCorbeille) => void;
    enCours: boolean;
}) {
    const { t } = useTranslation('corbeille');
    const [saisie, setSaisie] = useState('');
    const saisieRef = useRef<HTMLInputElement>(null);
    const idSaisie = useId();

    const [seulElement] = operation?.items ?? [];
    const phraseAttendue =
        operation?.items.length === 1 && seulElement ? seulElement.name : t('motConfirmation');
    const confirmationOk = operation !== null && saisie.trim() === phraseAttendue;

    return (
        <Dialog
            open={operation !== null}
            onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}
            // La saisie ne survit pas à la fermeture ; vidée à la fin de la
            // transition, pas sous les yeux de l'utilisateur (même règle que
            // `DeleteConfirmDialog`).
            onOpenChangeComplete={(ouvert) => { if (!ouvert) setSaisie(''); }}
        >
            {/* Pas de croix (parité MUI). `initialFocus` sur la saisie, le
                geste attendu — l'ancien contournement du piège à focus MUI
                (`onEntered`) devient inutile. */}
            <DialogContent className="sm:max-w-xl" showCloseButton={false} initialFocus={saisieRef}>
                <DialogHeader>
                    <DialogTitle>
                        {operation ? t('purgerTitre', { titre: titreOperation(operation, t) }) : ''}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    {operation && operation.cascade.length > 0 && (
                        <Alert variant="warning">
                            <TriangleAlert />
                            <AlertDescription>
                                {t('contientPrefixe')}<strong>{joinEnumeration(operation.cascade.map(formatEntry), t)}</strong>.
                            </AlertDescription>
                        </Alert>
                    )}
                    <p className="m-0 text-sm text-muted-foreground">
                        {t('purgeIrreversible')}
                    </p>
                    <div>
                        <p className="mb-2 text-sm">
                            {t('confirmerSaisiePrefixe')} <strong>{phraseAttendue}</strong> :
                        </p>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor={idSaisie}>{t('confirmationLabel')}</Label>
                            <Input
                                id={idSaisie}
                                ref={saisieRef}
                                value={saisie}
                                onChange={(event) => { setSaisie(event.target.value); }}
                                autoComplete="off"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('annuler')}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={!confirmationOk || enCours}
                        onClick={() => { if (operation) onConfirm(operation); }}
                    >
                        {t('purgerDefinitivement')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Restauration : un simple accord suffit — le geste est réversible (re-suppression). */
function RestoreDialog({
    operation,
    onClose,
    onConfirm,
    enCours,
}: {
    operation: OperationCorbeille | null;
    onClose: () => void;
    onConfirm: (op: OperationCorbeille) => void;
    enCours: boolean;
}) {
    const { t } = useTranslation('corbeille');
    // Parité avec l'`autoFocus` que portait « Annuler » : l'action par défaut
    // est celle qui ne fait rien.
    const annulerRef = useRef<HTMLButtonElement>(null);
    return (
        <Dialog open={operation !== null} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            <DialogContent className="sm:max-w-xl" showCloseButton={false} initialFocus={annulerRef}>
                <DialogHeader>
                    <DialogTitle>
                        {operation ? t('restaurerTitre', { titre: titreOperation(operation, t) }) : ''}
                    </DialogTitle>
                    <DialogDescription>
                        {t('restaurationTout')}
                        {operation && operation.cascade.length > 0
                            ? t('restaurationToutSuffixe', { liste: joinEnumeration(operation.cascade.map(formatEntry), t) })
                            : '.'}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" ref={annulerRef} onClick={onClose}>
                        {t('annuler')}
                    </Button>
                    <Button
                        type="button"
                        disabled={enCours}
                        onClick={() => { if (operation) onConfirm(operation); }}
                    >
                        {t('restaurer')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CorbeillePage() {
    const queryClient = useQueryClient();
    const { t } = useTranslation('corbeille');

    const [aRestaurer, setARestaurer] = useState<OperationCorbeille | null>(null);
    const [aPurger, setAPurger] = useState<OperationCorbeille | null>(null);

    const query = useQuery({
        queryKey: [CORBEILLE],
        queryFn: fetchCorbeille,
    });

    // Restaurer ou purger invalide toutes les lectures : les objets restaurés
    // doivent réapparaître partout (listes, sélecteurs, fil d'Ariane) sans
    // qu'on ait à connaître leurs clés de cache une à une.
    const invalidateTout = () => queryClient.invalidateQueries();

    const restauration = useMutation({
        mutationFn: (op: OperationCorbeille) => restaurerOperation(op.id),
        onSuccess: (_data, op) => {
            setARestaurer(null);
            void invalidateTout();
            notifySuccess(t('restaurationSucces', { titre: titreOperation(op, t) }));
        },
        onError: (error) => {
            setARestaurer(null);
            notifyError(blockingMessageFor(error) ?? messageForError(error));
        },
    });

    const purge = useMutation({
        mutationFn: (op: OperationCorbeille) => purgerOperation(op.id),
        onSuccess: (_data, op) => {
            setAPurger(null);
            void invalidateTout();
            notifySuccess(t('purgeSucces', { titre: titreOperation(op, t) }));
        },
        onError: (error) => {
            setAPurger(null);
            notifyError(blockingMessageFor(error) ?? messageForError(error));
        },
    });

    const operations = useMemo(() => query.data ?? [], [query.data]);

    if (query.isPending) {
        return (
            <div className="flex items-center gap-2 p-4">
                {/* Le texte voisin porte l'information : le spinner n'a rien à
                    annoncer de plus au lecteur d'écran. */}
                <Spinner aria-hidden />
                <span className="text-sm">{t('chargement')}</span>
            </div>
        );
    }

    if (query.isError) {
        return (
            <Alert variant="destructive" className="m-4 w-auto">
                <CircleAlert />
                <AlertDescription>{t('erreurLecture', { erreur: messageForError(query.error) })}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="p-4">
            {/* `h5` : le rang que MUI donnait à `variant="h5"`. */}
            <h5 className="m-0 mb-1 text-2xl font-normal">{t('titre')}</h5>
            <p className="m-0 mb-4 text-sm text-muted-foreground">{t('sousTitre')}</p>

            {/* Rien à créer dans une corbeille : le message se suffit, et dit
                d'où viendra ce qui s'y trouvera. */}
            {operations.length === 0 && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>{t('vide')}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4">
                {operations.map((op) => (
                    <Card key={op.id}>
                        <CardHeader>
                            {/* `h6` : le titre de carte que MUI rendait, ciblé en
                                `heading` par la suite e2e. */}
                            <h6 className="m-0 text-base font-medium">{titreOperation(op, t)}</h6>
                            <CardDescription>{sousTitreOperation(op, t)}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            {op.cascade.length > 0 ? (
                                <p className="m-0 text-sm">
                                    {t('contientPrefixe')}{joinEnumeration(op.cascade.map(formatEntry), t)}.
                                </p>
                            ) : (
                                <p className="m-0 text-sm">{t('aucuneDonneeLiee')}</p>
                            )}
                            {op.blocking.length > 0 && (
                                <Alert variant="destructive">
                                    <CircleAlert />
                                    <AlertDescription className="flex flex-col gap-1">
                                        {op.blocking.map((blocage) => (
                                            <span key={blocage.reason}>{blocage.message}</span>
                                        ))}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                        <CardFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setARestaurer(op); }}
                                disabled={restauration.isPending || purge.isPending}
                            >
                                <ArchiveRestore />
                                {t('restaurer')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { setAPurger(op); }}
                                disabled={op.blocking.length > 0 || restauration.isPending || purge.isPending}
                            >
                                <Trash />
                                {t('purger')}
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <RestoreDialog
                operation={aRestaurer}
                onClose={() => { setARestaurer(null); }}
                onConfirm={(op) => { restauration.mutate(op); }}
                enCours={restauration.isPending}
            />
            <PurgeDialog
                operation={aPurger}
                onClose={() => { setAPurger(null); }}
                onConfirm={(op) => { purge.mutate(op); }}
                enCours={purge.isPending}
            />
        </div>
    );
}
