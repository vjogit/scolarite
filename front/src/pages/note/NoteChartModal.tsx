import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, ReferenceLine, ZAxis
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '../../components/ui/chart';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';

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

/** Une carte d'indicateur du bandeau : libellé discret, valeur en grand. */
function CarteKpi({ libelle, valeur, className, classeValeur }: {
    libelle: string;
    valeur: string;
    className?: string;
    classeValeur?: string;
}) {
    return (
        <Card size="sm" className={className}>
            <CardContent>
                <p className="m-0 mb-1 text-sm text-muted-foreground">{libelle}</p>
                <p className={cn('m-0 text-2xl', classeValeur)}>{valeur}</p>
            </CardContent>
        </Card>
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
        <div className="rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
            <p className="m-0 text-sm font-bold">{libelleDuPoint(point, t)}</p>
            <p className="m-0 text-sm text-primary">
                {estTranche(point)
                    ? t('noteChartModal.nombreDeleves', { count: point.count })
                    : t('noteChartModal.noteTooltip', { note: point.note?.toFixed(2) ?? '—' })}
            </p>
        </div>
    );
}

const DEFAULT_BUCKET_RANGES = Array.from({ length: 21 }, (_, i) => i);

/**
 * Les couleurs du graphique : des références aux tokens CSS posés au lot 2
 * (`--chart-1..3`, alignés sur primary/error/secondary de MUI dans les deux
 * modes) et aux tokens neutres (`--border`, `--muted-foreground`). recharts
 * prend des couleurs en props JavaScript, pas des classes — mais une
 * référence `var(--token)` posée en attribut SVG est résolue par la cascade
 * CSS, sur la classe `.dark` que `layouts/dashboard.tsx` pose (invariant
 * CLAUDE.md #12) : le mode bascule graphique ouvert sans relecture ni
 * re-rendu. Le lot 4bis résolvait ces tokens au chargement, à la racine du
 * document, et les relisait en observant la classe de `<html>` ; ce
 * mécanisme n'a plus lieu d'être.
 * `ChartStyle` de shadcn, qui poserait ces variables par un `<style>` injecté,
 * n'est pas repris (invariant #11, voir `components/ui/chart.tsx`).
 */
const COULEURS = {
    /** Courbe et barres — `--chart-1` (primary.main). */
    serie: 'var(--chart-1)',
    /** Lignes de référence et leur libellé — `--chart-2` (error.main). */
    reference: 'var(--chart-2)',
    /** Nuage de points — `--chart-3` (secondary.main). */
    nuage: 'var(--chart-3)',
    /** Grille — `--border` (porte déjà son alpha, propre à chaque mode). */
    grille: 'var(--border)',
    /** Lignes, graduations et textes des axes — `--muted-foreground`. */
    axe: 'var(--muted-foreground)',
} as const;

/**
 * Le conteneur shadcn impose `aspect-video` et `text-xs` : ici le graphique
 * remplit son panneau (hauteur du corps de la modale) et garde les 14 px
 * (`text-sm`) que `DialogContent` lui donnait déjà — le tracé des captures
 * de référence ne bouge pas.
 */
