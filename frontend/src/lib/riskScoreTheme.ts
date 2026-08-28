export interface RiskScoreThresholds {
    critical: number;
    high: number;
    medium: number;
}

export type RiskScoreBand = 'critical' | 'high' | 'medium' | 'low';
export type RiskScoreThemeVariant = 'badge' | 'matrix-cell' | 'card' | 'text' | 'slider';

const BAND_CLASS_MAP: Record<RiskScoreThemeVariant, Record<RiskScoreBand, string>> = {
    badge: {
        critical: 'text-destructive bg-destructive/10 border-destructive/20',
        high: 'text-warning-text bg-warning/10 border-warning/20',
        medium: 'text-accent-text bg-info/10 border-info/20',
        low: 'text-success-text bg-success/10 border-success/20',
    },
    'matrix-cell': {
        critical: 'bg-destructive/40 hover:bg-destructive/60',
        high: 'bg-warning/40 hover:bg-warning/60',
        medium: 'bg-info/40 hover:bg-info/60',
        low: 'bg-success/40 hover:bg-success/60',
    },
    card: {
        critical: 'bg-destructive/10 text-destructive',
        high: 'bg-warning/10 text-warning-text',
        medium: 'bg-info/10 text-accent-text',
        low: 'bg-success/10 text-success-text',
    },
    text: {
        critical: 'text-destructive',
        high: 'text-warning-text',
        medium: 'text-accent-text',
        low: 'text-success-text',
    },
    slider: {
        critical: 'accent-destructive',
        high: 'accent-warning',
        medium: 'accent-info',
        low: 'accent-success',
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
