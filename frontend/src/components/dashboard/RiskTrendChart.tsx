/**
 * RiskTrendChart - Area chart showing risk creation trends over time.
 * Colours come from the theme tokens via useChartTheme (severity-coded series use the D1 band tokens);
 * the frame adds the summary, the data table, the token legend and the empty state (GAP-D-11).
 */
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { RiskTrendPoint } from '@/types/dashboard';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';
import { useFormat, useTranslation } from '@/i18n/hooks';

interface RiskTrendChartProps {
    data: RiskTrendPoint[];
    emptyMessage?: string;
}

export function RiskTrendChart({ data, emptyMessage }: RiskTrendChartProps) {
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
    const totalLabel = t('charts.all_new');
    const criticalLabel = t('charts.critical');
    const totalNew = data.reduce((sum, point) => sum + point.total_new, 0);
    const criticalNew = data.reduce((sum, point) => sum + point.critical_new, 0);

    return (
        <ChartFrame
            summary={t('charts.a11y.risk_trend', {
                total: format.number(totalNew),
                critical: format.number(criticalNew),
            })}
            isEmpty={data.length === 0}
            emptyTitle={emptyMessage ?? t('charts.no_risk_trend_data')}
            testId="risk-trend-chart"
            legend={[
                { key: 'total_new', label: totalLabel, color: chartTheme.series.primary },
                { key: 'critical_new', label: criticalLabel, color: chartTheme.severity.critical },
            ]}
            table={{
                columns: [t('charts.a11y.columns.period'), totalLabel, criticalLabel],
                rows: data.map((point) => ({
                    key: point.period,
                    header: point.period,
                    cells: [format.number(point.total_new), format.number(point.critical_new)],
                })),
            }}
        >
            <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 1, height: 260 }}>
                <AreaChart data={data} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                        <linearGradient id="totalGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.series.primary} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={chartTheme.series.primary} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="criticalGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.severity.critical} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={chartTheme.severity.critical} stopOpacity={0} />
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
                        dataKey="total_new"
                        name={totalLabel}
                        stroke={chartTheme.series.primary}
                        fill="url(#totalGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.series.primary, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                    <Area
                        type="monotone"
                        dataKey="critical_new"
                        name={criticalLabel}
                        stroke={chartTheme.severity.critical}
                        fill="url(#criticalGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.severity.critical, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </ChartFrame>
    );
}
