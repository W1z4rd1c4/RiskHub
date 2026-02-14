/**
 * RiskTrendChart - Area chart showing risk creation trends over time.
 * Refined with smoother curves, better tooltips, and premium styling.
 * Uses theme-aware colors via useChartTheme hook.
 */
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import type { RiskTrendPoint } from '@/types/dashboard';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';
import { useTranslation } from '@/i18n/hooks';

interface RiskTrendChartProps {
    data: RiskTrendPoint[];
    emptyMessage?: string;
}

export function RiskTrendChart({ data, emptyMessage }: RiskTrendChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const resolvedEmptyMessage = emptyMessage ?? t('charts.no_risk_trend_data');
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: {
            borderRadius: '12px',
            backdropFilter: 'blur(12px)',
            padding: '12px 16px',
        },
        itemStyle: { fontWeight: 600, padding: '2px 0' },
        labelStyle: { fontWeight: 800, letterSpacing: '0.05em', marginBottom: '8px' },
    });

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm italic font-medium">
                {resolvedEmptyMessage}
            </div>
        );
    }

    return (
        <div className="relative group/chart">
            <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                        <linearGradient id="totalGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.series.primary} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={chartTheme.series.primary} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="criticalGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.series.secondary} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={chartTheme.series.secondary} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} opacity={0.5} />
                    <XAxis
                        dataKey="period"
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        dx={-5}
                    />
                    <Tooltip
                        {...tooltipProps}
                        cursor={{ stroke: chartTheme.cursorStroke, strokeWidth: 1 }}
                    />
                    <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                            paddingBottom: '20px',
                            fontSize: '10px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: chartTheme.tooltipTextSecondary
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="total_new"
                        name={t('charts.all_new')}
                        stroke={chartTheme.series.primary}
                        fill="url(#totalGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.series.primary, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                    <Area
                        type="monotone"
                        dataKey="critical_new"
                        name={t('charts.critical')}
                        stroke={chartTheme.series.secondary}
                        fill="url(#criticalGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: chartTheme.series.secondary, strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
