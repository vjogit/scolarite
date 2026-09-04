import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Anchor, CircleAlert, CircleCheck, FileUp, Info, RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { ChampTexte } from '../../services/ChampTexte';
import {
    ancrerMaintenant,
    fetchAncres,
    fetchVerification,
    verifierTemoin,
    type Ancre,
    type ResultatAncrage,
    type VerdictTemoin,
} from './service';
import { REGISTRE } from './def';
import { messageForError } from '../../services/errorMessages';
import { notifyError, notifySuccess } from '../../services/notify';

/**
 * Écran d'administration du registre chaîné : intégrité de la chaîne, état de
 * l'ancrage RFC 3161 (dernière ancre réussie), et vérification d'un témoin
 * reçu depuis la boîte externe.
 *
 * Les dates des ancres viennent de la base : ce sont des repères, pas une
 * preuve — la preuve reste les témoins détenus par le tiers.
 */

type Severite = 'success' | 'destructive' | 'warning';

/** Sévérité d'affichage par verdict — le verdict est le contrat serveur. */
const SEVERITE_VERDICT: Record<VerdictTemoin['verdict'], Severite> = {
    CONFORME: 'success',
    REECRITURE_DETECTEE: 'destructive',
    CHAINE_CORROMPUE: 'destructive',
    TOKEN_INVALIDE: 'warning',
    SIGNATURE_INVALIDE: 'warning',
};

/** L'icône d'une alerte, par sévérité — celles de `DeleteConfirmDialog`. */
function IconeSeverite({ severite }: { severite: Severite | 'info' }) {
    switch (severite) {
        case 'success': return <CircleCheck />;
        case 'destructive': return <CircleAlert />;
        case 'warning': return <TriangleAlert />;
        case 'info': return <Info />;
    }
}

function libelleVerdict(verdict: VerdictTemoin['verdict'], t: TFunction<'registre'>): string {
    switch (verdict) {
        case 'CONFORME': return t('temoin.verdicts.CONFORME');
        case 'REECRITURE_DETECTEE': return t('temoin.verdicts.REECRITURE_DETECTEE');
        case 'CHAINE_CORROMPUE': return t('temoin.verdicts.CHAINE_CORROMPUE');
        case 'TOKEN_INVALIDE': return t('temoin.verdicts.TOKEN_INVALIDE');
        case 'SIGNATURE_INVALIDE': return t('temoin.verdicts.SIGNATURE_INVALIDE');
    }
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
}

/** Le titre d'une carte — `h6`, le rang que MUI rendait, ciblé en `heading` par la fumée e2e. */
function TitreCarte({ children }: { children: string }) {
    return <h6 className="m-0 text-base font-medium">{children}</h6>;
}

/** La ligne d'attente d'une carte : le texte porte l'information, le spinner n'annonce rien de plus. */
function LigneAttente({ texte }: { texte: string }) {
    return (
        <div className="flex items-center gap-2">
            <Spinner aria-hidden />
            <span className="text-sm">{texte}</span>
        </div>
    );
}

/** Intégrité interne : recalcul de toute la chaîne, verdict affiché tel quel. */
function CarteIntegrite() {
    const { t } = useTranslation('registre');
    const query = useQuery({
        queryKey: [REGISTRE, 'verification'],
        queryFn: fetchVerification,
    });

    return (
        <Card>
            <CardHeader>
                <TitreCarte>{t('integrite.titre')}</TitreCarte>
            </CardHeader>
            <CardContent>
                {query.isPending && <LigneAttente texte={t('integrite.recalcul')} />}
                {query.isError && (
                    <Alert variant="destructive">
                        <CircleAlert />
                        <AlertDescription>
                            {t('integrite.erreurVerification', { erreur: messageForError(query.error) })}
                        </AlertDescription>
                    </Alert>
                )}
                {query.data && (query.data.ok ? (
                    <Alert variant="success">
                        <CircleCheck />
                        <AlertDescription>{t('integrite.valide', { count: query.data.maillons })}</AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="destructive">
                        <CircleAlert />
                        <AlertDescription>
                            {t('integrite.rompue', { maillon: query.data.broken_at ?? '?', erreur: query.data.error })}
                        </AlertDescription>
                    </Alert>
                ))}
            </CardContent>
            <CardFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => { void query.refetch(); }}
                    disabled={query.isFetching}
                >
                    <RefreshCw />
                    {t('integrite.reverifier')}
                </Button>
            </CardFooter>
        </Card>
    );
}

