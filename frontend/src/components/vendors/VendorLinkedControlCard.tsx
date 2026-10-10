import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useTranslation } from '@/i18n/hooks';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import type { LinkedControl } from '@/types/vendorLink';

interface VendorLinkedControlCardProps {
    control: LinkedControl;
    /** Card of the archived group: carries an Archived badge instead of a dimmed group (GAP-D-14). */
    archived?: boolean;
    onClick?: () => void;
}

/**
 * A linked control on the vendor page. The title button stretches over the
 * whole card (`after:inset-0`), so the card is one keyboard-reachable control
 * named by the control name, with the card's details as plain content.
 */
export function VendorLinkedControlCard({ control, archived = false, onClick }: VendorLinkedControlCardProps) {
    const { t } = useTranslation(['controls', 'common']);
    const controlName = control.name || t('common:fallbacks.unknown_control');
    const frequency = control.frequency
        ? t(`controls:frequencies.${control.frequency}`, { defaultValue: control.frequency })
        : '—';
    const riskLevel = control.risk_level || 0;
    const maxRiskLevel = 5;
    const monitoring = getControlMonitoringMeta(control.monitoring_status);
    const MonitoringIcon = monitoring.icon;

    const calculatePercent = (value: number) => Math.max(0, Math.min(100, (value / maxRiskLevel) * 100));
    const valuePct = calculatePercent(riskLevel);
    return (
        <Card as="article" padding="compact" interactive className="group relative flex h-full flex-col p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h3 className="mb-1 truncate text-sm font-bold leading-tight text-foreground" title={controlName}>
                        <Button
                            variant={null}
                            size={null}
                            onClick={onClick}
                            className="block h-auto max-w-full truncate p-0 text-left text-sm font-bold text-foreground after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-accent-text"
                        >
                            {controlName}
                        </Button>
                    </h3>
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="text-eyebrow">{t('detail.control_badge', { ns: 'controls' })}</span>
                        {archived ? <Badge size="sm" tone="neutral">{t('controls:status.archived')}</Badge> : null}
                    </span>
                </div>
                <Badge icon={MonitoringIcon} className={`shrink-0 ${monitoring.badgeClassName}`}>
                    {t(monitoring.labelKey)}
                </Badge>
            </div>

            <div className="mt-auto space-y-4">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="flex items-baseline gap-2 text-2xl font-bold tabular-nums text-foreground">
                            {riskLevel}
                            <span className="text-xs font-bold text-muted-foreground">/ {maxRiskLevel}</span>
                        </div>
                        <p className="text-eyebrow mt-1">
                            {t('common:labels.frequency')}: {frequency}
                        </p>
                        <p className="text-eyebrow mt-1">
                            {control.department_name || t('common:fallbacks.not_available')}
                        </p>
                    </div>
                </div>

                <MetricGaugeSvg
                    valuePct={valuePct}
                    pointerClassName={`${monitoring.gaugeToneClassName} fill-current`}
                    zones={[{ startPct: 0, endPct: valuePct, className: monitoring.gaugeZoneClassName }]}
                />

                <div className="flex justify-between text-xs font-bold uppercase tracking-tight text-muted-foreground">
                    <span>{t('detail.level_min', { ns: 'controls' })}</span>
                    <span>{t('detail.level_max', { ns: 'controls' })}</span>
                </div>
            </div>
        </Card>
    );
}
