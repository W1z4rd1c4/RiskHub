export interface RiskScoreThresholds {
    critical: number;
    high: number;
    medium: number;
}

export type RiskScoreBand = 'critical' | 'high' | 'medium' | 'low';
export type RiskScoreThemeVariant = 'badge' | 'matrix-cell' | 'card' | 'text' | 'slider';

const BAND_CLASS_MAP: Record<RiskScoreThemeVariant, Record<RiskScoreBand, string>> = {
    badge: {
        critical: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
        high: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
        medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    },
    'matrix-cell': {
        critical: 'bg-rose-500/40 hover:bg-rose-500/60',
        high: 'bg-orange-500/40 hover:bg-orange-500/60',
        medium: 'bg-amber-500/40 hover:bg-amber-500/60',
        low: 'bg-emerald-500/40 hover:bg-emerald-500/60',
    },
    card: {
        critical: 'bg-rose-500/20 text-rose-400',
        high: 'bg-orange-500/20 text-orange-400',
        medium: 'bg-amber-500/20 text-amber-400',
        low: 'bg-emerald-500/20 text-emerald-400',
    },
    text: {
        critical: 'text-rose-400',
        high: 'text-orange-400',
        medium: 'text-amber-400',
        low: 'text-emerald-400',
    },
    slider: {
        critical: 'accent-rose-500',
        high: 'accent-orange-500',
        medium: 'accent-amber-500',
        low: 'accent-emerald-500',
    },
};

export function classifyRiskScore(score: number, thresholds: RiskScoreThresholds): RiskScoreBand {
    if (score >= thresholds.critical) return 'critical';
    if (score >= thresholds.high) return 'high';
    if (score >= thresholds.medium) return 'medium';
    return 'low';
}

export function riskScoreClass(variant: RiskScoreThemeVariant, band: RiskScoreBand): string {
    return BAND_CLASS_MAP[variant][band];
}

export function riskScoreVariantClass(
    variant: RiskScoreThemeVariant,
    score: number,
    thresholds: RiskScoreThresholds,
): string {
    return riskScoreClass(variant, classifyRiskScore(score, thresholds));
}
