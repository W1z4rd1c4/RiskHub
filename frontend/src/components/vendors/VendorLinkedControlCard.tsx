import { motion } from 'framer-motion';

import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useTranslation } from '@/i18n/hooks';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import type { LinkedControl } from '@/types/vendorLink';

interface VendorLinkedControlCardProps {
    control: LinkedControl;
    onClick?: () => void;
}

export function VendorLinkedControlCard({ control, onClick }: VendorLinkedControlCardProps) {
    const { t } = useTranslation(['controls', 'common']);
    const controlName = control.name || t('common:fallbacks.unknown_control');
    const frequency = control.frequency || '—';
    const riskLevel = control.risk_level || 0;
    const maxRiskLevel = 5;
    const monitoring = getControlMonitoringMeta(control.monitoring_status);
    const MonitoringIcon = monitoring.icon;

    const calculatePercent = (value: number) => Math.max(0, Math.min(100, (value / maxRiskLevel) * 100));
    const valuePct = calculatePercent(riskLevel);
    const gaugeToneClass = monitoring.gaugeClassName.split(' ')[0].replace(/^bg-/, 'text-');

    return (
        <motion.button
            type="button"
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="glass-card p-5 cursor-pointer group flex flex-col h-full text-left"
        >
            <div className="flex justify-between items-start mb-4 gap-4">
                <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm leading-tight mb-1 group-hover:text-accent transition-colors truncate" title={controlName}>
                        {controlName}
                    </h4>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                        {t('detail.control_badge', { ns: 'controls' })}
                    </span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wide shrink-0 ${monitoring.badgeClassName}`}>
                    <MonitoringIcon className="h-4 w-4" />
                    {t(monitoring.labelKey)}
                </div>
            </div>

            <div className="space-y-4 mt-auto">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="text-2xl font-black text-white flex items-baseline gap-2">
                            {riskLevel}
                            <span className="text-xs text-slate-300 font-bold">/ {maxRiskLevel}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            {t('common:labels.frequency')}: {frequency}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                            {control.department_name || t('common:fallbacks.not_available')}
                        </p>
                    </div>
                </div>

                <MetricGaugeSvg
                    valuePct={valuePct}
                    pointerClassName={`${gaugeToneClass} fill-current`}
                    zones={[{ startPct: 0, endPct: valuePct, className: `${gaugeToneClass}/20` }]}
                />

                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                    <span>{t('detail.level_min', { ns: 'controls' })}</span>
                    <span>{t('detail.level_max', { ns: 'controls' })}</span>
                </div>
            </div>
        </motion.button>
    );
}
