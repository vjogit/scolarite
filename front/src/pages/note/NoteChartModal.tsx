import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Paper, Tabs, Tab, Grid, Card, CardContent
} from "@mui/material";
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, ReferenceLine, ZAxis
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export interface NoteData {
    note?: number | null;
    // `null` et pas seulement `undefined` : les requêtes de notes lisent
    // `u."firstName"` sans contrainte de non-nullité, et sqlc les rend en
    // `*string`. Les trois lectures ci-dessous traitaient déjà l'absence ; le
    // type, lui, la niait.
    firstName?: string | null;
    lastName?: string | null;
}

// --- COMPOSANTS UTILITAIRES ---
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}
function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other} style={{ height: '100%' }}>
            {value === index && (<Box sx={{ height: '100%', pt: 3 }}>{children}</Box>)}
        </div>
    );
}

/**
 * Ce que les graphiques mettent dans un point : soit un élève et sa note, soit
 * une tranche de l'histogramme. Le tooltip est commun aux trois graphiques, il
 * doit donc savoir distinguer les deux.
 */
interface PointEleve extends NoteData {
    displayLabel?: string;
    uniqueAxisKey?: string;
}

interface TrancheHistogramme {
    label: string;
    min: number;
    max: number;
    count: number;
}

type PointGraphique = PointEleve | TrancheHistogramme;

const estTranche = (point: PointGraphique): point is TrancheHistogramme => 'count' in point;

/** Le nom à afficher en tête du tooltip. */
const libelleDuPoint = (point: PointGraphique, t: TFunction<'note'>): string => {
    if (estTranche(point)) return point.label;
    if (point.displayLabel) return point.displayLabel;
    return point.lastName ? `${point.lastName} ${point.firstName ?? ''}` : t('noteChartModal.eleveParDefaut');
};

function CustomTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    const { t } = useTranslation('note');
    // Recharts type le contenu d'un point en `any` : lui seul le transporte,
    // nous seuls savons ce que nous y avons mis. C'est le seul endroit du
    // fichier où l'affirmer, et le reste en découle sans autre assertion.
    const premier: unknown = payload[0];
    const point = (premier as { payload?: PointGraphique } | undefined)?.payload;
    if (!active || !point) return null;

    return (
        <Paper elevation={3} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {libelleDuPoint(point, t)}
            </Typography>
            <Typography variant="body2" color="primary.main">
                {estTranche(point)
                    ? t('noteChartModal.nombreDeleves', { count: point.count })
                    : t('noteChartModal.noteTooltip', { note: point.note?.toFixed(2) ?? '—' })}
            </Typography>
        </Paper>
    );
}

const DEFAULT_BUCKET_RANGES = Array.from({ length: 21 }, (_, i) => i);

/**
 * Les couleurs du graphique, lues depuis les tokens CSS posés au lot 2
 * (`--chart-1..3`, alignés sur primary/error/secondary de MUI dans les deux
 * modes) et les tokens neutres (`--border`, `--muted-foreground`). recharts
 * prend des couleurs en props JavaScript, pas des classes : on résout donc
 * les variables au runtime, à la racine du document.
 */
interface CouleursGraphique {
    /** Courbe et barres — `--chart-1` (primary.main). */
    serie: string;
    /** Lignes de référence et leur libellé — `--chart-2` (error.main). */
    reference: string;
    /** Nuage de points — `--chart-3` (secondary.main). */
    nuage: string;
    /** Grille — `--border` (porte déjà son alpha, propre à chaque mode). */
    grille: string;
    /** Lignes, graduations et textes des axes — `--muted-foreground`. */
    axe: string;
}

function lireCouleurs(): CouleursGraphique {
    const style = getComputedStyle(document.documentElement);
    const lire = (nom: string) => style.getPropertyValue(nom).trim();
    return {
        serie: lire('--chart-1'),
        reference: lire('--chart-2'),
        nuage: lire('--chart-3'),
        grille: lire('--border'),
        axe: lire('--muted-foreground'),
    };
}

/**
 * Relit les tokens quand la classe `.dark` de `<html>` change. On observe la
 * classe que `layouts/dashboard.tsx` pose — la source unique du mode
 * (invariant CLAUDE.md #12) : aucune résolution ici, on la suit, exactement
 * comme les variantes `dark:` de Tailwind.
 */
