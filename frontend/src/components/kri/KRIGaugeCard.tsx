import { motion } from 'framer-motion';
import type { KeyRiskIndicator, KRIMonitoringFields } from '@/types/kri';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useTranslation } from '@/i18n/hooks';
import { formatMetricNumberValue } from '@/i18n/formatters';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';

export type KRIGaugeCardKri = Pick<
    KeyRiskIndicator,
    'metric_name' | 'current_value' | 'lower_limit' | 'upper_limit' | 'unit'
> &
    KRIMonitoringFields;

interface KRIGaugeCardProps {
    kri: KRIGaugeCardKri;
    onClick?: () => void;
    isOverdue?: boolean;
    daysOverdue?: number;
}

export function KRIGaugeCard({ kri, onClick, isOverdue, daysOverdue }: KRIGaugeCardProps) {
    const { t, i18n } = useTranslation(['kris', 'common']);
    const {
        metric_name,
        current_value,
        lower_limit,
        upper_limit,
        unit,
    } = kri;
    const monitoring = getKriMonitoringMeta(kri.monitoring_status);
    const MonitoringIcon = monitoring.icon;
    const resolvedDaysOverdue = kri.days_overdue ?? daysOverdue ?? 0;
    const showDaysOverdue = kri.monitoring_status === 'not_submitted' || isOverdue;

    // Calculate position on 0-100 scale for visual gauge
    // We add some padding to the range to show context
    const range = upper_limit - lower_limit;
    const padding = range * 0.2;
    const displayMin = lower_limit - padding;
    const displayMax = upper_limit + padding;
    const displayRange = displayMax - displayMin;

    const calculatePercent = (val: number) => {
        const pct = ((val - displayMin) / displayRange) * 100;
        return Math.max(0, Math.min(100, pct));
    };

    // Format numbers with locale-aware separators and limited decimals
    const formatNumber = (val: number): string => {
        return formatMetricNumberValue(val, i18n.language);
    };

    const valuePct = calculatePercent(current_value);
    const lowerPct = calculatePercent(lower_limit);
    const upperPct = calculatePercent(upper_limit);
    const pointerToneClass = `${monitoring.gaugeToneClassName} fill-current`;

    return (
        <motion.button
            type="button"
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="glass-card interactive-card p-5 cursor-pointer group w-full text-left"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <h4 className="text-foreground font-bold text-sm leading-tight mb-1 group-hover:text-accent-text transition-colors">
                        {metric_name}
                    </h4>
                    <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                        {t('overview.metric_detail', { ns: 'kris' })}
                    </span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-bold text-xs uppercase tracking-wide ${monitoring.badgeClassName}`}>
                    <MonitoringIcon className="h-4 w-4" />
                    {t(monitoring.labelKey)}
                </div>
                {showDaysOverdue && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-warning/10 border border-warning/20 text-warning-text font-bold text-xs uppercase">
                        <MonitoringIcon className="h-3 w-3" />
                        {resolvedDaysOverdue > 0 ? `${resolvedDaysOverdue}d` : t('monitoring.not_submitted', { ns: 'kris' })}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-black text-foreground flex items-baseline gap-2">
                            {formatNumber(current_value)}
                            <span className="text-xs text-muted-foreground font-bold">{unit}</span>
                        </div>
                    </div>
                </div>

                {/* Gauge Visualization */}
                <MetricGaugeSvg
                    valuePct={valuePct}
                    pointerClassName={pointerToneClass}
                    zones={[{ startPct: lowerPct, endPct: upperPct, className: monitoring.gaugeZoneClassName }]}
                    markers={[
                        {
                            positionPct: lowerPct,
                            title: t('overview.lower_limit', { ns: 'kris', value: formatNumber(lower_limit) }),
                        },
                        {
                            positionPct: upperPct,
                            title: t('overview.upper_limit', { ns: 'kris', value: formatNumber(upper_limit) }),
                        },
                    ]}
                />

                <div className="flex justify-between text-xs font-bold uppercase tracking-tighter text-muted-foreground">
                    <span>{t('overview.min_value', { ns: 'kris', value: formatNumber(lower_limit), unit })}</span>
                    <span>{t('overview.max_value', { ns: 'kris', value: formatNumber(upper_limit), unit })}</span>
                </div>
            </div>
        </motion.button>
    );
}
