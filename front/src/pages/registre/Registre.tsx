import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@toolpad/core/useNotifications';
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

const LIBELLE_VERDICT: Record<VerdictTemoin['verdict'], string> = {
    CONFORME: 'Témoin conforme',
    REECRITURE_DETECTEE: 'Réécriture détectée',
    CHAINE_CORROMPUE: 'Chaîne corrompue',
    TOKEN_INVALIDE: 'Jeton illisible',
    SIGNATURE_INVALIDE: 'Signature non probante',
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
}

/** Intégrité interne : recalcul de toute la chaîne, verdict affiché tel quel. */
function CarteIntegrite() {
    const query = useQuery({
        queryKey: [REGISTRE, 'verification'],
        queryFn: fetchVerification,
    });

    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Intégrité de la chaîne</Typography>
                {query.isPending && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">Recalcul de la chaîne…</Typography>
                    </Box>
                )}
                {query.isError && (
                    <Alert severity="error">
                        Impossible de vérifier la chaîne ({messageForError(query.error)}).
                    </Alert>
                )}
                {query.data && (query.data.ok ? (
                    <Alert severity="success">
                        Chaîne valide — {query.data.maillons} maillon{query.data.maillons > 1 ? 's' : ''} vérifié{query.data.maillons > 1 ? 's' : ''}.
                    </Alert>
                ) : (
                    <Alert severity="error">
                        Chaîne rompue au maillon {query.data.broken_at ?? '?'} : {query.data.error}
                    </Alert>
                ))}
            </CardContent>
            <CardActions>
                <Button
                    startIcon={<RefreshIcon />}
                    onClick={() => { void query.refetch(); }}
                    disabled={query.isFetching}
                >
                    Revérifier
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
                notifyError(notifications, "L'ancrage a échoué pour au moins une autorité d'horodatage.");
            } else if (creees > 0) {
                notifySuccess(notifications, 'Nouvelle ancre archivée, témoin envoyé.');
            } else {
                notifySuccess(notifications, "Tête de chaîne déjà ancrée : rien à faire.");
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
                <Typography variant="h6" sx={{ mb: 1 }}>Ancrage externe (RFC 3161)</Typography>
                {query.isPending && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">Lecture des ancres…</Typography>
                    </Box>
                )}
                {query.isError && (
                    <Alert severity="error">
                        Impossible de lire les ancres ({messageForError(query.error)}).
                    </Alert>
                )}
                {query.data && (derniere ? (
                    <Alert severity="info">
                        Dernière ancre réussie le <strong>{formatDate(derniere.created_at)}</strong> —
                        maillon {derniere.registre_seq}, via {derniere.tsa_url} ({ancres.length} ancre{ancres.length > 1 ? 's' : ''} au total).
                    </Alert>
                ) : (
                    <Alert severity="warning">
                        Aucune ancre en base : la tête de chaîne n'a encore jamais été scellée.
                    </Alert>
                ))}
                {resultats?.map((r) => (
                    <Alert
                        key={r.tsa_url}
                        severity={r.error ? 'error' : 'success'}
                        sx={{ mt: 1 }}
                    >
                        {r.error
                            ? `${r.tsa_url} : échec d'ancrage — ${r.error}`
                            : r.created
                                ? `${r.tsa_url} : nouvelle ancre archivée (jeton et certificat conservés).`
                                : `${r.tsa_url} : tête de chaîne déjà ancrée, aucune requête émise.`}
                    </Alert>
                ))}
            </CardContent>
            <CardActions>
                <Button
                    startIcon={<AnchorIcon />}
                    onClick={() => { ancrage.mutate(); }}
                    disabled={ancrage.isPending}
                >
                    Ancrer maintenant
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
                <Typography variant="h6" sx={{ mb: 1 }}>Vérifier un témoin</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Déposez le jeton reçu par courriel depuis la boîte témoin (pièce
                    jointe .tsr, ou son contenu collé). La confrontation avec la chaîne
                    actuelle détecte toute réécriture postérieure au scellement.
                </Typography>
                <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                            startIcon={<UploadFileIcon />}
                            variant="outlined"
                            onClick={() => { fichierRef.current?.click(); }}
                        >
                            Fichier .tsr
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
                        label="Jeton (contenu du .tsr, base64 ou PEM)"
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
                        label="Certificat TSA (PEM, optionnel — sinon le certificat racine configuré)"
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
                                <strong>{LIBELLE_VERDICT[verdict.verdict]}</strong> — {verdict.message}
                            </Typography>
                            {verdict.sealedAt && (
                                <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                                    Scellé le {formatDate(verdict.sealedAt)}
                                    {verdict.tsaName ? ` par ${verdict.tsaName}` : ''}
                                    {verdict.coverageSeq ? ` — rattaché au maillon ${verdict.coverageSeq}` : ''}.
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
                    Vérifier le témoin
                </Button>
            </CardActions>
        </Card>
    );
}

export function RegistrePage() {
    return (
        <Box sx={{ p: 2, maxWidth: 900 }}>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
                Registre
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Le registre chaîné trace toute écriture de note et de jury. Son
                intégrité se vérifie ici, et les témoins reçus par la boîte externe
                s'y confrontent à la chaîne actuelle.
            </Typography>
            <Stack spacing={2}>
                <CarteIntegrite />
                <CarteAncrage />
                <CarteTemoin />
            </Stack>
        </Box>
    );
}
