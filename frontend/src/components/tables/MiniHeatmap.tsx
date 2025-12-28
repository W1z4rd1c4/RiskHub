import { useMemo } from 'react';
import type { RiskSummary } from '@/types/risk';

interface MiniHeatmapProps {
    risks: RiskSummary[];
}

/**
 * A compact 5x5 heatmap showing risk distribution.
 */
export function MiniHeatmap({ risks }: MiniHeatmapProps) {
    // Generate 5x5 matrix of counts
    const matrix = useMemo(() => {
        const m = Array(5).fill(0).map(() => Array(5).fill(0));
        risks.forEach(r => {
            // Impact is X (1-5), Probability is Y (1-5)
            // Array indices are 0-4
            const x = Math.min(Math.max(r.gross_impact - 1, 0), 4);
            const y = Math.min(Math.max(r.gross_probability - 1, 0), 4);
            m[y][x]++;
        });
        return m;
    }, [risks]);

    const getCellColor = (p: number, i: number, count: number) => {
        if (count === 0) return 'bg-white/5';

        const score = p * i;
        if (score >= 16) return 'bg-rose-500/60';
        if (score >= 10) return 'bg-orange-500/60';
        if (score >= 5) return 'bg-amber-500/60';
        return 'bg-emerald-500/60';
    };

    return (
        <div className="flex flex-col gap-1 p-2 glass rounded-lg border border-white/5 w-fit">
            <div className="flex flex-col-reverse gap-0.5">
                {[1, 2, 3, 4, 5].map((p) => (
                    <div key={p} className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => {
                            const count = matrix[p - 1][i - 1];
                            return (
                                <div
                                    key={`${p}-${i}`}
                                    className={`
                                        w-4 h-4 rounded-[1px] flex items-center justify-center 
                                        ${getCellColor(p, i, count)}
                                        transition-all duration-300
                                    `}
                                    title={`P:${p} × I:${i} = ${p * i} (${count} items)`}
                                >
                                    {count > 0 && (
                                        <span className="text-[7px] font-black text-white leading-none">
                                            {count}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            <p className="text-[6px] text-slate-500 font-bold uppercase tracking-wider text-center mt-0.5">
                Inherited Risk Heatmap
            </p>
        </div>
    );
}
