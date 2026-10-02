import type * as React from 'react';
import type { RiskControlLink } from '@/types/risk';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useTranslation } from '@/i18n/hooks';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { cn } from '@/lib/utils';
import { formatControlFrequency } from '@/pages/controls/controlsPagePresentation';

interface ControlGaugeCardProps {
    link: RiskControlLink;
    onClick?: () => void;
    /** Lifecycle marker (draft / archived) shown on the card instead of dimming it (GAP-D-14). */
    statusBadge?: React.ReactNode;
}

export function ControlGaugeCard({ link, onClick, statusBadge }: ControlGaugeCardProps) {
    const { t } = useTranslation(['controls', 'common']);
    const {
        control,
        notes
    } = link;

    const controlName = control?.name || t('common:fallbacks.unknown_control');
    // PG-03: translated frequency (no raw enum).
    const frequency = control?.frequency
        ? formatControlFrequency(control.frequency, (key, fallback) => t(key, { defaultValue: fallback }))
        : '—';
    const riskLevel = control?.risk_level || 0;
    const maxRiskLevel = 5;
    const monitoring = getControlMonitoringMeta(control?.monitoring_status);
    const MonitoringIcon = monitoring.icon;

    // Calculate percentage for gauge (1-5 scale)
    const calculatePercent = (val: number) => {
        return Math.max(0, Math.min(100, (val / maxRiskLevel) * 100));
    };

    const valuePct = calculatePercent(riskLevel);
    return (
        // The whole card is one action (Card as="button", §4.10); the hover lift is CSS so it
        // honours prefers-reduced-motion.
        <Card
            as="button"
            padding="compact"
            interactive
            onClick={onClick}
            className="group flex h-full flex-col p-5 motion-safe:hover:-translate-y-1"
        >
            <div className="flex justify-between items-start mb-4 gap-4">
                <div className="flex-1 min-w-0">
                    <h4 className="text-foreground font-bold text-sm leading-tight mb-1 group-hover:text-accent-text transition-colors truncate" title={controlName}>
                        {controlName}
                    </h4>
                    <span className="flex flex-wrap items-center gap-2">
                        {/* D6: metadata is body text (12px); `text-eyebrow` (11px) is for eyebrow labels only. */}
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('detail.control_badge', { ns: 'controls' })}
                        </span>
                        {statusBadge}
                    </span>
                </div>
                <Badge icon={MonitoringIcon} className={cn('shrink-0 uppercase tracking-wide', monitoring.badgeClassName)}>
                    {t(monitoring.labelKey)}
                </Badge>
            </div>

            <div className="space-y-4 mt-auto">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground flex items-baseline gap-2">
                            {riskLevel}
                            <span className="text-xs text-muted-foreground font-bold">/ {maxRiskLevel}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('common:labels.label_value', { label: t('common:labels.frequency'), value: frequency })}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('common:labels.label_value', {
                                label: t('form.labels.effectiveness', { ns: 'controls' }),
                                value: t(`form.effectiveness.${link.effectiveness}`, { ns: 'controls' }),
                            })}
                        </p>
                    </div>
                </div>

                {/* Gauge Visualization */}
                <MetricGaugeSvg
                    valuePct={valuePct}
                    pointerClassName={`${monitoring.gaugeToneClassName} fill-current`}
                    zones={[{ startPct: 0, endPct: valuePct, className: monitoring.gaugeZoneClassName }]}
                />

                <div className="flex justify-between text-xs font-bold uppercase tracking-tighter text-muted-foreground">
                    <span>{t('detail.level_min', { ns: 'controls' })}</span>
                    <span>{t('detail.level_max', { ns: 'controls' })}</span>
                </div>

                {notes && (
                    <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground font-medium italic line-clamp-2">
                            "{notes}"
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
}
