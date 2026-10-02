/**
 * HistoryTrendChart - Reusable trend chart for historical series data.
 * Supports reference lines for thresholds and gradient fills.
 * Uses theme-aware colors via useChartTheme hook.
 */
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import { ChartFrame } from '@/components/ui/ChartFrame';
import type { HistoryTrendPoint } from '@/types/history';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useFormat, useTranslation } from '@/i18n/hooks';

interface HistoryTrendChartProps {
    data: HistoryTrendPoint[];
    lowerLimit?: number;
    upperLimit?: number;
    valueLabel?: string;
    formatValue?: (value: number) => string;
    emptyMessage?: string;
    className?: string;
}

export function HistoryTrendChart({
    data,
    lowerLimit,
    upperLimit,
    valueLabel,
    formatValue,
    emptyMessage,
    className,
}: HistoryTrendChartProps) {
    const { t } = useTranslation(['common', 'controls']);
    const format = useFormat();
    const chartTheme = useChartTheme();
    const resolvedValueLabel = valueLabel ?? t('common:labels.value');
    const resolvedEmptyMessage = emptyMessage ?? t('common:empty.no_data_available');
    const resolvedFormatValue = formatValue ?? ((value: number) => format.number(value));

    const points = data ?? [];
    const latest = points[points.length - 1];
    const values = points.map((point) => point.value);
    // GAP-D-11: the chart is a named `figure` (summary) with the plotted values as a
    // visually hidden table; an empty series renders the one shared `EmptyState`.
    const summary = latest
        ? t('common:history_chart.summary', {
            label: resolvedValueLabel,
            latest: resolvedFormatValue(latest.value),
            period: latest.label,
            min: resolvedFormatValue(Math.min(...values)),
            max: resolvedFormatValue(Math.max(...values)),
        })
        : resolvedEmptyMessage;

    return (
        <ChartFrame
            summary={summary}
            isEmpty={points.length === 0}
            emptyTitle={resolvedEmptyMessage}
            emptyLayout="section"
            className={className}
            testId="history-trend-chart"
            table={{
                columns: [t('common:history_chart.period'), resolvedValueLabel],
                rows: points.map((point, index) => ({
                    key: `${index}-${point.label}`,
                    header: point.label,
                    cells: [resolvedFormatValue(point.value)],
                })),
            }}
        >
            <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 280 }}>
                    <AreaChart
                        data={data}
                        margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="historyTrendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={chartTheme.series.primary} stopOpacity={0.4} />
                                <stop offset="100%" stopColor={chartTheme.series.primary} stopOpacity={0.05} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke={chartTheme.gridStroke}
                        />

                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 700 }}
                            dy={10}
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 700 }}
                            tickFormatter={resolvedFormatValue}
                        />

                        <Tooltip
                            cursor={{ stroke: chartTheme.cursorStroke }}
                            contentStyle={{
                                backgroundColor: chartTheme.tooltipBackground,
                                border: `1px solid ${chartTheme.tooltipBorder}`,
                                borderRadius: '8px',
                                backdropFilter: 'blur(8px)',
                                padding: '12px',
                            }}
                            itemStyle={{ color: chartTheme.tooltipTextPrimary }}
                            labelStyle={{
                                color: chartTheme.tooltipTextSecondary,
                                fontSize: '10px',
                                fontWeight: 700,
                                marginBottom: '4px',
                                textTransform: 'uppercase'
                            }}
                            formatter={(value) => {
                                const numericValue = typeof value === 'number'
                                    ? value
                                    : Array.isArray(value)
                                        ? Number(value[0] ?? Number.NaN)
                                        : Number(value ?? Number.NaN);

                                return [
                                    Number.isFinite(numericValue)
                                        ? resolvedFormatValue(numericValue)
                                        : t('common:fallbacks.not_available'),
                                    resolvedValueLabel
                                ];
                            }}
                        />

                        {/* Lower threshold reference line */}
                        {lowerLimit !== undefined && (
                            <ReferenceLine
                                y={lowerLimit}
                                stroke={chartTheme.threshold.min}
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                    value: t('common:labels.label_value', { label: t('controls:detail.level_min'), value: resolvedFormatValue(lowerLimit) }),
                                    position: 'left',
                                    fill: chartTheme.threshold.min,
                                    fontSize: 10,
                                    fontWeight: 700,
                                }}
                            />
                        )}

                        {/* Upper threshold reference line */}
                        {upperLimit !== undefined && (
                            <ReferenceLine
                                y={upperLimit}
                                stroke={chartTheme.threshold.max}
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                    value: t('common:labels.label_value', { label: t('controls:detail.level_max'), value: resolvedFormatValue(upperLimit) }),
                                    position: 'left',
                                    fill: chartTheme.threshold.max,
                                    fontSize: 10,
                                    fontWeight: 700,
                                }}
                            />
                        )}

                        <Area
                            type="monotone"
                            dataKey="value"
                            name={resolvedValueLabel}
                            stroke={chartTheme.series.primary}
                            strokeWidth={2}
                            fill="url(#historyTrendGradient)"
                            dot={{ fill: chartTheme.series.primary, strokeWidth: 0, r: 3 }}
                            activeDot={{ fill: chartTheme.series.primary, strokeWidth: 2, stroke: chartTheme.activeDotFill, r: 5 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </ChartFrame>
    );
}
