import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useTranslation } from '@/i18n/hooks';
import type { IssueSeverityBreakdownItem } from '@/types/dashboard';
import { getChartTooltipProps } from './chartTooltip';

interface OpenIssuesBySeverityChartProps {
    items: IssueSeverityBreakdownItem[];
}

type SeverityKey = 'low' | 'medium' | 'high' | 'critical';
const SEVERITY_KEYS: readonly SeverityKey[] = ['low', 'medium', 'high', 'critical'] as const;

interface IssueSeverityChartDatum {
    severity: string;
    count: number;
    [key: string]: string | number;
}

function isSeverityKey(value: string): value is SeverityKey {
    return (SEVERITY_KEYS as readonly string[]).includes(value);
}

export function OpenIssuesBySeverityChart({ items }: OpenIssuesBySeverityChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme);
    const total = items.reduce((sum, item) => sum + item.count, 0);
    const chartData: IssueSeverityChartDatum[] = items.map((item) => ({
        severity: item.severity,
        count: item.count,
    }));

    return (
        <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 240 }}>
                <PieChart>
                    <Pie data={chartData} dataKey="count" nameKey="severity" outerRadius={84} innerRadius={40} paddingAngle={2}>
                        {chartData.map((item) => {
                            const severity = item.severity.toLowerCase();
                            const fill = isSeverityKey(severity)
                                ? chartTheme.issueSeverity[severity]
                                : chartTheme.issueSeverity.fallback;

                            return (
                                <Cell key={`${item.severity}-${item.count}`} fill={fill} />
                            );
                        })}
                    </Pie>
                    <Tooltip
                        {...tooltipProps}
                        formatter={(value, name) => {
                            const numericValue = typeof value === 'number'
                                ? value
                                : Array.isArray(value)
                                    ? Number(value[0] ?? 0)
                                    : Number(value ?? 0);
                            const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
                            const severityName = typeof name === 'string' ? name : String(name ?? '');
                            return [safeValue, t(`issues.severity.${severityName}`, severityName)];
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 text-center text-xs text-slate-400">
                {t('issues.summary.open_counted', { count: total })}
            </div>
        </div>
    );
}
