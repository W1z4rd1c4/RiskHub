import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * FR-P1-3 — WCAG AA contrast acceptance test for the semantic status tokens
 * (FR-P1-1 / FR-P1-2, ADR-015, spec N20).
 *
 * Every semantic `bg`/`foreground` pair, including --destructive, MUST clear
 * 4.5:1 text contrast in each of the three themes (default `:root`,
 * `.theme-dark`, `.theme-light`). The 4.5:1 text floor subsumes the 3:1
 * graphical/UI floor from N20.
 *
 * Values are PARSED from index.css (and the Tailwind wiring from
 * tailwind.config.js) rather than hard-coded, so the test tracks the source of
 * truth and fails the moment a token drifts below AA.
 */

const WCAG_AA_TEXT = 4.5;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const indexCss = readFileSync(resolve(repoRoot, 'frontend/src/index.css'), 'utf8');
const tailwindConfig = readFileSync(resolve(repoRoot, 'frontend/tailwind.config.js'), 'utf8');

type Hsl = [number, number, number];
type Rgb = [number, number, number];

/**
 * Return the declaration body of the (brace-free) rule block for `selector`
 * that defines the status tokens. Non-token blocks that share the selector
 * prefix (e.g. `.theme-dark .glass { … }`) are skipped by requiring the body
 * to contain `--success`.
 */
function themeBlock(css: string, selector: string): string {
  const re = new RegExp(`${selector}\\s*\\{([^{}]*)\\}`, 'g');
  for (const match of css.matchAll(re)) {
    const body = match[1] ?? '';
    if (body.includes('--success')) return body;
  }
  throw new Error(`No status-token block found for selector "${selector}"`);
}

/** Parse an HSL custom property (`--name: <h> <s>% <l>%`) from a rule body. */
function readHsl(block: string, token: string): Hsl {
  const match = block.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`Missing --${token} in theme block`);
  const [, h, s, l] = match;
  if (h === undefined || s === undefined || l === undefined) {
    throw new Error(`Malformed --${token}: "${match[0]}"`);
  }
  return [Number(h), Number(s), Number(l)];
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

/** WCAG relative luminance (sRGB). */
function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two HSL colours. */
function contrastRatio(a: Hsl, b: Hsl): number {
  return contrastRatioRgb(hslToRgb(a), hslToRgb(b));
}

function contrastRatioRgb(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function composite(foreground: Hsl, background: Hsl, alpha: number): Rgb {
  const fg = hslToRgb(foreground);
  const bg = hslToRgb(background);
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

const THEMES = [
  { name: 'default (:root)', selector: ':root' },
  { name: 'dark (.theme-dark)', selector: '\\.theme-dark' },
  { name: 'light (.theme-light)', selector: '\\.theme-light' },
] as const;

const STATUS_TOKENS = ['destructive', 'success', 'warning', 'info'] as const;

const cases = THEMES.flatMap(({ name, selector }) =>
  STATUS_TOKENS.map((token) => ({ theme: name, selector, token })),
);

describe('semantic status tokens — WCAG AA contrast (FR-P1-3, N20)', () => {
  it.each(cases)('$token bg/fg pair clears AA text contrast in $theme', ({ selector, token, theme }) => {
    const block = themeBlock(indexCss, selector);
    const bg = readHsl(block, token);
    const fg = readHsl(block, `${token}-foreground`);
    const ratio = contrastRatio(bg, fg);
    expect(
      ratio,
      `--${token} vs --${token}-foreground @ ${theme} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it('defines every semantic status token (+foreground) in every theme', () => {
    for (const { selector } of THEMES) {
      const block = themeBlock(indexCss, selector);
      for (const token of STATUS_TOKENS) {
        expect(block, `--${token}`).toContain(`--${token}:`);
        expect(block, `--${token}-foreground`).toContain(`--${token}-foreground:`);
      }
    }
  });

  it('keeps --destructive as the canonical danger token (no rename, no danger token)', () => {
    expect(themeBlock(indexCss, ':root')).toContain('--destructive:');
    expect(indexCss).not.toContain('--danger:');
  });

  it.each(THEMES)('destructive text clears AA against the $name background', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const ratio = contrastRatio(readHsl(block, 'destructive'), readHsl(block, 'background'));
    expect(ratio, `text-destructive @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(THEMES)('success-text clears AA against the $name background', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const ratio = contrastRatio(readHsl(block, 'success-text'), readHsl(block, 'background'));
    expect(ratio, `text-success-text @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it('defines --success-text in every theme and wires it into Tailwind', () => {
    for (const { selector } of THEMES) {
      expect(themeBlock(indexCss, selector), '--success-text').toContain('--success-text:');
    }
    expect(tailwindConfig).toContain('hsl(var(--success-text))');
  });

  it.each(THEMES)('90% destructive hover fill clears AA against its foreground in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const hoverFill = composite(readHsl(block, 'destructive'), readHsl(block, 'background'), 0.9);
    const ratio = contrastRatioRgb(hoverFill, hslToRgb(readHsl(block, 'destructive-foreground')));
    expect(ratio, `hover:bg-destructive/90 @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it('wires every semantic status token into Tailwind theme.extend.colors (FR-P1-2)', () => {
    for (const token of STATUS_TOKENS) {
      expect(tailwindConfig).toContain(`hsl(var(--${token}))`);
      expect(tailwindConfig).toContain(`hsl(var(--${token}-foreground))`);
    }
  });
});
