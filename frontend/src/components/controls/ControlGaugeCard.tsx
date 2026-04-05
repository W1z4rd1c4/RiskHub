import { motion } from 'framer-motion';
import type { RiskControlLink } from '@/types/risk';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import { useTranslation } from '@/i18n/hooks';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';

interface ControlGaugeCardProps {
    link: RiskControlLink;
    onClick?: () => void;
}

export function ControlGaugeCard({ link, onClick }: ControlGaugeCardProps) {
    const { t } = useTranslation(['controls', 'common']);
    const {
        control,
        notes
    } = link;

    const controlName = control?.name || t('common:fallbacks.unknown_control');
    const frequency = control?.frequency || '—';
    const riskLevel = control?.risk_level || 0;
    const maxRiskLevel = 5;
    const monitoring = getControlMonitoringMeta(control?.monitoring_status);
    const MonitoringIcon = monitoring.icon;

    // Calculate percentage for gauge (1-5 scale)
    const calculatePercent = (val: number) => {
        return Math.max(0, Math.min(100, (val / maxRiskLevel) * 100));
    };

    const valuePct = calculatePercent(riskLevel);
    const gaugeToneClass = monitoring.gaugeClassName.split(' ')[0].replace(/^bg-/, 'text-');

    return (
        <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="glass-card p-5 cursor-pointer group flex flex-col h-full"
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
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-black text-white flex items-baseline gap-2">
                            {riskLevel}
                            <span className="text-xs text-slate-300 font-bold">/ {maxRiskLevel}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            {t('common:labels.frequency')}: {frequency}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                            {t('form.labels.effectiveness', { ns: 'controls' })}: {t(`form.effectiveness.${link.effectiveness}`, { ns: 'controls' })}
                        </p>
                    </div>
                </div>

                {/* Gauge Visualization */}
                <MetricGaugeSvg
                    valuePct={valuePct}
                    pointerClassName={`${gaugeToneClass} fill-current`}
                    zones={[{ startPct: 0, endPct: valuePct, className: `${gaugeToneClass}/20` }]}
                />

                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                    <span>{t('detail.level_min', { ns: 'controls' })}</span>
                    <span>{t('detail.level_max', { ns: 'controls' })}</span>
                </div>

                {notes && (
                    <div className="pt-2 border-t border-white/5">
                        <p className="text-[10px] text-slate-300 font-medium italic line-clamp-2">
                            "{notes}"
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
