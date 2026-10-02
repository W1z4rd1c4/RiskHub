import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useFormat, useTranslation } from '@/i18n/hooks';
import type { IssueAgingBucket } from '@/types/dashboard';
import { getChartTooltipProps } from './chartTooltip';

interface IssueAgingChartProps {
    buckets: IssueAgingBucket[];
}

export function IssueAgingChart({ buckets }: IssueAgingChartProps) {
    const { t } = useTranslation('dashboard');
    const format = useFormat();
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme);
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const seriesLabel = t('issues.summary.open_issues');

    return (
        <ChartFrame
            summary={t('charts.a11y.issue_aging', { total: format.number(total) })}
            isEmpty={total === 0}
            emptyTitle={t('charts.no_open_issues')}
            testId="issue-aging-chart"
            table={{
                columns: [t('charts.a11y.columns.age'), seriesLabel],
                rows: buckets.map((bucket) => ({
                    key: bucket.bucket,
                    header: bucket.bucket,
                    cells: [format.number(bucket.count)],
                })),
            }}
        >
            <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 240 }}>
                    <BarChart data={buckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                        <XAxis
                            dataKey="bucket"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                        />
                        <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                        />
                        <Tooltip
                            {...tooltipProps}
                            cursor={{ fill: chartTheme.gridStroke }}
                        />
                        <Bar dataKey="count" name={seriesLabel} fill={chartTheme.series.primary} radius={[6, 6, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartFrame>
    );
}
