import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RiskDistributionItem } from '../../types/dashboard';
import { useTranslation } from '@/i18n/hooks';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, SEVERITY_BANDS, severityClass } from '@/lib/severity';

interface RiskDistributionMatrixProps {
    distribution: RiskDistributionItem[];
    onCellClick?: (probability: number, impact: number) => void;
}

/**
 * Aggregated 5x5 risk heatmap for dashboard.
 * Shows COUNT of risks in each cell.
 * Cells with count > 0 are clickable for drill-down.
 */
export function RiskDistributionMatrix({ distribution, onCellClick }: RiskDistributionMatrixProps) {
    const { t } = useTranslation('dashboard');
    const { thresholds } = useRiskThresholds();

    const getCountForCell = (p: number, i: number) => {
        const item = distribution.find(d => d.probability === p && d.impact === i);
        return item ? item.count : 0;
    };

    const getCellClasses = (p: number, i: number): string => {
        const score = p * i;
        const count = getCountForCell(p, i);
        if (count === 0) {
            return 'bg-tint/[0.03] opacity-20';
        }
        return severityClass('matrix-cell', classifyRiskScore(score, thresholds));
    };

    const handleCellClick = (p: number, i: number) => {
        const count = getCountForCell(p, i);
        if (count > 0 && onCellClick) {
            onCellClick(p, i);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <div className="flex gap-2">
                {/* Y-axis label */}
                <div className="flex flex-col items-center justify-center mr-2">
                    <span className="text-eyebrow -rotate-90 whitespace-nowrap">
                        {t('risk_distribution_matrix.axis.probability')}
                    </span>
                </div>

                <div className="flex flex-col-reverse">
                    {[1, 2, 3, 4, 5].map((p) => (
                        <div key={p} className="flex">
                            {[1, 2, 3, 4, 5].map((i) => {
                                const count = getCountForCell(p, i);
                                const isClickable = count > 0 && !!onCellClick;
                                const level = t(`risk_levels.${classifyRiskScore(p * i, thresholds)}`);
                                const cellContent = count > 0 ? (
                                    <>
                                        <span className="font-heading text-2xl font-bold leading-none text-foreground">{count}</span>
                                        <span className="text-eyebrow text-foreground">{t('risk_distribution_matrix.risks', { count })}</span>
                                    </>
                                ) : null;
                                const cellClassName = cn(
                                    'flex h-16 w-16 flex-col items-center justify-center gap-1 whitespace-normal rounded-xl border border-border backdrop-blur-xl transition-[transform,opacity] duration-300',
                                    getCellClasses(p, i),
                                    count > 0 ? 'scale-100 shadow-md' : 'scale-95',
                                    isClickable && 'cursor-pointer focus-ring hover:opacity-80',
                                );
                                const cellTitle = `${t('risk_distribution_matrix.cell_title', { probability: p, impact: i, count, level })}${isClickable ? t('risk_distribution_matrix.click_to_view') : ''}`;

                                // The motion wrapper owns the entrance and hover/tap scale; a clickable
                                // cell is a <Button> without a variant because its fill is the data-driven
                                // severity heat colour (lib/severity), not an action tone.
                                return (
                                    <motion.div
                                        key={`${p}-${i}`}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: (p + i) * 0.02 }}
                                        whileHover={isClickable ? { scale: 1.08, y: -3 } : undefined}
                                        whileTap={isClickable ? { scale: 0.95 } : undefined}
                                        className="m-1.5"
                                    >
                                        {isClickable ? (
                                            <Button
                                                variant={null}
                                                size={null}
                                                onClick={() => handleCellClick(p, i)}
                                                aria-label={t('risk_distribution_matrix.cell_aria', { count, probability: p, impact: i, level })}
                                                className={cellClassName}
                                                title={cellTitle}
                                            >
                                                {cellContent}
                                            </Button>
                                        ) : (
                                            <div className={cellClassName} title={cellTitle}>
                                                {cellContent}
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* X-axis label */}
            <span className="text-eyebrow mt-4">
                {t('risk_distribution_matrix.axis.impact')}
            </span>

            {/* Legend (D1 bands, labelled with the risk-level keys) */}
            <ul className="mt-8 flex flex-wrap justify-center gap-4" aria-label={t('risk_distribution_matrix.legend')}>
                {SEVERITY_BANDS.map((band) => (
                    <li key={band} className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', severityClass('dot', band))} />
                        <span className="text-eyebrow">{t(`risk_levels.${band}`)}</span>
                    </li>
                ))}
            </ul>

        </div>
    );
}
