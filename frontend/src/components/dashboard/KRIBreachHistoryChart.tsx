/**
 * KRIBreachHistoryChart - Area chart showing KRI breach trends over time.
 * Refined with smoother curves, premium tooltips, and vibrant accents.
 * Uses theme-aware colors via useChartTheme hook.
 */
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import type { KRIBreachTrendPoint } from '@/types/dashboard';
import { useChartTheme } from '@/hooks/useChartTheme';

interface KRIBreachHistoryChartProps {
    data: KRIBreachTrendPoint[];
    emptyMessage?: string;
}

export function KRIBreachHistoryChart({ data, emptyMessage = 'No KRI breach data available.' }: KRIBreachHistoryChartProps) {
    const chartTheme = useChartTheme();

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm italic font-medium">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="relative group/chart">
            <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                        <linearGradient id="totalEntriesGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1E84FF" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#1E84FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="breachGradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F97316" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
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
                        cursor={{ stroke: chartTheme.cursorStroke, strokeWidth: 1 }}
                        contentStyle={{
                            backgroundColor: chartTheme.tooltipBackground,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            padding: '12px 16px',
                        }}
                        itemStyle={{ color: chartTheme.tooltipTextPrimary, fontSize: '12px', fontWeight: 600, padding: '2px 0' }}
                        labelStyle={{ color: chartTheme.tooltipTextSecondary, fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}
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
                        dataKey="total_entries"
                        name="Total Samples"
                        stroke="#1E84FF"
                        fill="url(#totalEntriesGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: '#1E84FF', strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                    <Area
                        type="monotone"
                        dataKey="breached_entries"
                        name="Breaches"
                        stroke="#F97316"
                        fill="url(#breachGradientNew)"
                        strokeWidth={2.5}
                        animationDuration={1500}
                        activeDot={{ r: 6, stroke: '#F97316', strokeWidth: 2, fill: chartTheme.activeDotFill }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
