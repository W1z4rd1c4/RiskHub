import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeComputedColor } from '../../../e2e/helpers/computedColor';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('semantic RGBA byte equality', () => {
    it('matches browser legacy alpha quantization but rejects a one-byte difference', () => {
        vi.stubGlobal('CSS', { supports: () => true });
        const style = vi.spyOn(window, 'getComputedStyle');
        const normalize = (alpha: string) => {
            style.mockReturnValue({ color: `color(srgb 0.0588235 0.0901961 0.1607843 / ${alpha})` } as CSSStyleDeclaration);
            return normalizeComputedColor('rgba(15, 23, 41, 0.1)');
        };
        expect(normalize('0.1')).toBe('rgba8(15, 23, 41, 26)');
        expect(normalize('0.101961')).toBe('rgba8(15, 23, 41, 26)');
        expect(normalize(String(27 / 255))).toBe('rgba8(15, 23, 41, 27)');
        expect(normalize(String(25 / 255))).toBe('rgba8(15, 23, 41, 25)');
        expect(document.querySelectorAll('html > span')).toHaveLength(0);
    });

    it.each(['color(srgb 0 0 nope)', 'not-a-color'])('rejects unrecognized computed output %s', (color) => {
        vi.stubGlobal('CSS', { supports: () => true });
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color } as CSSStyleDeclaration);
        expect(() => normalizeComputedColor('black')).toThrow('Unrecognized normalized computed color');
        expect(document.querySelectorAll('html > span')).toHaveLength(0);
    });
});
