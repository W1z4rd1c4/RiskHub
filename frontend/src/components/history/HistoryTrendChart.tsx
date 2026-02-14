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
import { cn } from '@/lib/utils';
import type { HistoryTrendPoint } from '@/types/history';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useTranslation } from '@/i18n/hooks';

interface HistoryTrendChartProps {
    data: HistoryTrendPoint[];
    lowerLimit?: number;
    upperLimit?: number;
    valueLabel?: string;
    formatValue?: (value: number) => string;
    emptyMessage?: string;
    className?: string;
}

const defaultFormat = (value: number) => value.toLocaleString();

export function HistoryTrendChart({
    data,
    lowerLimit,
    upperLimit,
    valueLabel,
    formatValue = defaultFormat,
    emptyMessage,
    className,
}: HistoryTrendChartProps) {
    const { t } = useTranslation(['common', 'controls']);
    const chartTheme = useChartTheme();
    const resolvedValueLabel = valueLabel ?? t('common:labels.value');
    const resolvedEmptyMessage = emptyMessage ?? t('common:empty.no_data_available');

    if (!data || data.length === 0) {
        return (
            <div className={cn('flex items-center justify-center h-[280px] text-slate-500 text-sm', className)}>
                {resolvedEmptyMessage}
            </div>
        );
    }

    return (
        <div className={cn('w-full h-[280px]', className)}>
            <ResponsiveContainer width="100%" height="100%">
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
                        tickFormatter={formatValue}
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
                            fontWeight: 900,
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}
                        formatter={(value: number | undefined) => [value !== undefined ? formatValue(value) : t('common:fallbacks.not_available'), resolvedValueLabel]}
                    />

                    {/* Lower threshold reference line */}
                    {lowerLimit !== undefined && (
                        <ReferenceLine
                            y={lowerLimit}
                            stroke={chartTheme.threshold.min}
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                                value: `${t('controls:detail.level_min')}: ${formatValue(lowerLimit)}`,
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
                                value: `${t('controls:detail.level_max')}: ${formatValue(upperLimit)}`,
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
    );
}
