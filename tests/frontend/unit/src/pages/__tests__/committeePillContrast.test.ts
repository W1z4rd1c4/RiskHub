import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    netBandStyle,
    tierStyle,
    toleranceStyle,
} from '@/pages/ictRegisterCommittee/committeePresentation';

/**
 * FR-P5-1 (spec N20, ADR-015) — the Committee Excel-pastel status pills are
 * migrated onto the semantic status tokens and must clear WCAG AA text contrast
 * (≥ 4.5:1) in every theme.
 *
 * Two things are asserted:
 *  1. The RAG mapping — each verbatim band label resolves to the expected token
 *     (`--success` / `--warning` / `--destructive`), so the four Excel bands read
 *     red/amber/green (the yellow + orange middles both collapse to amber).
 *  2. Contrast — each pill's background / foreground pair, resolved against the
 *     actual token values PARSED from index.css, clears 4.5:1 in the default /
 *     dark / light themes. Every pill consumes its semantic background and
 *     foreground directly. The destructive foreground is deliberately
 *     near-black because white on the destructive red does not clear AA.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const indexCss = readFileSync(resolve(repoRoot, 'frontend/src/index.css'), 'utf8');

type Hsl = [number, number, number];
type Rgb = [number, number, number];

const AA_TEXT = 4.5;

/** Token name out of an `hsl(var(--<token>))` (or `color-mix(… var(--<token>) …)`) string. */
function tokenOf(styleValue: string): string {
    const match = styleValue.match(/var\(--([\w-]+)\)/);
    if (!match) throw new Error(`Not a token reference: "${styleValue}"`);
    return match[1]!;
}

/** Declaration body of the status-token rule block for `selector`. */
function themeBlock(css: string, selector: string): string {
    const re = new RegExp(`${selector}\\s*\\{([^{}]*)\\}`, 'g');
    for (const m of css.matchAll(re)) {
        const body = m[1] ?? '';
        if (body.includes('--success')) return body;
    }
    throw new Error(`No status-token block for "${selector}"`);
}

function readHsl(block: string, token: string): Hsl {
    const m = block.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
    if (!m) throw new Error(`Missing --${token}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
    const sat = s / 100;
    const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lig - c / 2;
    let base: Rgb;
    if (h < 60) base = [c, x, 0];
    else if (h < 120) base = [x, c, 0];
    else if (h < 180) base = [0, c, x];
    else if (h < 240) base = [0, x, c];
    else if (h < 300) base = [x, 0, c];
    else base = [c, 0, x];
    return [(base[0] + m) * 255, (base[1] + m) * 255, (base[2] + m) * 255];
}

/**
 * Resolve a pill style value to sRGB — either a plain `hsl(var(--token))`, or a
 * `color-mix(in srgb, hsl(var(--token)) P%, black|white)` interpolated
 * component-wise in sRGB (exactly how the browser renders it).
 */
function resolveRgb(styleValue: string, block: string): Rgb {
    const mix = styleValue.match(
        /color-mix\(in srgb,\s*hsl\(var\(--([\w-]+)\)\)\s*([\d.]+)%,\s*(black|white)\)/,
    );
    if (mix) {
        const base = hslToRgb(readHsl(block, mix[1]!));
        const p = Number(mix[2]) / 100;
        const other: Rgb = mix[3] === 'black' ? [0, 0, 0] : [255, 255, 255];
        return [
            base[0] * p + other[0] * (1 - p),
            base[1] * p + other[1] * (1 - p),
            base[2] * p + other[2] * (1 - p),
        ];
    }
    return hslToRgb(readHsl(block, tokenOf(styleValue)));
}

function relativeLuminance([r, g, b]: Rgb): number {
    const channel = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [
    { name: 'default (:root)', selector: ':root' },
    { name: 'dark (.theme-dark)', selector: '\\.theme-dark' },
    { name: 'light (.theme-light)', selector: '\\.theme-light' },
] as const;

// Distinct pill styles the three helpers resolve to.
const PILLS = [
    { name: 'success (green)', style: netBandStyle('Nízké')! },
    { name: 'warning (amber)', style: netBandStyle('Střední')! },
    { name: 'destructive (red)', style: netBandStyle('Kritické')! },
] as const;

describe('committee status pills — semantic-token RAG mapping (FR-P5-1)', () => {
    const success = 'success';
    const warning = 'warning';
    const destructive = 'destructive';

    it('collapses the four Excel bands onto the three-token RAG scale', () => {
        expect(tokenOf(netBandStyle('Nízké')!.backgroundColor)).toBe(success);
        expect(tokenOf(netBandStyle('Střední')!.backgroundColor)).toBe(warning);
        expect(tokenOf(netBandStyle('Vysoké')!.backgroundColor)).toBe(warning);
        expect(tokenOf(netBandStyle('Kritické')!.backgroundColor)).toBe(destructive);
    });

    it('maps tolerance + vendor-tier pills onto the same tokens', () => {
        expect(tokenOf(toleranceStyle('V toleranci')!.backgroundColor)).toBe(success);
        expect(tokenOf(toleranceStyle('NAD TOLERANCI')!.backgroundColor)).toBe(destructive);
        expect(tokenOf(tierStyle('Standardní dodavatel')!.backgroundColor)).toBe(success);
        expect(tokenOf(tierStyle('Významný dodavatel')!.backgroundColor)).toBe(warning);
        expect(tokenOf(tierStyle('Kritický dodavatel')!.backgroundColor)).toBe(destructive);
    });

    it('pairs every pill background with the matching token foreground', () => {
        for (const { style } of PILLS) {
            expect(tokenOf(style.color)).toBe(`${tokenOf(style.backgroundColor)}-foreground`);
        }
    });
});

describe('committee status pills — WCAG AA text contrast in every theme (FR-P5-1, N20)', () => {
    const cases = THEMES.flatMap(({ name, selector }) =>
        PILLS.map((pill) => ({ theme: name, selector, ...pill })),
    );

    it.each(cases)('$name pill clears AA text (4.5:1) in $theme', ({ selector, style, theme, name }) => {
        const block = themeBlock(indexCss, selector);
        const bg = resolveRgb(style.backgroundColor, block);
        const fg = resolveRgb(style.color, block);
        const ratio = contrast(bg, fg);
        expect(
            ratio,
            `${name} bg/fg @ ${theme} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
    });
});
