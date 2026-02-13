/**
 * CategoryBreakdownCharts - Pie charts showing control breakdown by status, form, and frequency.
 * Uses theme-aware colors via useChartTheme hook.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from '@/i18n/hooks';
import { useDashboardFilters } from '../../contexts/DashboardFilterContext';
import { useChartTheme } from '@/hooks/useChartTheme';

interface CategoryBreakdownChartsProps {
    controlsByStatus: Record<string, number>;
    controlsByForm: Record<string, number>;
    controlsByFrequency: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
    active: '#10b981',      // emerald-500
    inactive: '#6b7280',    // gray-500
    pending: '#f59e0b',     // amber-500
    deprecated: '#ef4444',  // rose-500
};

const FORM_COLORS: Record<string, string> = {
    preventive: '#3b82f6',  // blue-500
    detective: '#8b5cf6',   // purple-500
    corrective: '#f97316',  // orange-500
};

const FREQUENCY_COLORS: Record<string, string> = {
    daily: '#0d9488',       // teal-600
    weekly: '#14b8a6',      // teal-500
    monthly: '#2dd4bf',     // teal-400
    quarterly: '#5eead4',   // teal-300
    'semi-annually': '#67e8f9', // cyan-300
    annually: '#99f6e4',    // teal-200
    ad_hoc: '#6b7280',      // gray-500
    continuous: '#06b6d4',  // cyan-500
};

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
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                            dataKey="value"
                            onClick={(entry) => onSegmentClick?.(entry.key)}
                            cursor={onSegmentClick ? 'pointer' : undefined}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={colors[entry.key] || '#6b7280'}
                                    className="transition-opacity hover:opacity-80"
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: chartTheme.tooltipBackground,
                                border: `1px solid ${chartTheme.tooltipBorder}`,
                                borderRadius: '8px',
                                backdropFilter: 'blur(8px)',
                                padding: '8px 12px',
                            }}
                            itemStyle={{ color: chartTheme.tooltipTextPrimary, fontSize: '12px' }}
                            labelStyle={{ color: chartTheme.tooltipTextSecondary, fontSize: '10px', fontWeight: 700 }}
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
                            style={{ backgroundColor: colors[entry.key] || '#6b7280' }}
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
    const { setControlStatus, setControlForm } = useDashboardFilters();

    return (
        <div className="grid grid-cols-3 gap-8">
            <MiniPieChart
                title={t('charts.by_status')}
                data={controlsByStatus}
                colors={STATUS_COLORS}
                onSegmentClick={(key) => setControlStatus(key)}
            />
            <MiniPieChart
                title={t('charts.by_form')}
                data={controlsByForm}
                colors={FORM_COLORS}
                onSegmentClick={(key) => setControlForm(key)}
            />
            <MiniPieChart
                title={t('charts.by_frequency')}
                data={controlsByFrequency}
                colors={FREQUENCY_COLORS}
            />
        </div>
    );
}
