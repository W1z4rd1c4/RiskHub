import { motion } from 'framer-motion';
import { Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { RiskControlLink } from '@/types/risk';
import { useTranslation } from '@/i18n/hooks';
import { useStatusTheme } from '@/hooks/useStatusTheme';

interface ControlGaugeCardProps {
    link: RiskControlLink;
    onClick?: () => void;
}

export function ControlGaugeCard({ link, onClick }: ControlGaugeCardProps) {
    const { t } = useTranslation(['controls', 'common']);
    const statusTheme = useStatusTheme();
    const {
        effectiveness,
        control,
        notes
    } = link;

    const controlName = control?.name || t('common:fallbacks.unknown_control');
    const frequency = control?.frequency || '—';
    const riskLevel = control?.risk_level || 0;
    const maxRiskLevel = 5;

    const getStatusColor = () => {
        switch (effectiveness) {
            case 'high': return statusTheme.control.highText;
            case 'medium': return statusTheme.control.mediumText;
            case 'low': return statusTheme.control.lowText;
            default: return statusTheme.control.neutralText;
        }
    };

    const getBarColor = () => {
        switch (effectiveness) {
            case 'high': return statusTheme.control.highGauge;
            case 'medium': return statusTheme.control.mediumGauge;
            case 'low': return statusTheme.control.lowGauge;
            default: return statusTheme.control.neutralGauge;
        }
    };

    const getStatusIcon = () => {
        switch (effectiveness) {
            case 'high': return <ShieldCheck className="h-4 w-4" />;
            case 'medium': return <Info className="h-4 w-4" />;
            case 'low': return <AlertTriangle className="h-4 w-4" />;
            default: return <Info className="h-4 w-4" />;
        }
    };

    const getEffectivenessLabel = () => {
        switch (effectiveness) {
            case 'high': return t('detail.effectiveness_optimal', { ns: 'controls' });
            case 'medium': return t('detail.effectiveness_effective', { ns: 'controls' });
            case 'low': return t('detail.effectiveness_ineffective', { ns: 'controls' });
            default: return (effectiveness as string).toUpperCase();
        }
    };

    // Calculate percentage for gauge (1-5 scale)
    const calculatePercent = (val: number) => {
        return Math.max(0, Math.min(100, (val / maxRiskLevel) * 100));
    };

    const valuePct = calculatePercent(riskLevel);

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
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/20 font-bold text-[10px] uppercase tracking-wide shrink-0 ${getStatusColor()}`}>
                    {getStatusIcon()}
                    {getEffectivenessLabel()}
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
                    </div>
                </div>

                {/* Gauge Visualization */}
                <div className="relative h-8 flex items-center">
                    {/* Background track */}
                    <div className="absolute inset-x-0 h-2 bg-white/5 rounded-full overflow-hidden" />

                    {/* Progress track (styled like KRI gauge) */}
                    <div
                        className={`absolute h-2 rounded-full opacity-20 ${getBarColor().split(' ')[0]}`}
                        style={{ left: '0%', width: `${valuePct}%` }}
                    />

                    {/* Current Value Pointer */}
                    <motion.div
                        initial={{ left: 0 }}
                        animate={{ left: `${valuePct}%` }}
                        transition={{ type: "spring", stiffness: 100 }}
                        className={`absolute w-3 h-3 rounded-full border-2 border-slate-900 z-10 -ml-1.5 ${getBarColor()}`}
                    />
                </div>

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
