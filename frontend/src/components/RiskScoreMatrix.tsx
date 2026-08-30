import { motion } from 'framer-motion';
import { useId } from 'react';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import { riskScoreVariantClass } from '@/lib/riskScoreTheme';

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
    const matrixName = `risk-score-${type}-${useId()}`;
    const score = probability * impact;

    // Get thresholds from Risk Hub config (with optional overrides)
    const { thresholds: configThresholds } = useRiskThresholds();
    const thresholds = {
        critical: overrideThresholds?.critical ?? configThresholds.critical,
        high: overrideThresholds?.high ?? configThresholds.high,
        medium: overrideThresholds?.medium ?? configThresholds.medium,
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

    const matrixLabel = type === 'gross' ? t('matrix.gross_risk') : t('matrix.net_risk');

    return (
        <fieldset className="m-0 flex min-w-0 flex-col items-center border-0 p-0">
            {/* Type label - color matches score threshold */}
            <legend className={`${labelClass} mx-auto mb-3 w-auto p-0 font-black uppercase tracking-widest ${riskScoreVariantClass('text', score, thresholds)}`}>
                {matrixLabel}
            </legend>

            <div className="flex gap-1">
                {/* Y-axis label */}
                <div className="flex flex-col items-center justify-center mr-1">
                    <span className={`${labelClass} text-muted-foreground font-bold -rotate-90 whitespace-nowrap`}>
                        {t('matrix.probability_axis')}
                    </span>
                </div>

                {/* Matrix grid */}
                <div className="flex flex-col-reverse">
                    {[1, 2, 3, 4, 5].map((p) => (
                        <div key={p} className="flex">
                            {[1, 2, 3, 4, 5].map((i) => {
                                const cellScore = p * i;
                                const selected = isSelected(p, i);
                                const cellTitle = t('matrix.cell_title', { probability: p, impact: i, score: cellScore });
                                const cellClasses = `
                                    ${cellClass} ${riskScoreVariantClass('matrix-cell', cellScore, thresholds)}
                                    rounded-sm flex items-center justify-center font-bold
                                    transition-[background-color,border-color,box-shadow,transform] duration-200
                                    ${selected
                                        ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110 z-10'
                                        : 'opacity-60'
                                    }
                                `;
                                const selectedScore = selected
                                    ? <span className="text-foreground font-black">{cellScore}</span>
                                    : null;
                                const visualCell = (
                                    <motion.span
                                        key={`${p}-${i}`}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: (p + i) * 0.02 }}
                                        className={`${cellClasses} ${onSelect
                                            ? 'hover:scale-105 active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background'
                                            : 'm-0.5'
                                        }`}
                                        title={onSelect ? cellTitle : undefined}
                                    >
                                        {selectedScore}
                                    </motion.span>
                                );

                                if (!onSelect) {
                                    return visualCell;
                                }

                                return (
                                    <label key={`${p}-${i}`} className="relative m-0.5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name={matrixName}
                                            value={`${p}-${i}`}
                                            checked={selected}
                                            onChange={() => onSelect(p, i)}
                                            aria-label={t('matrix.choice_label', { probability: p, impact: i, score: cellScore })}
                                            className="peer sr-only"
                                        />
                                        {visualCell}
                                    </label>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* X-axis label */}
            <span className={`${labelClass} text-muted-foreground font-bold mt-2`}>
                {t('matrix.impact_axis')}
            </span>

            {/* Score display */}
            <div className={`mt-3 px-4 py-1.5 rounded-full font-black text-sm ${riskScoreVariantClass('card', score, thresholds)}`}>
                {t('matrix.score_label', { score })}
            </div>
        </fieldset>
    );
}
