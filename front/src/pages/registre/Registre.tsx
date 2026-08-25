import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CircularProgress,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import AnchorIcon from '@mui/icons-material/Anchor';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';

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

/** Sévérité d'affichage par verdict — le verdict est le contrat serveur. */
const SEVERITE_VERDICT: Record<VerdictTemoin['verdict'], 'success' | 'error' | 'warning'> = {
    CONFORME: 'success',
    REECRITURE_DETECTEE: 'error',
    CHAINE_CORROMPUE: 'error',
    TOKEN_INVALIDE: 'warning',
    SIGNATURE_INVALIDE: 'warning',
};

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

/** Intégrité interne : recalcul de toute la chaîne, verdict affiché tel quel. */
function CarteIntegrite() {
    const { t } = useTranslation('registre');
    const query = useQuery({
        queryKey: [REGISTRE, 'verification'],
        queryFn: fetchVerification,
    });

    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>{t('integrite.titre')}</Typography>
                {query.isPending && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">{t('integrite.recalcul')}</Typography>
                    </Box>
                )}
                {query.isError && (
                    <Alert severity="error">
                        {t('integrite.erreurVerification', { erreur: messageForError(query.error) })}
                    </Alert>
                )}
                {query.data && (query.data.ok ? (
                    <Alert severity="success">
                        {t('integrite.valide', { count: query.data.maillons })}
                    </Alert>
                ) : (
                    <Alert severity="error">
                        {t('integrite.rompue', { maillon: query.data.broken_at ?? '?', erreur: query.data.error })}
                    </Alert>
                ))}
            </CardContent>
            <CardActions>
                <Button
                    startIcon={<RefreshIcon />}
                    onClick={() => { void query.refetch(); }}
                    disabled={query.isFetching}
                >
                    {t('integrite.reverifier')}
                </Button>
            </CardActions>
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
    const notifications = useNotifications();
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
                notifyError(notifications, t('ancrage.echecNotif'));
            } else if (creees > 0) {
                notifySuccess(notifications, t('ancrage.succesNotif'));
            } else {
                notifySuccess(notifications, t('ancrage.dejaAncreNotif'));
            }
        },
        onError: (error) => {
            notifyError(notifications, messageForError(error));
        },
    });

    const ancres = query.data ?? [];
    const derniere: Ancre | undefined = ancres.at(-1);

    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>{t('ancrage.titre')}</Typography>
                {query.isPending && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">{t('ancrage.lecture')}</Typography>
                    </Box>
                )}
                {query.isError && (
                    <Alert severity="error">
                        {t('ancrage.erreurLecture', { erreur: messageForError(query.error) })}
                    </Alert>
                )}
                {query.data && (derniere ? (
                    <Alert severity="info">
                        {t('ancrage.derniereAncrePrefixe')}<strong>{formatDate(derniere.created_at)}</strong>
                        {t('ancrage.derniereAncreSuffixe', { maillon: derniere.registre_seq, tsa: derniere.tsa_url, count: ancres.length })}
                    </Alert>
                ) : (
                    <Alert severity="warning">
                        {t('ancrage.aucuneAncre')}
                    </Alert>
                ))}
                {resultats?.map((r) => (
                    <Alert
                        key={r.tsa_url}
                        severity={r.error ? 'error' : 'success'}
                        sx={{ mt: 1 }}
                    >
                        {r.error
                            ? t('ancrage.resultatEchec', { tsa: r.tsa_url, erreur: r.error })
                            : r.created
                                ? t('ancrage.resultatCree', { tsa: r.tsa_url })
                                : t('ancrage.resultatDejaAncre', { tsa: r.tsa_url })}
                    </Alert>
                ))}
            </CardContent>
            <CardActions>
                <Button
                    startIcon={<AnchorIcon />}
                    onClick={() => { ancrage.mutate(); }}
                    disabled={ancrage.isPending}
                >
                    {t('ancrage.ancrerMaintenant')}
                </Button>
            </CardActions>
        </Card>
    );
}