function useCouleursGraphique(): CouleursGraphique {
    const [couleurs, setCouleurs] = useState(lireCouleurs);
    useEffect(() => {
        const observateur = new MutationObserver(() => { setCouleurs(lireCouleurs()); });
        observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => { observateur.disconnect(); };
    }, []);
    return couleurs;
}

// --- COMPOSANT PRINCIPAL ---
export function NoteChartModal({
    open,
    onClose,
    data,
    successThreshold = 8,
    bucketRanges = DEFAULT_BUCKET_RANGES
}: {
    open: boolean,
    onClose: () => void,
    data: NoteData[],
    successThreshold?: number,
    bucketRanges?: number[]
}) {
    const [tabValue, setTabValue] = useState(0);
    const { t } = useTranslation('note');
    const couleurs = useCouleursGraphique();

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const { kpis, lineData, barData, scatterData } = useMemo(() => {
        if (data.length === 0) {
            return { kpis: null, lineData: [], barData: [], scatterData: [] };
        }

        const evaluatedData = data.filter((d): d is NoteData & { note: number } => d.note != null);
        if (evaluatedData.length === 0) {
            return { kpis: null, lineData: [], barData: [], scatterData: [] };
        }
        // Trié et non vide : le garde ci-dessus l'assure, et `at()` rend le
        // repli explicite plutôt que de promettre une valeur qu'un tableau vide
        // n'aurait pas.
        const notes = evaluatedData.map(d => d.note).sort((a, b) => a - b);
        const valeur = (rang: number) => notes[rang] ?? 0;

        const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
        const median = notes.length % 2 === 0
            ? (valeur(notes.length / 2 - 1) + valeur(notes.length / 2)) / 2
            : valeur(Math.floor(notes.length / 2));
        const successRate = (notes.filter(n => n >= successThreshold).length / notes.length) * 100;

        const kpis = {
            avg: avg.toFixed(2),
            median: median.toFixed(2),
            min: valeur(0).toFixed(2),
            max: valeur(notes.length - 1).toFixed(2),
            success: successRate.toFixed(1)
        };

        // 2. CORRECTION DES DONNÉES DE LA COURBE (LineChart)
        const lineData = [...evaluatedData]
            .sort((a, b) => a.note - b.note)
            .map((d, i) => {
                const label = d.lastName ? `${d.lastName} ${d.firstName ?? ''}`.trim() : `N°${i + 1}`;
                return {
                    ...d,
                    // ASTUCE : On crée une clé 100% unique en ajoutant "###index" à la fin du nom.
                    // Cela évite que Recharts fusionne les tooltips des élèves ayant le même nom.
                    uniqueAxisKey: `${label}###${i}`,
                    displayLabel: label // Ce qu'on affichera réellement dans le Tooltip
                };
            });

        // Histogramme
        const buckets = bucketRanges.slice(0, -1).map((min, rang) => ({
            label: `${min}-${bucketRanges[rang + 1] ?? min}`,
            min,
            max: bucketRanges[rang + 1] ?? min,
            count: 0,
        }));

        evaluatedData.forEach(d => {
            for (const [rang, bucket] of buckets.entries()) {
                const isLast = rang === buckets.length - 1;
                if (d.note >= bucket.min && (isLast ? d.note <= bucket.max : d.note < bucket.max)) {
                    bucket.count++;
                    break;
                }
            }
        });

        // Nuage de points
        const scatterData = [...evaluatedData]
            .sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? ''))
            .map((d, i) => ({
                ...d,
                indexId: i + 1,
            }));

        return { kpis, lineData, barData: buckets, scatterData };
    }, [data, successThreshold, bucketRanges]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
            <DialogTitle>{t('noteChartModal.titre')}</DialogTitle>

            <DialogContent dividers sx={{ height: 600, display: 'flex', flexDirection: 'column' }}>

                {/* BANDEAU DES KPIs */}
                {kpis && (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {/* ... (Identique à avant : Code des Cartes KPIs Moyenne, Médiane, etc.) ... */}
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined" sx={{ bgcolor: 'primary.50' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">{t('noteChartModal.moyenne')}</Typography><Typography variant="h5" color="primary.main">{kpis.avg}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">{t('noteChartModal.mediane')}</Typography><Typography variant="h5">{kpis.median}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">{t('noteChartModal.tauxReussite')}</Typography><Typography variant="h5" color={parseFloat(kpis.success) >= 50 ? 'success.main' : 'error.main'}>{kpis.success}%</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">{t('noteChartModal.noteMax')}</Typography><Typography variant="h5" color="success.main">{kpis.max}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">{t('noteChartModal.noteMin')}</Typography><Typography variant="h5" color="error.main">{kpis.min}</Typography></CardContent></Card></Grid>
                    </Grid>
                )}

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab label={t('noteChartModal.ongletProgression')} />
                        <Tab label={t('noteChartModal.ongletDistribution')} />
                        <Tab label={t('noteChartModal.ongletDispersion')} />
                    </Tabs>
                </Box>

                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                    <CustomTabPanel value={tabValue} index={0}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={lineData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                                {/* `--border` porte déjà son alpha : pas d'`opacity` par-dessus. */}
                                <CartesianGrid strokeDasharray="3 3" stroke={couleurs.grille} />
                                {/* 3. CORRECTION DE L'AXE X */}
                                <XAxis
                                    dataKey="uniqueAxisKey" // On utilise la clé cachée unique
                                    tickFormatter={(val: string) => val.split('###')[0] ?? val} // Mais on coupe le "###index" pour l'affichage à l'écran !
                                    angle={-45}
                                    textAnchor="end"
                                    height={70}
                                    stroke={couleurs.axe}
                                    tick={{ fontSize: 12, fill: couleurs.axe }}
                                />
                                <YAxis domain={[0, 20]} tickCount={11} stroke={couleurs.axe} tick={{ fill: couleurs.axe }} />
                                <RechartsTooltip content={CustomTooltip} />
                                {kpis && (
                                    <ReferenceLine y={parseFloat(kpis.avg)} stroke={couleurs.reference} strokeDasharray="4 4"
                                        label={{ position: 'top', value: t('noteChartModal.moyenneReferenceLine', { moyenne: kpis.avg }), fill: couleurs.reference, fontSize: 12 }} />
                                )}
                                {/* Animation JS de recharts coupée : la capture de référence e2e
                                    la prendrait en plein tracé (`animations: 'disabled'` de
                                    Playwright ne gèle que le CSS). */}
                                <Line type="monotone" dataKey="note" stroke={couleurs.serie} strokeWidth={3} activeDot={{ r: 8 }} dot={{ r: 4 }} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                    {/* ... (Le reste des onglets BarChart et ScatterChart reste identique au précédent message) ... */}

                    <CustomTabPanel value={tabValue} index={1}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={couleurs.grille} vertical={false} />
                                <XAxis dataKey="label" stroke={couleurs.axe} tick={{ fill: couleurs.axe }} />
                                <YAxis allowDecimals={false} stroke={couleurs.axe} tick={{ fill: couleurs.axe }} label={{ value: t('noteChartModal.axeNombreEleves'), angle: -90, position: 'insideLeft', fill: couleurs.axe }} />
                                {/* Le curseur est la série à 10 % — `fillOpacity` remplace le rgba() figé. */}
                                <RechartsTooltip content={CustomTooltip} cursor={{ fill: couleurs.serie, fillOpacity: 0.1 }} />
                                <Bar dataKey="count" fill={couleurs.serie} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                    <CustomTabPanel value={tabValue} index={2}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={couleurs.grille} />
                                <XAxis dataKey="indexId" type="number" name={t('noteChartModal.axeElevesNom')} tick={false} stroke={couleurs.axe} label={{ value: t('noteChartModal.axeElevesLabel'), position: 'insideBottom', offset: -10, fill: couleurs.axe }} />
                                <YAxis dataKey="note" type="number" name="Note" domain={[0, 20]} tickCount={11} stroke={couleurs.axe} tick={{ fill: couleurs.axe }} />
                                <ZAxis range={[60, 60]} />
                                <RechartsTooltip content={CustomTooltip} cursor={{ strokeDasharray: '3 3', stroke: couleurs.axe }} />
                                {kpis && <ReferenceLine y={parseFloat(kpis.avg)} stroke={couleurs.reference} strokeDasharray="4 4" />}
                                <Scatter name="Notes" data={scatterData} fill={couleurs.nuage} isAnimationActive={false} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">{t('commun.fermer')}</Button>
            </DialogActions>
        </Dialog>
    );
}