import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { isSeverityBand, severityClass } from '@/lib/severity';
import { cn } from '@/lib/utils';
import type { IssueSeverityBreakdownItem } from '@/types/dashboard';
import { getChartTooltipProps } from './chartTooltip';

interface OpenIssuesBySeverityChartProps {
    items: IssueSeverityBreakdownItem[];
}

interface IssueSeverityChartDatum {
    severity: string;
    count: number;
    [key: string]: string | number;
}

export function OpenIssuesBySeverityChart({ items }: OpenIssuesBySeverityChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const format = useFormat();
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
                            const fill = isSeverityBand(severity)
                                ? chartTheme.severity[severity]
                                : chartTheme.severity.fallback;

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
            {/* Text legend: severity is never carried by colour alone (D1). */}
            <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {chartData.map((item) => {
                    const severity = item.severity.toLowerCase();
                    return (
                        <li key={item.severity} className="flex items-center gap-1.5">
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'size-2 shrink-0 rounded-full',
                                    isSeverityBand(severity) ? severityClass('dot', severity) : 'bg-muted-foreground',
                                )}
                            />
                            <span>{t(`issues.severity.${severity}`, item.severity)}</span>
                            <span className="font-semibold text-foreground tabular-nums">{format.number(item.count)}</span>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-1 text-center text-xs text-muted-foreground">
                {t('issues.summary.open_counted', { count: total })}
            </div>
        </div>
    );
}
