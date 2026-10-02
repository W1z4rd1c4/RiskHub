import type { KeyRiskIndicator, KRIMonitoringFields } from '@/types/kri';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { formatKriUnit } from '@/lib/kriUnits';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import { cn } from '@/lib/utils';

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
    const { t } = useTranslation(['kris', 'common']);
    const format = useFormat();
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
        return format.metric(val);
    };

    const valuePct = calculatePercent(current_value);
    const lowerPct = calculatePercent(lower_limit);
    const upperPct = calculatePercent(upper_limit);
    const pointerToneClass = `${monitoring.gaugeToneClassName} fill-current`;

    return (
        // The whole card is one action (Card as="button", §4.10); the hover lift is CSS so it
        // honours prefers-reduced-motion.
        <Card
            as="button"
            padding="compact"
            interactive
            onClick={onClick}
            className="group p-5 motion-safe:hover:-translate-y-1"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <span className="block text-foreground font-bold text-sm leading-tight mb-1 group-hover:text-accent-text transition-colors">
                        {metric_name}
                    </span>
                    <span className="text-eyebrow">
                        {t('overview.metric_detail', { ns: 'kris' })}
                    </span>
                </div>
                <Badge icon={MonitoringIcon} className={cn('shrink-0 uppercase tracking-wide', monitoring.badgeClassName)}>
                    {t(monitoring.labelKey)}
                </Badge>
                {showDaysOverdue && (
                    <Badge tone="warning" icon={MonitoringIcon} className="uppercase">
                        {resolvedDaysOverdue > 0
                            ? t('overdue.days_overdue', { ns: 'kris', count: resolvedDaysOverdue })
                            : t('monitoring.not_submitted', { ns: 'kris' })}
                    </Badge>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground flex items-baseline gap-2">
                            {formatNumber(current_value)}
                            <span className="text-xs text-muted-foreground font-bold">{formatKriUnit(unit, t, current_value)}</span>
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
                    <span>{t('overview.min_value', { ns: 'kris', value: formatNumber(lower_limit), unit: formatKriUnit(unit, t, lower_limit) })}</span>
                    <span>{t('overview.max_value', { ns: 'kris', value: formatNumber(upper_limit), unit: formatKriUnit(unit, t, upper_limit) })}</span>
                </div>
            </div>
        </Card>
    );
}
