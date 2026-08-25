import { useQuery } from '@tanstack/react-query';
import { Box, Typography, LinearProgress, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { apiInstance } from '../../services/api';

interface MatiereHeures {
    matiere_id:        number;
    matiere_name:      string;
    ue_name:           string;
    heures_prevues:    number;
    heures_consommees: number;
}

interface Props {
    periodeId: string;
}

export function HeuresPanel({ periodeId }: Props) {
    const { t } = useTranslation('programme');
    const { data = [] } = useQuery<MatiereHeures[]>({
        queryKey: ['heures', periodeId],
        queryFn:  () => apiInstance.get<MatiereHeures[]>(`/api/v0/planning/reservation/heures?periode_id=${periodeId}`).then(r => r.data),
        enabled:  !!periodeId,
    });

    const nonAffectees = data.find(m => m.matiere_id === 0);
    const assigned     = data.filter(m => m.matiere_id !== 0);

    const byUe = assigned.reduce<Record<string, MatiereHeures[]>>((acc, m) => {
        (acc[m.ue_name] ??= []).push(m);
        return acc;
    }, {});

    const totalPrevues    = assigned.reduce((s, m) => s + m.heures_prevues,    0);
    const totalConsommees = assigned.reduce((s, m) => s + m.heures_consommees, 0)
                         + (nonAffectees?.heures_consommees ?? 0);
    const totalPct        = totalPrevues > 0 ? Math.min((totalConsommees / totalPrevues) * 100, 100) : 0;

    return (
        <Box sx={{
            width:      260,
            flexShrink: 0,
            overflowY:  'auto',
            borderLeft: 1,
            borderColor:'divider',
            p:          1.5,
            display:    'flex',
            flexDirection: 'column',
            gap:        2,
        }}>
            {/* Totaux */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="subtitle2" fontWeight="bold">{t('heuresPanel.totalPeriode')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {totalConsommees.toFixed(1)}&thinsp;/&thinsp;{totalPrevues}h
                    </Typography>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={totalPct}
                    sx={{ height: 8, borderRadius: 1 }}
                />
            </Box>

            <Divider />

            {/* Réservations sans matière */}
            {nonAffectees && nonAffectees.heures_consommees > 0 && (
                <>
                    <Box>
                        <Typography
                            variant="caption"
                            color="warning.main"
                            fontWeight="bold"
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                        >
                            {t('heuresPanel.sansAffectation')}
                        </Typography>
                        <Box sx={{ mt: 0.75 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                                <Typography variant="caption" sx={{ fontWeight: 500, color: 'warning.main' }}>
                                    {t('heuresPanel.nonAffectees')}
                                </Typography>
                                <Typography variant="caption" color="warning.main">
                                    {nonAffectees.heures_consommees.toFixed(1)}h
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={100}
                                color="warning"
                                sx={{ height: 4, borderRadius: 1 }}
                            />
                        </Box>
                    </Box>
                    <Divider />
                </>
            )}

            {/* Par UE */}
            {Object.entries(byUe).map(([ueName, matieres]) => (
                <Box key={ueName}>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight="bold"
                        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                        {ueName}
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0.75 }}>
                        {matieres.map(m => {
                            const pct        = m.heures_prevues > 0 ? Math.min((m.heures_consommees / m.heures_prevues) * 100, 100) : 0;
                            const depassement = m.heures_consommees > m.heures_prevues;
                            const restant    = Math.max(m.heures_prevues - m.heures_consommees, 0);

                            return (
                                <Box key={m.matiere_id}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                                        <Typography variant="caption" noWrap sx={{ maxWidth: 150, fontWeight: 500 }}>
                                            {m.matiere_name}
                                        </Typography>
                                        <Typography variant="caption" color={depassement ? 'error' : 'text.secondary'}>
                                            {m.heures_consommees.toFixed(1)}&thinsp;/&thinsp;{m.heures_prevues}h
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={pct}
                                        color={depassement ? 'error' : pct >= 80 ? 'warning' : 'primary'}
                                        sx={{ height: 4, borderRadius: 1 }}
                                    />
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: depassement ? 'error.main' : 'text.disabled' }}>
                                        {depassement
                                            ? t('heuresPanel.depasse', { heures: (m.heures_consommees - m.heures_prevues).toFixed(1) })
                                            : t('heuresPanel.restantes', { heures: restant.toFixed(1) })
                                        }
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
