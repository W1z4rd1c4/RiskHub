import { motion } from 'framer-motion';
import type { RiskDistributionItem } from '../../types/dashboard';

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
    const getCountForCell = (p: number, i: number) => {
        const item = distribution.find(d => d.probability === p && d.impact === i);
        return item ? item.count : 0;
    };

    const getCellColor = (p: number, i: number) => {
        const score = p * i;
        const count = getCountForCell(p, i);
        if (count === 0) return 'bg-white/[0.02] opacity-20';

        if (score >= 16) return 'bg-rose-500/40 hover:bg-rose-500/60';
        if (score >= 10) return 'bg-orange-500/40 hover:bg-orange-500/60';
        if (score >= 5) return 'bg-amber-500/40 hover:bg-amber-500/60';
        return 'bg-emerald-500/40 hover:bg-emerald-500/60';
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
                        Probability
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
                                        aria-label={isClickable ? `View ${count} risks at probability ${p}, impact ${i}` : undefined}
                                        className={`
                                            w-16 h-16 ${getCellColor(p, i)}
                                            rounded-xl flex flex-col items-center justify-center
                                            transition-all duration-300 m-1.5 glass-card
                                            ${count > 0 ? 'scale-100 opacity-100 shadow-lg shadow-black/20' : 'scale-95'}
                                            ${isClickable ? 'cursor-pointer focus:ring-2 focus:ring-accent focus:outline-none' : ''}
                                        `}
                                        title={`P:${p} × I:${i} | ${count} Risks${isClickable ? ' - Click to view' : ''}`}
                                        whileHover={isClickable ? { scale: 1.08, y: -3 } : undefined}
                                        whileTap={isClickable ? { scale: 0.95 } : undefined}
                                    >
                                        {count > 0 && (
                                            <>
                                                <span className="text-white font-black text-2xl leading-none">{count}</span>
                                                <span className="text-[9px] text-white/70 font-bold uppercase mt-1">Risks</span>
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
                Impact
            </span>

            {/* Legend */}
            <div className="flex gap-4 mt-8">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500/40" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Low</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-amber-500/40" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Med</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-orange-500/40" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">High</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-rose-500/40" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Critical</span>
                </div>
            </div>

        </div>
    );
}
