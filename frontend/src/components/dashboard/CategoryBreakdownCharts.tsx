/**
 * CategoryBreakdownCharts - Donut charts showing the control breakdown by status, form and frequency.
 * Colours come from the theme tokens via useChartTheme; labels are translated codes (GAP-D-02) and
 * each donut is a `ChartFrame` with a summary, a data table and a text legend (GAP-D-11). Legend
 * items of the filterable donuts are toggle buttons, the keyboard path for the segment click.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { translateCode } from '@/lib/humanizeCode';
import { useDashboardFilterMutators, useDashboardFilterSelector } from '../../contexts/DashboardFilterContext';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';
import { isControlForm, isControlStatus } from '@/types/control';

interface CategoryBreakdownChartsProps {
    controlsByStatus: Record<string, number>;
    controlsByForm: Record<string, number>;
    controlsByFrequency: Record<string, number>;
}

interface MiniPieChartProps {
    title: string;
    data: Record<string, number>;
    colors: Record<string, string>;
    onSegmentSelect?: (key: string) => void;
    selectedKey?: string | null;
    testId: string;
}

function MiniPieChart({ title, data, colors, onSegmentSelect, selectedKey = null, testId }: MiniPieChartProps) {
    const { t } = useTranslation('dashboard');
    const format = useFormat();
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: {
            padding: '8px 12px',
        },
    });
    const chartData = Object.entries(data).map(([key, value]) => ({
        name: translateCode(t, 'charts', key),
        value,
        key,
        color: colors[key] ?? chartTheme.series.neutral,
    }));

    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    const percentOf = (value: number) => format.percent(total > 0 ? value / total : 0, 0);

    return (
        <div className="flex flex-col items-center">
            <h3 className="text-eyebrow mb-4">{title}</h3>
            <ChartFrame
                summary={t('charts.a11y.breakdown', { title, total: format.number(total) })}
                isEmpty={total === 0}
                emptyTitle={t('common:empty.no_data')}
                emptyLayout="inline"
                testId={testId}
                className="flex flex-col items-center"
                legend={chartData.map((entry) => ({
                    key: entry.key,
                    label: entry.name,
                    color: entry.color,
                    value: format.number(entry.value),
                }))}
                onLegendSelect={onSegmentSelect}
                selectedLegendKey={selectedKey}
                table={{
                    columns: [t('charts.a11y.columns.category'), t('charts.a11y.columns.controls'), t('charts.a11y.columns.share')],
                    rows: chartData.map((entry) => ({
                        key: entry.key,
                        header: entry.name,
                        cells: [format.number(entry.value), percentOf(entry.value)],
                    })),
                }}
            >
                <div className="relative size-44">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 176 }}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={2}
                                dataKey="value"
                                onClick={(_, index) => {
                                    const key = chartData[index]?.key;
                                    if (key) {
                                        onSegmentSelect?.(key);
                                    }
                                }}
                                cursor={onSegmentSelect ? 'pointer' : undefined}
                            >
                                {chartData.map((entry) => (
                                    <Cell
                                        key={entry.key}
                                        fill={entry.color}
                                        className="transition-opacity hover:opacity-80"
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                {...tooltipProps}
                                formatter={(value, name) => {
                                    const count = typeof value === 'number' ? value : Number(value ?? 0);
                                    const label = typeof name === 'string' ? name : String(name ?? '');
                                    return [`${format.number(count)} (${percentOf(count)})`, label];
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="font-heading text-2xl font-bold text-foreground">{format.number(total)}</span>
                    </div>
                </div>
            </ChartFrame>
        </div>
    );
}

export function CategoryBreakdownCharts({
    controlsByStatus,
    controlsByForm,
    controlsByFrequency
}: CategoryBreakdownChartsProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const controlStatus = useDashboardFilterSelector(state => state.filters.controlStatus);
    const controlForm = useDashboardFilterSelector(state => state.filters.controlForm);
    const { setControlStatus, setControlForm } = useDashboardFilterMutators();

    return (
        <WidgetShell title={t('charts.breakdown')}>
            <div className="grid grid-cols-3 gap-8">
                <MiniPieChart
                    title={t('charts.by_status')}
                    data={controlsByStatus}
                    colors={chartTheme.breakdown.status}
                    selectedKey={controlStatus}
                    onSegmentSelect={(key) => setControlStatus(isControlStatus(key) && key !== controlStatus ? key : null)}
                    testId="control-breakdown-status"
                />
                <MiniPieChart
                    title={t('charts.by_form')}
                    data={controlsByForm}
                    colors={chartTheme.breakdown.form}
                    selectedKey={controlForm}
                    onSegmentSelect={(key) => setControlForm(isControlForm(key) && key !== controlForm ? key : null)}
                    testId="control-breakdown-form"
                />
                <MiniPieChart
                    title={t('charts.by_frequency')}
                    data={controlsByFrequency}
                    colors={chartTheme.breakdown.frequency}
                    testId="control-breakdown-frequency"
                />
            </div>
        </WidgetShell>
    );
}
