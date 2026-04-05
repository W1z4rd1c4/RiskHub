import { motion } from 'framer-motion';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { cn } from '@/lib/utils';
import type { RiskDistributionItem } from '../../types/dashboard';
import { useTranslation } from '@/i18n/hooks';
import { useStatusTheme } from '@/hooks/useStatusTheme';

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
    const statusTheme = useStatusTheme();

    const getCountForCell = (p: number, i: number) => {
        const item = distribution.find(d => d.probability === p && d.impact === i);
        return item ? item.count : 0;
    };

    const getCellClasses = (p: number, i: number): string => {
        const score = p * i;
        const count = getCountForCell(p, i);
        if (count === 0) {
            return `${statusTheme.matrix.emptyCell} opacity-20`;
        }
        if (score >= 16) return statusTheme.matrix.critical;
        if (score >= 10) return statusTheme.matrix.high;
        if (score >= 5) return statusTheme.matrix.medium;
        return statusTheme.matrix.low;
    };

    const handleCellClick = (p: number, i: number) => {
        const count = getCountForCell(p, i);
        if (count > 0 && onCellClick) {
            onCellClick(p, i);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, p: number, i: number) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCellClick(p, i);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <div className="flex gap-2">
                {/* Y-axis label */}
                <div className="flex flex-col items-center justify-center mr-2">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] -rotate-90 whitespace-nowrap">
                        {t('risk_distribution_matrix.axis.probability')}
                    </span>
                </div>

                <div className="flex flex-col-reverse">
                    {[1, 2, 3, 4, 5].map((p) => (
                        <div key={p} className="flex">
                            {[1, 2, 3, 4, 5].map((i) => {
                                const count = getCountForCell(p, i);
                                const isClickable = count > 0 && !!onCellClick;
                                return (
                                    <motion.div
                                        key={`${p}-${i}`}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: (p + i) * 0.02 }}
                                        onClick={() => handleCellClick(p, i)}
                                        onKeyDown={(e) => handleKeyDown(e, p, i)}
                                        tabIndex={isClickable ? 0 : -1}
                                        role={isClickable ? 'button' : undefined}
                                        aria-label={isClickable ? t('risk_distribution_matrix.cell_aria', { count, probability: p, impact: i }) : undefined}
                                        className={cn(
                                            'm-1.5 flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-white/10 backdrop-blur-xl transition-all duration-300',
                                            getCellClasses(p, i),
                                            count > 0 ? 'scale-100 shadow-lg shadow-black/20' : 'scale-95',
                                            isClickable && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent hover:opacity-80',
                                        )}
                                        title={`${t('risk_distribution_matrix.cell_title', { probability: p, impact: i, count })}${isClickable ? t('risk_distribution_matrix.click_to_view') : ''}`}
                                        whileHover={isClickable ? { scale: 1.08, y: -3 } : undefined}
                                        whileTap={isClickable ? { scale: 0.95 } : undefined}
                                    >
                                        {count > 0 && (
                                            <>
                                                <span className="text-white font-black text-2xl leading-none">{count}</span>
                                                <span className="text-[9px] text-white/70 font-bold uppercase mt-1">{t('risk_distribution_matrix.risks')}</span>
                                            </>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* X-axis label */}
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-4">
                {t('risk_distribution_matrix.axis.impact')}
            </span>

            {/* Legend */}
            <div className="flex gap-4 mt-8">
                <div className="flex items-center gap-2">
                    <ColorSwatch className="h-3 w-3" toneClassName={`${statusTheme.matrix.low.replace(/^bg-/, 'text-')} fill-current`} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('issues.severity.low')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <ColorSwatch className="h-3 w-3" toneClassName={`${statusTheme.matrix.medium.replace(/^bg-/, 'text-')} fill-current`} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('issues.severity.medium')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <ColorSwatch className="h-3 w-3" toneClassName={`${statusTheme.matrix.high.replace(/^bg-/, 'text-')} fill-current`} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('issues.severity.high')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <ColorSwatch className="h-3 w-3" toneClassName={`${statusTheme.matrix.critical.replace(/^bg-/, 'text-')} fill-current`} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('issues.severity.critical')}</span>
                </div>
            </div>

        </div>
    );
}
