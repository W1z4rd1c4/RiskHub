/**
 * CategoryBreakdownCharts - Pie charts showing control breakdown by status, form, and frequency.
 * Uses theme-aware colors via useChartTheme hook.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from '@/i18n/hooks';
import { useDashboardFilters } from '../../contexts/DashboardFilterContext';
import { useChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from './chartTooltip';

interface CategoryBreakdownChartsProps {
    controlsByStatus: Record<string, number>;
    controlsByForm: Record<string, number>;
    controlsByFrequency: Record<string, number>;
}

function formatLabel(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

interface MiniPieChartProps {
    title: string;
    data: Record<string, number>;
    colors: Record<string, string>;
    onSegmentClick?: (key: string) => void;
}

function MiniPieChart({ title, data, colors, onSegmentClick }: MiniPieChartProps) {
    const { t } = useTranslation('dashboard');
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme, {
        contentStyle: {
            padding: '8px 12px',
        },
    });
    const chartData = Object.entries(data).map(([key, value]) => ({
        name: t(`charts.${key}`, formatLabel(key)),
        value,
        key,
    }));

    const total = chartData.reduce((sum, item) => sum + item.value, 0);

    if (total === 0) {
        return (
            <div className="flex flex-col items-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">{title}</h4>
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                    <span className="text-xs text-slate-600">{t('common:empty.no_data')}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">{title}</h4>
            <div className="w-44 h-44 relative">
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
                                    onSegmentClick?.(key);
                                }
                            }}
                            cursor={onSegmentClick ? 'pointer' : undefined}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={colors[entry.key] || chartTheme.series.neutral}
                                    className="transition-opacity hover:opacity-80"
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            {...tooltipProps}
                            formatter={(value, name) => {
                                const val = (value as number) ?? 0;
                                const label = (name as string) ?? '';
                                return [
                                    `${val} (${((val / total) * 100).toFixed(0)}%)`,
                                    label
                                ];
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-white">{total}</span>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-[160px]">
                {chartData.map((entry) => (
                    <button
                        key={entry.key}
                        onClick={() => onSegmentClick?.(entry.key)}
                        className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: colors[entry.key] || chartTheme.series.neutral }}
                        />
                        {entry.name}
                    </button>
                ))}
            </div>
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
    const { setControlStatus, setControlForm } = useDashboardFilters();

    return (
        <div className="grid grid-cols-3 gap-8">
            <MiniPieChart
                title={t('charts.by_status')}
                data={controlsByStatus}
                colors={chartTheme.breakdown.status}
                onSegmentClick={(key) => setControlStatus(key)}
            />
            <MiniPieChart
                title={t('charts.by_form')}
                data={controlsByForm}
                colors={chartTheme.breakdown.form}
                onSegmentClick={(key) => setControlForm(key)}
            />
            <MiniPieChart
                title={t('charts.by_frequency')}
                data={controlsByFrequency}
                colors={chartTheme.breakdown.frequency}
            />
        </div>
    );
}
