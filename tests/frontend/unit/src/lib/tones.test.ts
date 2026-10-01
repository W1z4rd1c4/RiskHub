import { describe, expect, it } from 'vitest';

import { getControlMonitoringMeta, getKriMonitoringMeta } from '@/lib/monitoringStatus';
import {
    BADGE_TONES,
    isTone,
    TONE_CLASSES,
    TONE_CSS_VAR,
    TONE_VARIANTS,
    TONES,
    toneClass,
    type StatusTone,
} from '@/lib/tones';

const RAW_PALETTE =
    /(?:^|\s|:)(?:bg|text|border|accent|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

function classSet(value: string): Set<string> {
    return new Set(value.split(/\s+/).filter(Boolean));
}

describe('lib/tones', () => {
    it.each(TONES)('defines every variant for the %s tone with token classes only', (tone) => {
        for (const variant of TONE_VARIANTS) {
            const value = TONE_CLASSES[tone][variant];
            expect(value.trim()).not.toBe('');
            expect(value).not.toMatch(RAW_PALETTE);
            expect(value).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|dark:/i);
            expect(toneClass(tone, variant)).toBe(value);
        }
    });

    it.each(TONE_VARIANTS)('keeps the %s variant distinct across tones', (variant) => {
        // `info` has no `-text` token of its own and shares `text-accent-text`
        // with `accent` for plain text; every other variant is unique per tone.
        const tones = variant === 'text' ? TONES.filter((tone) => tone !== 'info') : TONES;
        const outputs = tones.map((tone) => toneClass(tone, variant));
        expect(new Set(outputs).size).toBe(tones.length);
    });

    it('pairs every fill with its foreground token', () => {
        for (const tone of TONES) {
            expect(toneClass(tone, 'fill')).toMatch(/\btext-[a-z-]+-foreground\b/);
        }
    });

    it('names a CSS custom property for every tone', () => {
        expect(Object.keys(TONE_CSS_VAR).sort()).toEqual([...TONES].sort());
        for (const tone of TONES) {
            expect(TONE_CSS_VAR[tone]).toMatch(/^--[a-z-]+$/);
        }
    });

    it('recognises tone names', () => {
        expect(isTone('severity-high')).toBe(true);
        expect(isTone('destructive')).toBe(false);
        expect(isTone(undefined)).toBe(false);
    });

    it('derives BADGE_TONES from the tone recipes', () => {
        const statusTones: StatusTone[] = ['success', 'warning', 'danger', 'info', 'neutral'];
        expect(Object.keys(BADGE_TONES).sort()).toEqual([...statusTones].sort());
        for (const tone of statusTones) {
            const expectedBadge = classSet(toneClass(tone, 'badge'));
            expectedBadge.add('border');
            expect(classSet(BADGE_TONES[tone].badgeClassName)).toEqual(expectedBadge);
            expect(BADGE_TONES[tone].textClassName).toBe(toneClass(tone, 'text'));
            expect(BADGE_TONES[tone].gaugeToneClassName).toBe(toneClass(tone, 'text'));
        }
    });

    it('is the presentation source of the monitoring metas in lib/monitoringStatus', () => {
        expect(getControlMonitoringMeta('failed')).toMatchObject(BADGE_TONES.danger);
        expect(getKriMonitoringMeta('optimal')).toMatchObject(BADGE_TONES.success);
    });
});
