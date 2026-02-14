import { motion } from 'framer-motion';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';

interface RiskScoreMatrixProps {
    probability: number;  // 1-5
    impact: number;       // 1-5
    type: 'gross' | 'net';
    size?: 'small' | 'medium' | 'large';
    onSelect?: (probability: number, impact: number) => void;
    // Optional threshold overrides (uses Risk Hub config if not provided)
    thresholds?: {
        critical?: number;
        high?: number;
        medium?: number;
    };
}

/**
 * Visual 5×5 risk matrix showing probability vs impact.
 * Highlights the cell corresponding to the risk position.
 * Uses configurable thresholds from Risk Hub.
 */
export function RiskScoreMatrix({
    probability,
    impact,
    type,
    size = 'medium',
    onSelect,
    thresholds: overrideThresholds
}: RiskScoreMatrixProps) {
    const { t } = useTranslation('risks');
    const score = probability * impact;

    // Get thresholds from Risk Hub config (with optional overrides)
    const { thresholds: configThresholds } = useRiskThresholds();
    const thresholds = {
        critical: overrideThresholds?.critical ?? configThresholds.critical,
        high: overrideThresholds?.high ?? configThresholds.high,
        medium: overrideThresholds?.medium ?? configThresholds.medium,
    };

    // Cell colors based on score (probability × impact at that position)
    const getCellColor = (p: number, i: number) => {
        const cellScore = p * i;
        if (cellScore >= thresholds.critical) return 'bg-rose-500/40 hover:bg-rose-500/60';
        if (cellScore >= thresholds.high) return 'bg-orange-500/40 hover:bg-orange-500/60';
        if (cellScore >= thresholds.medium) return 'bg-amber-500/40 hover:bg-amber-500/60';
        return 'bg-emerald-500/40 hover:bg-emerald-500/60';
    };

    // Get score badge color (background + text)
    const getScoreColorClass = (s: number) => {
        if (s >= thresholds.critical) return 'bg-rose-500/20 text-rose-400';
        if (s >= thresholds.high) return 'bg-orange-500/20 text-orange-400';
        if (s >= thresholds.medium) return 'bg-amber-500/20 text-amber-400';
        return 'bg-emerald-500/20 text-emerald-400';
    };

    // Get text-only color class based on score (for title)
    const getTitleColorClass = (s: number) => {
        if (s >= thresholds.critical) return 'text-rose-400';
        if (s >= thresholds.high) return 'text-orange-400';
        if (s >= thresholds.medium) return 'text-amber-400';
        return 'text-emerald-400';
    };

    // Highlighted cell border
    const isSelected = (p: number, i: number) => p === probability && i === impact;

    // Size classes
    const sizeClasses = {
        small: { cell: 'w-8 h-8 text-[10px]', label: 'text-[10px]' },
        medium: { cell: 'w-10 h-10 text-xs', label: 'text-xs' },
        large: { cell: 'w-12 h-12 text-sm', label: 'text-sm' },
    };

    const { cell: cellClass, label: labelClass } = sizeClasses[size];

    return (
        <div className="flex flex-col items-center">
            {/* Type label - color matches score threshold */}
            <div className={`${labelClass} font-black uppercase tracking-widest mb-3 ${getTitleColorClass(score)}`}>
                {type === 'gross' ? t('matrix.gross_risk') : t('matrix.net_risk')}
            </div>

            <div className="flex gap-1">
                {/* Y-axis label */}
                <div className="flex flex-col items-center justify-center mr-1">
                    <span className={`${labelClass} text-slate-500 font-bold -rotate-90 whitespace-nowrap`}>
                        {t('matrix.probability_axis')}
                    </span>
                </div>

                {/* Matrix grid */}
                <div className="flex flex-col-reverse">
                    {[1, 2, 3, 4, 5].map((p) => (
                        <div key={p} className="flex">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <motion.div
                                    key={`${p}-${i}`}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: (p + i) * 0.02 }}
                                    className={`
                                        ${cellClass} ${getCellColor(p, i)}
                                        rounded-sm flex items-center justify-center font-bold
                                        transition-all duration-200 m-0.5
                                        ${onSelect ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}
                                        ${isSelected(p, i)
                                            ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110 z-10'
                                            : 'opacity-60'
                                        }
                                    `}
                                    onClick={() => onSelect?.(p, i)}
                                    title={t('matrix.cell_title', { probability: p, impact: i, score: p * i })}
                                >
                                    {isSelected(p, i) && (
                                        <span className="text-white font-black">{p * i}</span>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* X-axis label */}
            <span className={`${labelClass} text-slate-500 font-bold mt-2`}>
                {t('matrix.impact_axis')}
            </span>

            {/* Score display */}
            <div className={`mt-3 px-4 py-1.5 rounded-full font-black text-sm ${getScoreColorClass(score)}`}>
                {t('matrix.score_label', { score })}
            </div>
        </div>
    );
}
