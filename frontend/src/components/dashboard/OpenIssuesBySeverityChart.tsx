import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';
import type { IssueSeverityBreakdownItem } from '@/types/dashboard';

interface OpenIssuesBySeverityChartProps {
    items: IssueSeverityBreakdownItem[];
}

const COLORS: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444',
};

export function OpenIssuesBySeverityChart({ items }: OpenIssuesBySeverityChartProps) {
    const chartTheme = useChartTheme();
    const total = items.reduce((sum, item) => sum + item.count, 0);

    return (
        <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={items} dataKey="count" nameKey="severity" outerRadius={84} innerRadius={40} paddingAngle={2}>
                        {items.map((item) => (
                            <Cell key={item.severity} fill={COLORS[item.severity] ?? '#64748b'} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: chartTheme.tooltipBackground,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: '8px',
                            color: chartTheme.tooltipTextPrimary,
                        }}
                        formatter={(value: number, name: string) => [value, name]}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 text-center text-xs text-slate-400">Open issues counted: {total}</div>
        </div>
    );
}
