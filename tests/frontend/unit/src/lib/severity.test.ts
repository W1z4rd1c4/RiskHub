import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    classifyRiskScore,
    criticalityClass,
    heatCellClass,
    heatLevelForCount,
    HEAT_LEVELS,
    isSeverityBand,
    riskScoreVariantClass,
    SEVERITY_BANDS,
    type SeverityBand,
    severityChartColor,
    severityClass,
    toCriticalityClass,
    useSeverityChartColors,
    vendorTierClass,
} from '@/lib/severity';
import { toneClass } from '@/lib/tones';

// Deliberately non-default (defaults are critical 16 / high 10 / medium 5) so
// these tests prove the configured thresholds are honoured (ADR-008).
const CONFIGURED = { critical: 21, high: 13, medium: 7 };

afterEach(() => {
    document.documentElement.removeAttribute('style');
});

describe('lib/severity — risk score bands (ADR-008)', () => {
    it.each([
        [25, 'critical'],
        [21, 'critical'],
        [20, 'high'],
        [13, 'high'],
        [12, 'medium'],
        [7, 'medium'],
        [6, 'low'],
        [0, 'low'],
    ] satisfies Array<[number, SeverityBand]>)('classifies %s as %s under configured thresholds', (score, band) => {
        expect(classifyRiskScore(score, CONFIGURED)).toBe(band);
    });

    it('renders a score with the class recipe of its configured band', () => {
        expect(riskScoreVariantClass('badge', 16, CONFIGURED)).toBe(severityClass('badge', 'high'));
        expect(riskScoreVariantClass('matrix-cell', 21, CONFIGURED)).toBe(severityClass('matrix-cell', 'critical'));
        expect(riskScoreVariantClass('text', 5, CONFIGURED)).toBe(severityClass('text', 'low'));
    });

    it('recognises band names', () => {
        expect(SEVERITY_BANDS.every(isSeverityBand)).toBe(true);
        expect(isSeverityBand('severe')).toBe(false);
        expect(isSeverityBand(3)).toBe(false);
    });
});

describe('lib/severity — D1 class recipes', () => {
    it('maps the four bands onto success, warning, severity-high and destructive', () => {
        expect(severityClass('badge', 'low')).toBe('bg-success/10 text-success-text border-success/20');
        expect(severityClass('badge', 'medium')).toBe('bg-warning/10 text-warning-text border-warning/20');
        expect(severityClass('badge', 'high')).toBe(
            'bg-severity-high/10 text-severity-high-text border-severity-high/20',
        );
        expect(severityClass('badge', 'critical')).toBe(
            'bg-destructive/10 text-destructive border-destructive/20',
        );
        expect(severityClass('fill', 'high')).toBe('bg-severity-high text-severity-high-foreground');
        expect(severityClass('matrix-cell', 'medium')).toBe('bg-warning/40 hover:bg-warning/60');
    });
});

describe('lib/severity — chart colours', () => {
    it('reads the band token from the current theme', () => {
        document.documentElement.style.setProperty('--severity-high', '25 95% 53%');
        expect(severityChartColor('high')).toBe('hsl(25 95% 53%)');
        expect(severityChartColor('high', 0.4)).toBe('hsl(25 95% 53% / 0.4)');
    });

    it('returns one colour per band from the hook', () => {
        document.documentElement.style.setProperty('--success', '142 71% 45%');
        document.documentElement.style.setProperty('--destructive', '0 84% 60%');
        const { result } = renderHook(() => useSeverityChartColors());
        expect(Object.keys(result.current).sort()).toEqual([...SEVERITY_BANDS].sort());
        expect(result.current.low).toBe('hsl(142 71% 45%)');
        expect(result.current.critical).toBe('hsl(0 84% 60%)');
    });
});

describe('lib/severity — DORA criticality and vendor tier', () => {
    it.each([
        ['Nízká', 'low'],
        ['Střední', 'medium'],
        ['Vysoká', 'high'],
        ['Kritická', 'critical'],
        ['critical', 'critical'],
        ['low', 'low'],
    ])('reads the criticality class of %s', (value, expected) => {
        expect(toCriticalityClass(value)).toBe(expected);
    });

    it('returns null for unknown or empty criticality values', () => {
        expect(toCriticalityClass('Neznámá')).toBeNull();
        expect(toCriticalityClass('')).toBeNull();
        expect(toCriticalityClass(null)).toBeNull();
        expect(criticalityClass('fill', undefined)).toBeNull();
    });

    it('keeps the 3-step collapse: medium and high share the warning recipe', () => {
        expect(criticalityClass('fill', 'Nízká')).toBe(toneClass('success', 'fill'));
        expect(criticalityClass('fill', 'Střední')).toBe(toneClass('warning', 'fill'));
        expect(criticalityClass('fill', 'Vysoká')).toBe(toneClass('warning', 'fill'));
        expect(criticalityClass('fill', 'Kritická')).toBe(toneClass('danger', 'fill'));
    });

    it('maps vendor tiers onto danger, warning and neutral', () => {
        expect(vendorTierClass('badge', 'critical')).toBe(toneClass('danger', 'badge'));
        expect(vendorTierClass('badge', 'significant')).toBe(toneClass('warning', 'badge'));
        expect(vendorTierClass('badge', 'standard')).toBe(toneClass('neutral', 'badge'));
        expect(vendorTierClass('badge', 'unknown')).toBeNull();
        expect(vendorTierClass('badge', null)).toBeNull();
    });
});

describe('lib/severity — sequential heat scale', () => {
    it('renders each level with its heat token pair', () => {
        for (const level of HEAT_LEVELS) {
            expect(heatCellClass(level)).toBe(`bg-heat-${level} text-heat-${level}-foreground`);
        }
    });

    it.each([
        [0, 10, 0],
        [-3, 10, 0],
        [4, 0, 0],
        [1, 10, 1],
        [3, 10, 2],
        [5, 10, 2],
        [6, 10, 3],
        [9, 10, 4],
        [10, 10, 4],
        [12, 10, 4],
        [1, 1, 4],
    ])('buckets count %s of max %s into level %s', (count, max, level) => {
        expect(heatLevelForCount(count, max)).toBe(level);
    });
});
