/**
 * The single severity scale (audit 2026-09-30 decision D1, §4.4 B; ADR-015
 * Addendum 1 §1–2; ADR-008).
 *
 * Every low / medium / high / critical surface (risk score bands, issue
 * severity, KRI RAG where applicable, heatmaps, charts) maps its band to a
 * colour here and nowhere else:
 *
 *   low → `success` · medium → `warning` · high → `severity-high` · critical → `danger` (`destructive`)
 *
 * Blue (`info` / `accent`) never encodes severity. Every severity surface must
 * also render a text label or legend. Class recipes come from `lib/tones.ts`, so
 * a band and its tone always share one token family.
 *
 * Risk-score thresholds are never literals here: callers pass the configured
 * thresholds from `useRiskThresholds()` (ADR-008), whose `getSeverityBand`
 * helper binds them to `classifyRiskScore`.
 */
import { useMemo } from 'react';

import { readCssColor, useCssTokens, type CssCustomProperty } from '@/lib/cssTokens';
import { TONE_CSS_VAR, toneClass, type Tone, type ToneVariant } from '@/lib/tones';
import type { IssueSeverity } from '@/types/issue';

export const SEVERITY_BANDS = ['low', 'medium', 'high', 'critical'] as const;
export type SeverityBand = (typeof SEVERITY_BANDS)[number];

/** D1: band → tone. The only place a severity band is given a colour family. */
export const SEVERITY_BAND_TONE = {
    low: 'success',
    medium: 'warning',
    high: 'severity-high',
    critical: 'danger',
} as const satisfies Readonly<Record<SeverityBand, Tone>>;
export type SeverityTone = (typeof SEVERITY_BAND_TONE)[SeverityBand];

/** Surfaces a band can paint; see `ToneVariant` in `lib/tones.ts`. */
export type SeverityVariant = ToneVariant;

export function isSeverityBand(value: unknown): value is SeverityBand {
    return typeof value === 'string' && (SEVERITY_BANDS as readonly string[]).includes(value);
}

export function severityTone(band: SeverityBand): SeverityTone {
    return SEVERITY_BAND_TONE[band];
}

/**
 * Class recipe for `band` on `variant` (badge, fill, matrix-cell, card, text,
 * slider, border, dot). Adjacent `matrix-cell` fills are close in colour
 * (CIEDE2000 ≈ 10–17 between medium/high/critical), so every cell must also
 * show its score or label and carry an `aria-label`.
 */
export function severityClass(variant: SeverityVariant, band: SeverityBand): string {
    return toneClass(SEVERITY_BAND_TONE[band], variant);
}

/** The CSS custom property behind `band`, for canvas / SVG / Recharts. */
export function severityChartToken(band: SeverityBand): CssCustomProperty {
    return TONE_CSS_VAR[SEVERITY_BAND_TONE[band]];
}

/** `band`'s colour read from the current theme (not reactive; see `useSeverityChartColors`). */
export function severityChartColor(band: SeverityBand, alpha?: number): string {
    return readCssColor(severityChartToken(band), alpha);
}

const SEVERITY_CHART_TOKENS = SEVERITY_BANDS.map(severityChartToken);

/** Band → colour string for Recharts series, re-read on theme change. */
export function useSeverityChartColors(alpha?: number): Readonly<Record<SeverityBand, string>> {
    const colors = useCssTokens(SEVERITY_CHART_TOKENS, alpha);
    return useMemo(
        () =>
            Object.fromEntries(
                SEVERITY_BANDS.map((band) => [band, colors[severityChartToken(band)]]),
            ) as Record<SeverityBand, string>,
        [colors],
    );
}

// ---------------------------------------------------------------------------
// Risk score bands (ADR-008: thresholds are configuration, never literals)
// ---------------------------------------------------------------------------

/** Shape of `useRiskThresholds().thresholds` (Risk Hub `*_risk_min_net_score` config). */
export interface RiskScoreThresholds {
    critical: number;
    high: number;
    medium: number;
}

export function classifyRiskScore(score: number, thresholds: RiskScoreThresholds): SeverityBand {
    if (score >= thresholds.critical) return 'critical';
    if (score >= thresholds.high) return 'high';
    if (score >= thresholds.medium) return 'medium';
    return 'low';
}

/** D1 class recipe for a risk score under the configured thresholds. */
export function riskScoreVariantClass(
    variant: SeverityVariant,
    score: number,
    thresholds: RiskScoreThresholds,
): string {
    return severityClass(variant, classifyRiskScore(score, thresholds));
}

