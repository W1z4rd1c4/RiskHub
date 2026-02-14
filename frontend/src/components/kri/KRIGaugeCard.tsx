import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, Clock } from 'lucide-react';
import type { KeyRiskIndicator } from '@/types/kri';
import { useTranslation } from '@/i18n/hooks';

interface KRIGaugeCardProps {
    kri: KeyRiskIndicator;
    onClick?: () => void;
    isOverdue?: boolean;
    daysOverdue?: number;
}

export function KRIGaugeCard({ kri, onClick, isOverdue, daysOverdue }: KRIGaugeCardProps) {
    const { t } = useTranslation(['kris', 'common']);
    const {
        metric_name,
        current_value,
        lower_limit,
        upper_limit,
        unit,
        breach_status
    } = kri;

    const isNearLimit = () => {
        const range = upper_limit - lower_limit;
        const distToLower = Math.abs(current_value - lower_limit);
        const distToUpper = Math.abs(current_value - upper_limit);
        return distToLower < range * 0.1 || distToUpper < range * 0.1;
    };

    const getStatusColor = () => {
        if (breach_status !== 'within') return 'text-rose-400';
        if (isNearLimit()) return 'text-amber-400';
        return 'text-emerald-400';
    };

    const getBarColor = () => {
        if (breach_status !== 'within') return 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]';
        if (isNearLimit()) return 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
        return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]';
    };

    const getStatusIcon = () => {
        if (breach_status !== 'within') return <AlertTriangle className="h-4 w-4" />;
        if (isNearLimit()) return <Info className="h-4 w-4" />;
        return <CheckCircle className="h-4 w-4" />;
    };

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
        if (val === 0) return '0';
        // For very small values (percentages), show 2 decimals
        if (Math.abs(val) < 1) {
            return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        // For values up to 100, show 1 decimal
        if (Math.abs(val) < 100) {
            return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        }
        // For larger values, no decimals
        return Math.round(val).toLocaleString('cs-CZ');
    };

    const valuePct = calculatePercent(current_value);
    const lowerPct = calculatePercent(lower_limit);
    const upperPct = calculatePercent(upper_limit);

    return (
        <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="glass-card p-5 cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <h4 className="text-white font-bold text-sm leading-tight mb-1 group-hover:text-accent transition-colors">
                        {metric_name}
                    </h4>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                        {t('overview.metric_detail', { ns: 'kris' })}
                    </span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/20 font-bold text-[10px] uppercase tracking-wide ${getStatusColor()}`}>
                    {getStatusIcon()}
                    {breach_status === 'within' ? t('overview.optimal', { ns: 'kris' }) : breach_status.toUpperCase()}
                </div>
                {isOverdue && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-[10px] uppercase">
                        <Clock className="h-3 w-3" />
                        {daysOverdue ? `${daysOverdue}d` : t('status.overdue', { ns: 'kris' })}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-2xl font-black text-white flex items-baseline gap-2">
                            {formatNumber(current_value)}
                            <span className="text-xs text-slate-300 font-bold">{unit}</span>
                        </div>
                    </div>
                </div>

                {/* Gauge Visualization */}
                <div className="relative h-8 flex items-center">
                    {/* Background track */}
                    <div className="absolute inset-x-0 h-2 bg-white/5 rounded-full overflow-hidden" />

                    {/* Tolerance Zone (Green area) */}
                    <div
                        className="absolute h-2 bg-emerald-500/20 rounded-full"
                        style={{
                            left: `${lowerPct}%`,
                            width: `${upperPct - lowerPct}%`
                        }}
                    />

                    {/* Limit Markers */}
                    <div
                        className="absolute w-0.5 h-4 bg-white/20"
                        style={{ left: `${lowerPct}%` }}
                        title={`Lower Limit: ${formatNumber(lower_limit)}`}
                    />
                    <div
                        className="absolute w-0.5 h-4 bg-white/20"
                        style={{ left: `${upperPct}%` }}
                        title={`Upper Limit: ${formatNumber(upper_limit)}`}
                    />

                    {/* Current Value Pointer */}
                    <motion.div
                        initial={{ left: 0 }}
                        animate={{ left: `${valuePct}%` }}
                        className={`absolute w-3 h-3 rounded-full border-2 border-slate-900 z-10 -ml-1.5 ${getBarColor()}`}
                    />
                </div>

                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                    <span>{formatNumber(lower_limit)} {unit} MIN</span>
                    <span>{formatNumber(upper_limit)} {unit} MAX</span>
                </div>
            </div>
        </motion.div>
    );
}
