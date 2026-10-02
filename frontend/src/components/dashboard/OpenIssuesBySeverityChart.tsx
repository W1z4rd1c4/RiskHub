import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { isSeverityBand } from '@/lib/severity';
import type { IssueSeverityBreakdownItem } from '@/types/dashboard';
import { getChartTooltipProps } from './chartTooltip';

interface OpenIssuesBySeverityChartProps {
    items: IssueSeverityBreakdownItem[];
}

interface IssueSeverityChartDatum {
    severity: string;
    label: string;
    count: number;
    color: string;
    [key: string]: string | number;
}

export function OpenIssuesBySeverityChart({ items }: OpenIssuesBySeverityChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const format = useFormat();
    const tooltipProps = getChartTooltipProps(chartTheme);
    const total = items.reduce((sum, item) => sum + item.count, 0);
    // D1: severity colours come from the band tokens; the label always travels with the colour.
    const chartData: IssueSeverityChartDatum[] = items.map((item) => {
        const severity = item.severity.toLowerCase();
        return {
            severity,
            label: t(`issues.severity.${severity}`, item.severity),
            count: item.count,
            color: isSeverityBand(severity) ? chartTheme.severity[severity] : chartTheme.severity.fallback,
        };
    });

    return (
        <ChartFrame
            summary={t('charts.a11y.issue_severity', { total: format.number(total) })}
            isEmpty={total === 0}
            emptyTitle={t('charts.no_open_issues')}
            testId="issue-severity-chart"
            legend={chartData.map((item) => ({
                key: item.severity,
                label: item.label,
                color: item.color,
                value: format.number(item.count),
            }))}
            table={{
                columns: [t('charts.a11y.columns.severity'), t('issues.summary.open_issues')],
                rows: chartData.map((item) => ({
                    key: item.severity,
                    header: item.label,
                    cells: [format.number(item.count)],
                })),
            }}
        >
            <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 220 }}>
                    <PieChart>
                        <Pie data={chartData} dataKey="count" nameKey="label" outerRadius={84} innerRadius={40} paddingAngle={2}>
                            {chartData.map((item) => (
                                <Cell key={item.severity} fill={item.color} />
                            ))}
                        </Pie>
                        <Tooltip {...tooltipProps} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">
                {t('issues.summary.open_counted', { count: total })}
            </p>
        </ChartFrame>
    );
}
