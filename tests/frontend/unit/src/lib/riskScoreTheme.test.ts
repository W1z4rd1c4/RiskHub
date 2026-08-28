import { describe, expect, it } from 'vitest';

import {
    classifyRiskScore,
    type RiskScoreBand,
    riskScoreClass,
} from '@/lib/riskScoreTheme';

const thresholds = { critical: 16, high: 10, medium: 5 };

describe('riskScoreTheme', () => {
    it.each([
        [16, 'critical'],
        [15, 'high'],
        [10, 'high'],
        [9, 'medium'],
        [5, 'medium'],
        [4, 'low'],
    ] satisfies Array<[number, RiskScoreBand]>)('classifies score %s as %s', (score, expected) => {
        expect(classifyRiskScore(score, thresholds)).toBe(expected);
    });

    it.each(['matrix-cell', 'slider'] as const)('keeps every %s band distinct and semantic', (variant) => {
        const bands: RiskScoreBand[] = ['critical', 'high', 'medium', 'low'];
        const outputs = bands.map((band) => riskScoreClass(variant, band));

        expect(new Set(outputs).size).toBe(bands.length);
        for (const output of outputs) {
            expect(output).not.toMatch(/(?:rose|orange|amber|emerald)-/);
        }
    });
});
