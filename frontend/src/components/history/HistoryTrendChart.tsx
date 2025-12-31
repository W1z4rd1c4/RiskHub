/**
 * HistoryTrendChart - Reusable trend chart for historical series data.
 * Supports reference lines for thresholds and gradient fills.
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
    valueLabel = 'Value',
    formatValue = defaultFormat,
    emptyMessage = 'No data available',
    className,
}: HistoryTrendChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className={cn('flex items-center justify-center h-[280px] text-slate-500 text-sm', className)}>
                {emptyMessage}
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
                            <stop offset="0%" stopColor="#1e84ff" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#1e84ff" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(255,255,255,0.05)"
                    />

                    <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        dy={10}
                    />

                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        tickFormatter={formatValue}
                    />

                    <Tooltip
                        cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                        contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            padding: '12px',
                        }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{
                            color: '#94a3b8',
                            fontSize: '10px',
                            fontWeight: 900,
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}
                        formatter={(value: number | undefined) => [value !== undefined ? formatValue(value) : '—', valueLabel]}
                    />

                    {/* Lower threshold reference line */}
                    {lowerLimit !== undefined && (
                        <ReferenceLine
                            y={lowerLimit}
                            stroke="#f59e0b"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                                value: `Min: ${formatValue(lowerLimit)}`,
                                position: 'left',
                                fill: '#f59e0b',
                                fontSize: 10,
                                fontWeight: 700,
                            }}
                        />
                    )}

                    {/* Upper threshold reference line */}
                    {upperLimit !== undefined && (
                        <ReferenceLine
                            y={upperLimit}
                            stroke="#ef4444"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                                value: `Max: ${formatValue(upperLimit)}`,
                                position: 'left',
                                fill: '#ef4444',
                                fontSize: 10,
                                fontWeight: 700,
                            }}
                        />
                    )}

                    <Area
                        type="monotone"
                        dataKey="value"
                        name={valueLabel}
                        stroke="#1e84ff"
                        strokeWidth={2}
                        fill="url(#historyTrendGradient)"
                        dot={{ fill: '#1e84ff', strokeWidth: 0, r: 3 }}
                        activeDot={{ fill: '#1e84ff', strokeWidth: 2, stroke: '#fff', r: 5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
