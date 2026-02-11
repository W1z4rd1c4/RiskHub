import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';
import type { IssueAgingBucket } from '@/types/dashboard';

interface IssueAgingChartProps {
    buckets: IssueAgingBucket[];
}

export function IssueAgingChart({ buckets }: IssueAgingChartProps) {
    const chartTheme = useChartTheme();

    return (
        <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                    <XAxis
                        dataKey="bucket"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }} />
                    <Tooltip
                        cursor={{ fill: chartTheme.gridStroke }}
                        contentStyle={{
                            backgroundColor: chartTheme.tooltipBackground,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: '8px',
                            color: chartTheme.tooltipTextPrimary,
                        }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
