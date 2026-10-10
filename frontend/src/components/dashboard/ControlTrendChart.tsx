/**
 * ControlTrendChart - Bar chart showing control execution trends.
 * Colours come from the theme tokens via useChartTheme; the frame adds the
 * summary, the data table and the empty state (GAP-D-11).
 */
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import type { ControlTrend } from '../../types/dashboard';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';
import { useFormat, useTranslation } from '@/i18n/hooks';

interface ControlTrendChartProps {
    data: ControlTrend[];
    emptyMessage?: string;
}

export function ControlTrendChart({ data, emptyMessage }: ControlTrendChartProps) {
    const { t } = useTranslation('dashboard');
    const format = useFormat();
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: { padding: '12px' },
        labelStyle: { marginBottom: '4px' },
    });
    const seriesLabel = t('charts.executions');
    const total = data.reduce((sum, point) => sum + point.execution_count, 0);

    return (
        <ChartFrame
            summary={t('charts.a11y.control_trend', { total: format.number(total) })}
            isEmpty={data.length === 0}
            emptyTitle={emptyMessage ?? t('sections.no_execution_history')}
            testId="control-trend-chart"
            table={{
                columns: [t('charts.a11y.columns.period'), seriesLabel],
                rows: data.map((point) => ({
                    key: point.period,
                    header: point.period,
                    cells: [format.number(point.execution_count)],
                })),
            }}
        >
            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 300 }}>
                    <BarChart
                        data={data}
                        margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={chartTheme.series.secondary} stopOpacity={0.8} />
                                <stop offset="100%" stopColor={chartTheme.series.secondary} stopOpacity={0.2} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                        <XAxis
                            dataKey="period"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                            dy={10}
                        />
                        <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                        />
                        <Tooltip
                            {...tooltipProps}
                            cursor={{ fill: chartTheme.gridStroke }}
                        />
                        <Bar
                            dataKey="execution_count"
                            name={seriesLabel}
                            radius={[4, 4, 0, 0]}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill="url(#barGradient)" />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartFrame>
    );
}