const CLASSE_GRAPHIQUE = 'aspect-auto h-full w-full text-sm';

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

    // Le `config` shadcn nomme les séries pour `ChartTooltipContent` et
    // `ChartLegendContent` — que cette modale n'utilise pas (son infobulle
    // est `CustomTooltip`, voir plus bas). Construit au rendu, avec `t` : un
    // libellé figé au chargement du module ignorerait la bascule fr/en
    // (précédent des `actionsLigne`, lot 4bis).
    const config: ChartConfig = {
        note: { label: t('noteChartModal.serieNote') },
        count: { label: t('noteChartModal.axeNombreEleves') },
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
        <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onClose(); }}>
            {/* Pas de croix (parité MUI) ; `sm:max-w-[1200px]` = le `maxWidth="lg"`
                MUI. Hauteur bornée et corps défilant (lot 14) : le corps garde
                ses 600 px tant que l'écran les offre, défile sinon. */}
            <DialogContent
                className="max-h-[calc(100vh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[1200px]"
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle>{t('noteChartModal.titre')}</DialogTitle>
                </DialogHeader>

                {/* Les `dividers` du DialogContent MUI : un filet au-dessus du
                    corps, le pied de page portant déjà le sien. */}
                <div className="-mx-4 flex h-[600px] max-h-full flex-col overflow-y-auto border-t px-4 pt-4">

                    {/* BANDEAU DES KPIs */}
                    {kpis && (
                        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-5">
                            <CarteKpi libelle={t('noteChartModal.moyenne')} valeur={kpis.avg} className="bg-primary/5" classeValeur="text-primary" />
                            <CarteKpi libelle={t('noteChartModal.mediane')} valeur={kpis.median} />
                            <CarteKpi libelle={t('noteChartModal.tauxReussite')} valeur={`${kpis.success}%`} classeValeur={parseFloat(kpis.success) >= 50 ? 'text-success' : 'text-destructive'} />
                            <CarteKpi libelle={t('noteChartModal.noteMax')} valeur={kpis.max} classeValeur="text-success" />
                            <CarteKpi libelle={t('noteChartModal.noteMin')} valeur={kpis.min} classeValeur="text-destructive" />
                        </div>
                    )}

                    <Tabs
                        value={tabValue}
                        onValueChange={(valeur) => { if (typeof valeur === 'number') setTabValue(valeur); }}
                        className="min-h-0 flex-1 gap-0"
                    >
                        <div className="border-b">
                            <TabsList variant="line">
                                <TabsTrigger value={0} className="flex-none">{t('noteChartModal.ongletProgression')}</TabsTrigger>
                                <TabsTrigger value={1} className="flex-none">{t('noteChartModal.ongletDistribution')}</TabsTrigger>
                                <TabsTrigger value={2} className="flex-none">{t('noteChartModal.ongletDispersion')}</TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Les panneaux ne sont montés qu'actifs (`keepMounted`
                            absent) : un seul graphique à la fois, comme avant. */}
                        <div className="min-h-0 flex-1">
                            <TabsContent value={0} className="h-full pt-6">
                                <ChartContainer config={config} className={CLASSE_GRAPHIQUE}>
                                    <LineChart data={lineData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                                        {/* `--border` porte déjà son alpha : pas d'`opacity` par-dessus. */}
                                        <CartesianGrid strokeDasharray="3 3" stroke={COULEURS.grille} />
                                        {/* 3. CORRECTION DE L'AXE X */}
                                        <XAxis
                                            dataKey="uniqueAxisKey" // On utilise la clé cachée unique
                                            tickFormatter={(val: string) => val.split('###')[0] ?? val} // Mais on coupe le "###index" pour l'affichage à l'écran !
                                            angle={-45}
                                            textAnchor="end"
                                            height={70}
                                            stroke={COULEURS.axe}
                                            tick={{ fontSize: 12, fill: COULEURS.axe }}
                                        />
                                        <YAxis domain={[0, 20]} tickCount={11} stroke={COULEURS.axe} tick={{ fill: COULEURS.axe }} />
                                        <ChartTooltip content={CustomTooltip} />
                                        {kpis && (
                                            <ReferenceLine y={parseFloat(kpis.avg)} stroke={COULEURS.reference} strokeDasharray="4 4"
                                                label={{ position: 'top', value: t('noteChartModal.moyenneReferenceLine', { moyenne: kpis.avg }), fill: COULEURS.reference, fontSize: 12 }} />
                                        )}
                                        {/* Animation JS de recharts coupée : la capture de référence e2e
                                            la prendrait en plein tracé (`animations: 'disabled'` de
                                            Playwright ne gèle que le CSS). */}
                                        <Line type="monotone" dataKey="note" stroke={COULEURS.serie} strokeWidth={3} activeDot={{ r: 8 }} dot={{ r: 4 }} isAnimationActive={false} />
                                    </LineChart>
                                </ChartContainer>
                            </TabsContent>

                            {/* ... (Le reste des onglets BarChart et ScatterChart reste identique au précédent message) ... */}

                            <TabsContent value={1} className="h-full pt-6">
                                {/* Le conteneur shadcn peint le curseur d'un `BarChart` en
                                    `fill-muted` par une règle de classe, qui prime sur l'attribut
                                    `fill` du curseur : on la remplace par la série, à 10 % via
                                    `fillOpacity` (le rendu du lot 4bis). */}
                                <ChartContainer config={config} className={cn(CLASSE_GRAPHIQUE, '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-chart-1')}>
                                    <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={COULEURS.grille} vertical={false} />
                                        <XAxis dataKey="label" stroke={COULEURS.axe} tick={{ fill: COULEURS.axe }} />
                                        <YAxis allowDecimals={false} stroke={COULEURS.axe} tick={{ fill: COULEURS.axe }} label={{ value: t('noteChartModal.axeNombreEleves'), angle: -90, position: 'insideLeft', fill: COULEURS.axe }} />
                                        {/* Le curseur est la série à 10 % — `fillOpacity` remplace le rgba() figé. */}
                                        <ChartTooltip content={CustomTooltip} cursor={{ fill: COULEURS.serie, fillOpacity: 0.1 }} />
                                        <Bar dataKey="count" fill={COULEURS.serie} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ChartContainer>
                            </TabsContent>

                            <TabsContent value={2} className="h-full pt-6">
                                <ChartContainer config={config} className={CLASSE_GRAPHIQUE}>
                                    <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={COULEURS.grille} />
                                        <XAxis dataKey="indexId" type="number" name={t('noteChartModal.axeElevesNom')} tick={false} stroke={COULEURS.axe} label={{ value: t('noteChartModal.axeElevesLabel'), position: 'insideBottom', offset: -10, fill: COULEURS.axe }} />
                                        <YAxis dataKey="note" type="number" name="Note" domain={[0, 20]} tickCount={11} stroke={COULEURS.axe} tick={{ fill: COULEURS.axe }} />
                                        <ZAxis range={[60, 60]} />
                                        <ChartTooltip content={CustomTooltip} cursor={{ strokeDasharray: '3 3', stroke: COULEURS.axe }} />
                                        {kpis && <ReferenceLine y={parseFloat(kpis.avg)} stroke={COULEURS.reference} strokeDasharray="4 4" />}
                                        <Scatter name="Notes" data={scatterData} fill={COULEURS.nuage} isAnimationActive={false} />
                                    </ScatterChart>
                                </ChartContainer>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={onClose}>{t('commun.fermer')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
