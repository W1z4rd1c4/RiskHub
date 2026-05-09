import { useMemo } from 'react';
import type { RiskSummary } from '@/types/risk';
import { useTranslation } from '@/i18n/hooks';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, type RiskScoreBand } from '@/lib/riskScoreTheme';

const HEATMAP_AXIS = [1, 2, 3, 4, 5] as const;
const CELL_COLOR_BY_BAND: Record<RiskScoreBand, string> = {
    critical: 'bg-rose-500/60',
    high: 'bg-orange-500/60',
    medium: 'bg-amber-500/60',
    low: 'bg-emerald-500/60',
};

interface MiniHeatmapProps {
    risks: RiskSummary[];
}

/**
 * A compact 5x5 heatmap showing risk distribution.
 */
export function MiniHeatmap({ risks }: MiniHeatmapProps) {
    const { t } = useTranslation('common');
    const { thresholds } = useRiskThresholds();
    // Generate 5x5 matrix of counts
    const matrix = useMemo<number[][]>(() => {
        const grid = Array.from({ length: HEATMAP_AXIS.length }, () =>
            Array<number>(HEATMAP_AXIS.length).fill(0),
        );
        risks.forEach(r => {
            // Impact is X (1-5), Probability is Y (1-5)
            // Array indices are 0-4
            const x = Math.min(Math.max(r.gross_impact - 1, 0), 4);
            const y = Math.min(Math.max(r.gross_probability - 1, 0), 4);
            grid[y][x] += 1;
        });
        return grid;
    }, [risks]);

    const getCellColor = (p: number, i: number, count: number) => {
        if (count === 0) return 'bg-white/5';

        const score = p * i;
        return CELL_COLOR_BY_BAND[classifyRiskScore(score, thresholds)];
    };

    return (
        <div className="flex flex-col gap-1 p-2 glass rounded-lg border border-white/5 w-fit">
            <div className="flex flex-col-reverse gap-0.5">
                {HEATMAP_AXIS.map((p) => (
                    <div key={p} className="flex gap-0.5">
                        {HEATMAP_AXIS.map((i) => {
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
                {t('tables.inherited_risk_heatmap')}
            </p>
        </div>
    );
}
