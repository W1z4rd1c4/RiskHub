/**
 * ControlTrendChart - Bar chart showing control execution trends.
 * Uses theme-aware colors via useChartTheme hook.
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
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';

interface ControlTrendChartProps {
    data: ControlTrend[];
}

export function ControlTrendChart({ data }: ControlTrendChartProps) {
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: { padding: '12px' },
        labelStyle: { fontWeight: 900, marginBottom: '4px' },
    });

    return (
        <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8} />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.2} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                    <XAxis
                        dataKey="period"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 700 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip
                        {...tooltipProps}
                        cursor={{ fill: chartTheme.gridStroke }}
                    />
                    <Bar
                        dataKey="execution_count"
                        name="Executions"
                        radius={[4, 4, 0, 0]}
                    >
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill="url(#barGradient)" />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
