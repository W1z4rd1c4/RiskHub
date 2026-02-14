import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useTranslation } from '@/i18n/hooks';
import type { IssueSeverityBreakdownItem } from '@/types/dashboard';
import { getChartTooltipProps } from './chartTooltip';

interface OpenIssuesBySeverityChartProps {
    items: IssueSeverityBreakdownItem[];
}

export function OpenIssuesBySeverityChart({ items }: OpenIssuesBySeverityChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme);
    const total = items.reduce((sum, item) => sum + item.count, 0);

    return (
        <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={items} dataKey="count" nameKey="severity" outerRadius={84} innerRadius={40} paddingAngle={2}>
                        {items.map((item) => (
                            <Cell key={item.severity} fill={chartTheme.issueSeverity[item.severity] ?? chartTheme.issueSeverity.fallback} />
                        ))}
                    </Pie>
                    <Tooltip
                        {...tooltipProps}
                        formatter={(value: number, name: string) => [value, t(`issues.severity.${name}`, name)]}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 text-center text-xs text-slate-400">
                {t('issues.summary.open_counted', { count: total })}
            </div>
        </div>
    );
}