/**
 * Dépôt d'un témoin : le fichier .tsr reçu en pièce jointe (ou son contenu
 * collé), plus le certificat TSA optionnel. La vérification est en lecture
 * seule côté serveur ; le verdict s'affiche tel que le serveur le rend.
 */
function CarteTemoin() {
    const { t } = useTranslation('registre');
    const notifications = useNotifications();
    const [token, setToken] = useState('');
    const [cert, setCert] = useState('');
    const [nomFichier, setNomFichier] = useState<string | null>(null);
    const [verdict, setVerdict] = useState<VerdictTemoin | null>(null);
    const fichierRef = useRef<HTMLInputElement>(null);

    const verification = useMutation({
        mutationFn: () => verifierTemoin(token, cert),
        onSuccess: setVerdict,
        onError: (error) => {
            setVerdict(null);
            notifyError(notifications, messageForError(error));
        },
    });

    // Le .tsr est du DER binaire : lu en base64, que le serveur décode avec
    // tolérance (c'est aussi la forme qu'un courriel donne au jeton).
    const chargerFichier = (fichier: File) => {
        const lecteur = new FileReader();
        lecteur.onload = () => {
            const dataURL = lecteur.result as string;
            setToken(dataURL.slice(dataURL.indexOf(',') + 1));
            setNomFichier(fichier.name);
            setVerdict(null);
        };
        lecteur.readAsDataURL(fichier);
    };

    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>{t('temoin.titre')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('temoin.description')}
                </Typography>
                <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                            startIcon={<UploadFileIcon />}
                            variant="outlined"
                            onClick={() => { fichierRef.current?.click(); }}
                        >
                            {t('temoin.fichierBouton')}
                        </Button>
                        <input
                            ref={fichierRef}
                            type="file"
                            hidden
                            accept=".tsr,.der,.pem,.txt"
                            onChange={(event) => {
                                const fichier = event.target.files?.[0];
                                if (fichier) chargerFichier(fichier);
                                event.target.value = '';
                            }}
                        />
                        {nomFichier && (
                            <Typography variant="body2" color="text.secondary">{nomFichier}</Typography>
                        )}
                    </Box>
                    <TextField
                        label={t('temoin.jetonLabel')}
                        value={token}
                        onChange={(event) => {
                            setToken(event.target.value);
                            setNomFichier(null);
                            setVerdict(null);
                        }}
                        multiline
                        minRows={3}
                        maxRows={6}
                        fullWidth
                        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                    />
                    <TextField
                        label={t('temoin.certLabel')}
                        value={cert}
                        onChange={(event) => { setCert(event.target.value); setVerdict(null); }}
                        multiline
                        minRows={2}
                        maxRows={4}
                        fullWidth
                        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                    />
                    {verdict && (
                        <Alert severity={SEVERITE_VERDICT[verdict.verdict]}>
                            <Typography variant="body2" component="div">
                                <strong>{libelleVerdict(verdict.verdict, t)}</strong> — {verdict.message}
                            </Typography>
                            {verdict.sealedAt && (
                                <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                                    {t('temoin.scelleLePrefixe')}{formatDate(verdict.sealedAt)}
                                    {verdict.tsaName ? t('temoin.parTsa', { tsa: verdict.tsaName }) : ''}
                                    {verdict.coverageSeq ? t('temoin.rattacheMaillon', { maillon: verdict.coverageSeq }) : ''}.
                                </Typography>
                            )}
                        </Alert>
                    )}
                </Stack>
            </CardContent>
            <CardActions>
                <Button
                    disabled={token.trim() === '' || verification.isPending}
                    onClick={() => { verification.mutate(); }}
                >
                    {t('temoin.verifier')}
                </Button>
            </CardActions>
        </Card>
    );
}

export function RegistrePage() {
    const { t } = useTranslation('registre');
    return (
        <Box sx={{ p: 2, maxWidth: 900 }}>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
                {t('titre')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('sousTitre')}
            </Typography>
            <Stack spacing={2}>
                <CarteIntegrite />
                <CarteAncrage />
                <CarteTemoin />
            </Stack>
        </Box>
    );
}
