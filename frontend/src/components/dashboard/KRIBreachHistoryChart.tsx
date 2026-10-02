/**
 * KRIBreachHistoryChart - Area chart showing KRI breach trends over time.
 * Colours come from the theme tokens via useChartTheme (the breach series uses the danger tone);
 * the frame adds the summary, the data table, the token legend and the empty state (GAP-D-11).
 */
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { KRIBreachTrendPoint } from '@/types/dashboard';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';
import { useFormat, useTranslation } from '@/i18n/hooks';

interface KRIBreachHistoryChartProps {
    data: KRIBreachTrendPoint[];
    emptyMessage?: string;
}

export function KRIBreachHistoryChart({ data, emptyMessage }: KRIBreachHistoryChartProps) {
    const { t } = useTranslation('dashboard');
    const format = useFormat();
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: {
            backdropFilter: 'blur(12px)',
            padding: '12px 16px',
        },
        itemStyle: { fontWeight: 600, padding: '2px 0' },
        labelStyle: { letterSpacing: '0.05em', marginBottom: '8px' },
    });
    const samplesLabel = t('charts.total_samples');
    const breachesLabel = t('charts.breaches');
    const totalSamples = data.reduce((sum, point) => sum + point.total_entries, 0);
    const totalBreaches = data.reduce((sum, point) => sum + point.breached_entries, 0);

    return (
        <ChartFrame
            summary={t('charts.a11y.kri_breach_trend', {
                total: format.number(totalSamples),
                breaches: format.number(totalBreaches),
            })}
            isEmpty={data.length === 0}
            emptyTitle={emptyMessage ?? t('charts.no_kri_breach_data')}
            testId="kri-breach-history-chart"
            legend={[
                { key: 'total_entries', label: samplesLabel, color: chartTheme.series.primary },
                { key: 'breached_entries', label: breachesLabel, color: chartTheme.series.danger },
            ]}
            table={{
                columns: [t('charts.a11y.columns.period'), samplesLabel, breachesLabel],
                rows: data.map((point) => ({
                    key: point.period,
                    header: point.period,
                    cells: [format.number(point.total_entries), format.number(point.breached_entries)],
                })),
            }}
        >
            <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 1, height: 260 }}>
                <AreaChart data={data} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                        <linearGradient id="totalEntriesGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.series.primary} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={chartTheme.series.primary} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="breachGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.series.danger} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={chartTheme.series.danger} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} opacity={0.5} />
                    <XAxis
                        dataKey="period"
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        dx={-5}
                    />
                    <Tooltip
                        {...tooltipProps}
                        cursor={{ stroke: chartTheme.cursorStroke, strokeWidth: 1 }}
                    />
                    <Area
                        type="monotone"
                        dataKey="total_entries"
                        name={samplesLabel}
                        stroke={chartTheme.series.primary}
                        fill="url(#totalEntriesGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.series.primary, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                    <Area
                        type="monotone"
                        dataKey="breached_entries"
                        name={breachesLabel}
                        stroke={chartTheme.series.danger}
                        fill="url(#breachGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.series.danger, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </ChartFrame>
    );
}