// ---------------------------------------------------------------------------
// Issue severity
// ---------------------------------------------------------------------------

export const ISSUE_SEVERITY_BAND: Readonly<Record<IssueSeverity, SeverityBand>> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
};

// ---------------------------------------------------------------------------
// DORA criticality class and vendor tier (ADR-015 Addendum 1 §2)
// ---------------------------------------------------------------------------

export const CRITICALITY_CLASSES = ['low', 'medium', 'high', 'critical'] as const;
export type CriticalityClass = (typeof CRITICALITY_CLASSES)[number];

/**
 * DORA criticality (TridyKrit) keeps its 3-step collapse on the D1 tokens:
 * medium and high both read `warning`; the label text carries the exact class.
 */
export const CRITICALITY_CLASS_BAND: Readonly<Record<CriticalityClass, SeverityBand>> = {
    low: 'low',
    medium: 'medium',
    high: 'medium',
    critical: 'critical',
};

export const CRITICALITY_CLASS_TONE: Readonly<Record<CriticalityClass, SeverityTone>> = {
    low: SEVERITY_BAND_TONE[CRITICALITY_CLASS_BAND.low],
    medium: SEVERITY_BAND_TONE[CRITICALITY_CLASS_BAND.medium],
    high: SEVERITY_BAND_TONE[CRITICALITY_CLASS_BAND.high],
    critical: SEVERITY_BAND_TONE[CRITICALITY_CLASS_BAND.critical],
};

/** Verbatim workbook labels (stored values, never translated) → criticality class. */
const CRITICALITY_WORKBOOK_CLASS: Readonly<Record<string, CriticalityClass>> = {
    ['Nízká']: 'low',
    ['Střední']: 'medium',
    ['Vysoká']: 'high',
    ['Kritická']: 'critical',
};

export function isCriticalityClass(value: unknown): value is CriticalityClass {
    return typeof value === 'string' && (CRITICALITY_CLASSES as readonly string[]).includes(value);
}

/** Accepts the English code or the verbatim workbook label; `null` when unknown. */
export function toCriticalityClass(value: string | null | undefined): CriticalityClass | null {
    if (!value) return null;
    if (isCriticalityClass(value)) return value;
    return CRITICALITY_WORKBOOK_CLASS[value] ?? null;
}

/** Class recipe for a criticality value, or `null` when the value is unknown. */
export function criticalityClass(variant: SeverityVariant, value: string | null | undefined): string | null {
    const criticality = toCriticalityClass(value);
    return criticality ? toneClass(CRITICALITY_CLASS_TONE[criticality], variant) : null;
}

export const VENDOR_TIERS = ['critical', 'significant', 'standard'] as const;
export type VendorTier = (typeof VENDOR_TIERS)[number];

/** TierDod: critical → danger, significant → warning, standard → neutral (PO default). */
export const VENDOR_TIER_TONE: Readonly<Record<VendorTier, Tone>> = {
    critical: SEVERITY_BAND_TONE.critical,
    significant: SEVERITY_BAND_TONE.medium,
    standard: 'neutral',
};

export function isVendorTier(value: unknown): value is VendorTier {
    return typeof value === 'string' && (VENDOR_TIERS as readonly string[]).includes(value);
}

/** Class recipe for a vendor tier, or `null` when the value is unknown. */
export function vendorTierClass(variant: SeverityVariant, value: string | null | undefined): string | null {
    return isVendorTier(value) ? toneClass(VENDOR_TIER_TONE[value], variant) : null;
}

// ---------------------------------------------------------------------------
// Sequential count heatmap (ICT committee): `--heat-0…4`, not a severity band
// ---------------------------------------------------------------------------

export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

const HEAT_CELL_CLASSES: Readonly<Record<HeatLevel, string>> = {
    0: 'bg-heat-0 text-heat-0-foreground',
    1: 'bg-heat-1 text-heat-1-foreground',
    2: 'bg-heat-2 text-heat-2-foreground',
    3: 'bg-heat-3 text-heat-3-foreground',
    4: 'bg-heat-4 text-heat-4-foreground',
};

export function heatCellClass(level: HeatLevel): string {
    return HEAT_CELL_CLASSES[level];
}

/** Bucket a count against the largest count shown: 0 stays 0, any positive count is 1–4. */
export function heatLevelForCount(count: number, maxCount: number): HeatLevel {
    if (!(count > 0) || !(maxCount > 0)) return 0;
    const bucket = Math.ceil((Math.min(count, maxCount) / maxCount) * 4);
    return Math.min(4, Math.max(1, bucket)) as HeatLevel;
}
