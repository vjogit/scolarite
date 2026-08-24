import React, { useMemo, useState } from 'react';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Paper, Tabs, Tab, Grid, Card, CardContent
} from "@mui/material";
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
const libelleDuPoint = (point: PointGraphique): string => {
    if (estTranche(point)) return point.label;
    if (point.displayLabel) return point.displayLabel;
    return point.lastName ? `${point.lastName} ${point.firstName ?? ''}` : 'Élève';
};

function CustomTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    // Recharts type le contenu d'un point en `any` : lui seul le transporte,
    // nous seuls savons ce que nous y avons mis. C'est le seul endroit du
    // fichier où l'affirmer, et le reste en découle sans autre assertion.
    const premier: unknown = payload[0];
    const point = (premier as { payload?: PointGraphique } | undefined)?.payload;
    if (!active || !point) return null;

    return (
        <Paper elevation={3} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {libelleDuPoint(point)}
            </Typography>
            <Typography variant="body2" color="primary.main">
                {estTranche(point)
                    ? `Nombre d'élèves : ${point.count}`
                    : `Note : ${point.note?.toFixed(2) ?? '—'} / 20`}
            </Typography>
        </Paper>
    );
}

const DEFAULT_BUCKET_RANGES = Array.from({ length: 21 }, (_, i) => i);

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
            <DialogTitle>Analyse des résultats de la classe</DialogTitle>

            <DialogContent dividers sx={{ height: 600, display: 'flex', flexDirection: 'column' }}>

                {/* BANDEAU DES KPIs */}
                {kpis && (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {/* ... (Identique à avant : Code des Cartes KPIs Moyenne, Médiane, etc.) ... */}
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined" sx={{ bgcolor: 'primary.50' }}><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">Moyenne</Typography><Typography variant="h5" color="primary.main">{kpis.avg}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">Médiane</Typography><Typography variant="h5">{kpis.median}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">Taux Réussite</Typography><Typography variant="h5" color={parseFloat(kpis.success) >= 50 ? 'success.main' : 'error.main'}>{kpis.success}%</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">Note Max</Typography><Typography variant="h5" color="success.main">{kpis.max}</Typography></CardContent></Card></Grid>
                        <Grid size={{ xs: 12, sm: 2.4 }}><Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}><Typography color="text.secondary" gutterBottom variant="body2">Note Min</Typography><Typography variant="h5" color="error.main">{kpis.min}</Typography></CardContent></Card></Grid>
                    </Grid>
                )}

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab label="1. Courbe de Progression" />
                        <Tab label="2. Distribution (Tranches)" />
                        <Tab label="3. Dispersion Globale" />
                    </Tabs>
                </Box>

                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                    <CustomTabPanel value={tabValue} index={0}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={lineData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                                {/* 3. CORRECTION DE L'AXE X */}
                                <XAxis
                                    dataKey="uniqueAxisKey" // On utilise la clé cachée unique
                                    tickFormatter={(val: string) => val.split('###')[0] ?? val} // Mais on coupe le "###index" pour l'affichage à l'écran !
                                    angle={-45}
                                    textAnchor="end"
                                    height={70}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis domain={[0, 20]} tickCount={11} />
                                <RechartsTooltip content={CustomTooltip} />
                                {kpis && (
                                    <ReferenceLine y={parseFloat(kpis.avg)} stroke="#d32f2f" strokeDasharray="4 4"
                                        label={{ position: 'top', value: `Moyenne (${kpis.avg})`, fill: '#d32f2f', fontSize: 12 }} />
                                )}
                                <Line type="monotone" dataKey="note" stroke="#1976d2" strokeWidth={3} activeDot={{ r: 8 }} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                    {/* ... (Le reste des onglets BarChart et ScatterChart reste identique au précédent message) ... */}

                    <CustomTabPanel value={tabValue} index={1}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.5} vertical={false} />
                                <XAxis dataKey="label" />
                                <YAxis allowDecimals={false} label={{ value: "Nb. d'élèves", angle: -90, position: 'insideLeft' }} />
                                <RechartsTooltip content={CustomTooltip} cursor={{ fill: 'rgba(25, 118, 210, 0.1)' }} />
                                <Bar dataKey="count" fill="#1976d2" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                    <CustomTabPanel value={tabValue} index={2}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                                <XAxis dataKey="indexId" type="number" name="Élève" tick={false} label={{ value: "Élèves (Ordre alphabétique)", position: 'insideBottom', offset: -10 }} />
                                <YAxis dataKey="note" type="number" name="Note" domain={[0, 20]} tickCount={11} />
                                <ZAxis range={[60, 60]} />
                                <RechartsTooltip content={CustomTooltip} cursor={{ strokeDasharray: '3 3' }} />
                                {kpis && <ReferenceLine y={parseFloat(kpis.avg)} stroke="#d32f2f" strokeDasharray="4 4" />}
                                <Scatter name="Notes" data={scatterData} fill="#9c27b0" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </CustomTabPanel>

                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}