/**
 * Ancrage RFC 3161 : la dernière ancre réussie, et le déclenchement manuel.
 * Un échec d'ancrage s'affiche ici sans bloquer quoi que ce soit d'autre :
 * l'ancrage observe la chaîne, il ne la gouverne pas.
 */
function CarteAncrage() {
    const { t } = useTranslation('registre');
    const queryClient = useQueryClient();
    const [resultats, setResultats] = useState<ResultatAncrage[] | null>(null);

    const query = useQuery({
        queryKey: [REGISTRE, 'ancres'],
        queryFn: fetchAncres,
    });

    const ancrage = useMutation({
        mutationFn: ancrerMaintenant,
        onSuccess: (results) => {
            setResultats(results);
            void queryClient.invalidateQueries({ queryKey: [REGISTRE, 'ancres'] });
            const creees = results.filter((r) => r.created).length;
            const echecs = results.filter((r) => r.error).length;
            if (echecs > 0) {
                notifyError(t('ancrage.echecNotif'));
            } else if (creees > 0) {
                notifySuccess(t('ancrage.succesNotif'));
            } else {
                notifySuccess(t('ancrage.dejaAncreNotif'));
            }
        },
        onError: (error) => {
            notifyError(messageForError(error));
        },
    });

    const ancres = query.data ?? [];
    const derniere: Ancre | undefined = ancres.at(-1);

    return (
        <Card>
            <CardHeader>
                <TitreCarte>{t('ancrage.titre')}</TitreCarte>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                {query.isPending && <LigneAttente texte={t('ancrage.lecture')} />}
                {query.isError && (
                    <Alert variant="destructive">
                        <CircleAlert />
                        <AlertDescription>
                            {t('ancrage.erreurLecture', { erreur: messageForError(query.error) })}
                        </AlertDescription>
                    </Alert>
                )}
                {query.data && (derniere ? (
                    <Alert variant="info">
                        <Info />
                        <AlertDescription>
                            {t('ancrage.derniereAncrePrefixe')}<strong>{formatDate(derniere.created_at)}</strong>
                            {t('ancrage.derniereAncreSuffixe', { maillon: derniere.registre_seq, tsa: derniere.tsa_url, count: ancres.length })}
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="warning">
                        <TriangleAlert />
                        <AlertDescription>{t('ancrage.aucuneAncre')}</AlertDescription>
                    </Alert>
                ))}
                {resultats?.map((r) => (
                    <Alert key={r.tsa_url} variant={r.error ? 'destructive' : 'success'}>
                        {r.error ? <CircleAlert /> : <CircleCheck />}
                        <AlertDescription>
                            {r.error
                                ? t('ancrage.resultatEchec', { tsa: r.tsa_url, erreur: r.error })
                                : r.created
                                    ? t('ancrage.resultatCree', { tsa: r.tsa_url })
                                    : t('ancrage.resultatDejaAncre', { tsa: r.tsa_url })}
                        </AlertDescription>
                    </Alert>
                ))}
            </CardContent>
            <CardFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => { ancrage.mutate(); }}
                    disabled={ancrage.isPending}
                >
                    <Anchor />
                    {t('ancrage.ancrerMaintenant')}
                </Button>
            </CardFooter>
        </Card>
    );
}

/** Ce que la carte du témoin fait saisir. */
interface ValeursTemoin {
    token: string;
    cert: string;
}

/**
 * Dépôt d'un témoin : le fichier .tsr reçu en pièce jointe (ou son contenu
 * collé), plus le certificat TSA optionnel. La vérification est en lecture
 * seule côté serveur ; le verdict s'affiche tel que le serveur le rend.
 *
 * Sur react-hook-form depuis le lot 15 (les champs partagés le supposent).
 * Ce que l'écran affichait sous condition d'une saisie inchangée — le nom du
 * fichier chargé, le verdict obtenu — se DÉRIVE des valeurs observées plutôt
 * que d'être effacé par des effets : le nom reste tant que le jeton est
 * celui du fichier, le verdict tant que jeton et certificat sont ceux
 * qui ont été vérifiés.
 */
