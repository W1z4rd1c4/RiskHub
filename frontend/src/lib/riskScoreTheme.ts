/**
 * DEPRECATED legacy risk-score palette, kept only until roadmap item 2.11
 * (wave W7) moves its consumers onto `@/lib/severity`. New code imports
 * `riskScoreVariantClass` / `severityClass` from `@/lib/severity` (audit
 * 2026-09-30 D1, ADR-008) and never from this module.
 *
 * Band classification and the threshold shape are owned by `lib/severity.ts`
 * and re-exported here unchanged. The class map below still renders the pre-D1
 * colours (medium = info blue, high = warning amber). The score helper is named
 * `legacyRiskScoreVariantClass` so it cannot be confused with the D1
 * `riskScoreVariantClass`; a test keeps every name shared with
 * `lib/severity.ts` bound to the identical value. 2.11 swaps the consumers
 * together with the announced screenshot refresh, then deletes this module.
 */
import { classifyRiskScore, type RiskScoreThresholds, type SeverityBand } from '@/lib/severity';

export { classifyRiskScore };
export type { RiskScoreThresholds };

export type RiskScoreBand = SeverityBand;
/** @deprecated Use `SeverityVariant` from `@/lib/severity` (roadmap 2.11, W7). */
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

/** @deprecated Pre-D1 palette. Use `severityClass` from `@/lib/severity` (roadmap 2.11, W7). */
export function riskScoreClass(variant: RiskScoreThemeVariant, band: RiskScoreBand): string {
    return BAND_CLASS_MAP[variant][band];
}

/**
 * @deprecated Pre-D1 palette (medium = blue). Not the D1 helper: use
 * `riskScoreVariantClass` from `@/lib/severity` (roadmap 2.11, W7).
 */
export function legacyRiskScoreVariantClass(
    variant: RiskScoreThemeVariant,
    score: number,
    thresholds: RiskScoreThresholds,
): string {
    return riskScoreClass(variant, classifyRiskScore(score, thresholds));
}
