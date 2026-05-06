import { describe, expect, it } from 'vitest';

import {
    classifyRiskScore,
    riskScoreClass,
    riskScoreVariantClass,
    type RiskScoreBand,
    type RiskScoreThemeVariant,
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

    it.each([
        ['badge', 'critical', 'text-rose-400 bg-rose-400/10 border-rose-400/20'],
        ['badge', 'high', 'text-orange-400 bg-orange-400/10 border-orange-400/20'],
        ['badge', 'medium', 'text-amber-400 bg-amber-400/10 border-amber-400/20'],
        ['badge', 'low', 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'],
        ['matrix-cell', 'critical', 'bg-rose-500/40 hover:bg-rose-500/60'],
        ['matrix-cell', 'high', 'bg-orange-500/40 hover:bg-orange-500/60'],
        ['matrix-cell', 'medium', 'bg-amber-500/40 hover:bg-amber-500/60'],
        ['matrix-cell', 'low', 'bg-emerald-500/40 hover:bg-emerald-500/60'],
        ['card', 'critical', 'bg-rose-500/20 text-rose-400'],
        ['card', 'high', 'bg-orange-500/20 text-orange-400'],
        ['card', 'medium', 'bg-amber-500/20 text-amber-400'],
        ['card', 'low', 'bg-emerald-500/20 text-emerald-400'],
        ['text', 'critical', 'text-rose-400'],
        ['text', 'high', 'text-orange-400'],
        ['text', 'medium', 'text-amber-400'],
        ['text', 'low', 'text-emerald-400'],
        ['slider', 'critical', 'accent-rose-500'],
        ['slider', 'high', 'accent-orange-500'],
        ['slider', 'medium', 'accent-amber-500'],
        ['slider', 'low', 'accent-emerald-500'],
    ] satisfies Array<[RiskScoreThemeVariant, RiskScoreBand, string]>)(
        'returns %s classes for %s scores',
        (variant, band, expected) => {
            expect(riskScoreClass(variant, band)).toBe(expected);
        },
    );

    it('returns variant classes for the classified score band', () => {
        expect(riskScoreVariantClass('badge', 15, thresholds)).toBe(
            'text-orange-400 bg-orange-400/10 border-orange-400/20',
        );
    });
});
