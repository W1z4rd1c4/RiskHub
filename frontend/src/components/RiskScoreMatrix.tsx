import { motion } from 'framer-motion';

interface RiskScoreMatrixProps {
    probability: number;  // 1-5
    impact: number;       // 1-5
    type: 'gross' | 'net';
    size?: 'small' | 'medium' | 'large';
}

/**
 * Visual 5×5 risk matrix showing probability vs impact.
 * Highlights the cell corresponding to the risk position.
 */
export function RiskScoreMatrix({
    probability,
    impact,
    type,
    size = 'medium'
}: RiskScoreMatrixProps) {
    const score = probability * impact;

    // Cell colors based on score (probability × impact at that position)
    const getCellColor = (p: number, i: number) => {
        const cellScore = p * i;
        if (cellScore >= 16) return 'bg-rose-500/40 hover:bg-rose-500/60';
        if (cellScore >= 10) return 'bg-orange-500/40 hover:bg-orange-500/60';
        if (cellScore >= 5) return 'bg-amber-500/40 hover:bg-amber-500/60';
        return 'bg-emerald-500/40 hover:bg-emerald-500/60';
    };

    // Highlighted cell border
    const isSelected = (p: number, i: number) => p === probability && i === impact;

    // Size classes
    const sizeClasses = {
        small: { cell: 'w-6 h-6 text-[8px]', label: 'text-[8px]' },
        medium: { cell: 'w-8 h-8 text-[10px]', label: 'text-[10px]' },
        large: { cell: 'w-10 h-10 text-xs', label: 'text-xs' },
    };

    const { cell: cellClass, label: labelClass } = sizeClasses[size];

    return (
        <div className="flex flex-col items-center">
            {/* Type label */}
            <div className={`${labelClass} font-black uppercase tracking-widest mb-3 ${type === 'gross' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                {type === 'gross' ? 'Gross Risk' : 'Net Risk'}
            </div>

            <div className="flex gap-1">
                {/* Y-axis label */}
                <div className="flex flex-col items-center justify-center mr-1">
                    <span className={`${labelClass} text-slate-500 font-bold -rotate-90 whitespace-nowrap`}>
                        Probability
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
                                        transition-all duration-200 cursor-default m-0.5
                                        ${isSelected(p, i)
                                            ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110 z-10'
                                            : 'opacity-60'
                                        }
                                    `}
                                    title={`P:${p} × I:${i} = ${p * i}`}
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
                Impact
            </span>

            {/* Score display */}
            <div className={`mt-3 px-4 py-1.5 rounded-full font-black text-sm ${score >= 16 ? 'bg-rose-500/20 text-rose-400' :
                    score >= 10 ? 'bg-orange-500/20 text-orange-400' :
                        score >= 5 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                }`}>
                Score: {score}
            </div>
        </div>
    );
}