function CarteTemoin() {
    const { t } = useTranslation('registre');
    const { control, handleSubmit, setValue } = useForm<ValeursTemoin>({ defaultValues: { token: '', cert: '' } });
    const token = useWatch({ control, name: 'token' });
    const cert = useWatch({ control, name: 'cert' });
    const [fichier, setFichier] = useState<{ nom: string; token: string } | null>(null);
    const [verdict, setVerdict] = useState<{ valeurs: ValeursTemoin; resultat: VerdictTemoin } | null>(null);
    const fichierRef = useRef<HTMLInputElement>(null);

    const verification = useMutation({
        mutationFn: (valeurs: ValeursTemoin) => verifierTemoin(valeurs.token, valeurs.cert),
        onSuccess: (resultat, valeurs) => { setVerdict({ valeurs, resultat }); },
        onError: (error) => {
            setVerdict(null);
            notifyError(messageForError(error));
        },
    });

    // Le .tsr est du DER binaire : lu en base64, que le serveur décode avec
    // tolérance (c'est aussi la forme qu'un courriel donne au jeton).
    const chargerFichier = (f: File) => {
        const lecteur = new FileReader();
        lecteur.onload = () => {
            const dataURL = lecteur.result as string;
            const contenu = dataURL.slice(dataURL.indexOf(',') + 1);
            setValue('token', contenu);
            setFichier({ nom: f.name, token: contenu });
        };
        lecteur.readAsDataURL(f);
    };

    const nomFichier = fichier !== null && fichier.token === token ? fichier.nom : null;
    const verdictAffiche = verdict !== null && verdict.valeurs.token === token && verdict.valeurs.cert === cert
        ? verdict.resultat
        : null;

    return (
        <Card>
            <CardHeader>
                <TitreCarte>{t('temoin.titre')}</TitreCarte>
                <CardDescription>{t('temoin.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => { fichierRef.current?.click(); }}>
                        <FileUp />
                        {t('temoin.fichierBouton')}
                    </Button>
                    <input
                        ref={fichierRef}
                        type="file"
                        hidden
                        accept=".tsr,.der,.pem,.txt"
                        onChange={(event) => {
                            const choisi = event.target.files?.[0];
                            if (choisi) chargerFichier(choisi);
                            event.target.value = '';
                        }}
                    />
                    {nomFichier && (
                        <span className="text-sm text-muted-foreground">{nomFichier}</span>
                    )}
                </div>
                {/* Jeton et certificat se lisent en chasse fixe, comme avant. */}
                <ChampTexte
                    name="token"
                    control={control}
                    label={t('temoin.jetonLabel')}
                    multiline
                    rows={3}
                    className="mb-0 [&_textarea]:font-mono [&_textarea]:text-[13px]"
                />
                <ChampTexte
                    name="cert"
                    control={control}
                    label={t('temoin.certLabel')}
                    multiline
                    rows={2}
                    className="mb-0 [&_textarea]:font-mono [&_textarea]:text-[13px]"
                />
                {verdictAffiche && (
                    <Alert variant={SEVERITE_VERDICT[verdictAffiche.verdict]}>
                        <IconeSeverite severite={SEVERITE_VERDICT[verdictAffiche.verdict]} />
                        <AlertDescription>
                            <div>
                                <strong>{libelleVerdict(verdictAffiche.verdict, t)}</strong> — {verdictAffiche.message}
                            </div>
                            {verdictAffiche.sealedAt && (
                                <div className="mt-1">
                                    {t('temoin.scelleLePrefixe')}{formatDate(verdictAffiche.sealedAt)}
                                    {verdictAffiche.tsaName ? t('temoin.parTsa', { tsa: verdictAffiche.tsaName }) : ''}
                                    {verdictAffiche.coverageSeq ? t('temoin.rattacheMaillon', { maillon: verdictAffiche.coverageSeq }) : ''}.
                                </div>
                            )}
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
            <CardFooter>
                <Button
                    type="button"
                    disabled={token.trim() === '' || verification.isPending}
                    onClick={() => { void handleSubmit((valeurs) => { verification.mutate(valeurs); })(); }}
                >
                    {t('temoin.verifier')}
                </Button>
            </CardFooter>
        </Card>
    );
}

export function RegistrePage() {
    const { t } = useTranslation('registre');
    return (
        <div className="max-w-[900px] p-4">
            {/* `h5` : le rang que MUI donnait à `variant="h5"`, affirmé par la fumée e2e. */}
            <h5 className="m-0 mb-1 text-2xl font-normal">{t('titre')}</h5>
            <p className="m-0 mb-4 text-sm text-muted-foreground">{t('sousTitre')}</p>
            <div className="flex flex-col gap-4">
                <CarteIntegrite />
                <CarteAncrage />
                <CarteTemoin />
            </div>
        </div>
    );
}
