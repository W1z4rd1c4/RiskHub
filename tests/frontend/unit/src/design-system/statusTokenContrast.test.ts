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
const WCAG_UI = 3;

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
const RISK_SCORE_BAND_TOKENS = ['destructive', 'severity-high', 'warning', 'info', 'success'] as const;

/*
 * UI-contract token families (audit 2026-09-30 §4.2, ADR-015 Addendum 1). Fill
 * tokens that carry text are tested as AA pairs; standalone text tokens at AA
 * against every text-bearing surface; graphical tokens (chart series) at 3:1.
 */
const FILL_PAIR_TOKENS = [
  'severity-high',
  'heat-0',
  'heat-1',
  'heat-2',
  'heat-3',
  'heat-4',
  'nav-active',
  'badge-count',
] as const;
const HEAT_TOKENS = ['heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4'] as const;
const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8'] as const;
const TEXT_SURFACES = ['background', 'card', 'popover', 'glass'] as const;
const CHART_SURFACES = ['background', 'glass'] as const;
const NEW_TOKENS = [
  'tint',
  'overlay',
  'severity-high',
  'severity-high-foreground',
  'severity-high-text',
  ...CHART_TOKENS,
  ...HEAT_TOKENS.flatMap((token) => [token, `${token}-foreground`]),
  'nav-active',
  'nav-active-foreground',
  'badge-count',
  'badge-count-foreground',
] as const;

/** Parse a unitless numeric custom property (`--name: 0.7`) from a rule body. */
function readNumber(block: string, token: string): number {
  const match = block.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s*;`));
  if (!match?.[1]) throw new Error(`Missing --${token} in theme block`);
  return Number(match[1]);
}

const SURFACE_TEXT_PAIRS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['nested', 'nested-foreground'],
  ['glass', 'glass-foreground'],
  ['muted', 'muted-foreground'],
] as const;

const UI_AGAINST_BASE = ['input', 'icon-muted'] as const;

const cases = THEMES.flatMap(({ name, selector }) =>
  STATUS_TOKENS.map((token) => ({ theme: name, selector, token })),
);

describe('semantic status tokens — WCAG AA contrast (FR-P1-3, N20)', () => {
  it.each(THEMES)('documents contrast-safe surface/foreground pairs in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);

    for (const [surface, foreground] of SURFACE_TEXT_PAIRS) {
      const ratio = contrastRatio(readHsl(block, surface), readHsl(block, foreground));
      expect(
        ratio,
        `--${surface} vs --${foreground} @ ${name} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it.each(THEMES)('documents distinguishable control/icon semantics in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);

    expect(block, '--border').toContain('--border:');

    for (const token of UI_AGAINST_BASE) {
      const ratio = contrastRatio(readHsl(block, token), readHsl(block, 'background'));
      expect(
        ratio,
        `--${token} vs --background @ ${name} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(WCAG_UI);
    }
  });

  it.each(THEMES)('accent fill and standalone accent text are readable in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const accentFillRatio = contrastRatio(readHsl(block, 'accent'), readHsl(block, 'accent-foreground'));
    const accentHoverRatio = contrastRatio(readHsl(block, 'accent-hover'), readHsl(block, 'accent-foreground'));
    const accentTextRatio = contrastRatio(readHsl(block, 'accent-text'), readHsl(block, 'background'));

    expect(
      accentFillRatio,
      `--accent vs --accent-foreground @ ${name} = ${accentFillRatio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(
      accentHoverRatio,
      `--accent-hover vs --accent-foreground @ ${name} = ${accentHoverRatio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(
      accentTextRatio,
      `--accent-text vs --background @ ${name} = ${accentTextRatio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(THEMES)('focus ring is distinguishable from the $name background', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const ratio = contrastRatio(readHsl(block, 'ring'), readHsl(block, 'background'));
    expect(ratio, `--ring vs --background @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_UI);
  });

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

  it.each(THEMES)('warning-text clears AA against the $name background', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const ratio = contrastRatio(readHsl(block, 'warning-text'), readHsl(block, 'background'));
    expect(ratio, `text-warning-text @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(THEMES)('warning-text clears AA against a 40% warning tint in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const warningTint = composite(readHsl(block, 'warning'), readHsl(block, 'background'), 0.4);
    const ratio = contrastRatioRgb(hslToRgb(readHsl(block, 'warning-text')), warningTint);
    expect(
      ratio,
      `text-warning-text on bg-warning/40 @ ${name} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(THEMES)('selected risk score foreground clears AA against every 40% band tint in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const foreground = hslToRgb(readHsl(block, 'foreground'));

    for (const token of RISK_SCORE_BAND_TOKENS) {
      const bandTint = composite(readHsl(block, token), readHsl(block, 'background'), 0.4);
      const ratio = contrastRatioRgb(foreground, bandTint);
      expect(
        ratio,
        `text-foreground on bg-${token}/40 @ ${name} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('defines --warning-text in every theme and wires it into Tailwind', () => {
    for (const { selector } of THEMES) {
      expect(themeBlock(indexCss, selector), '--warning-text').toContain('--warning-text:');
    }
    expect(tailwindConfig).toContain('hsl(var(--warning-text))');
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

describe('UI-contract token families — audit 2026-09-30 §4.2 / ADR-015 Addendum 1', () => {
  it('selects the riskhub block by both :root and the explicit .theme-riskhub class', () => {
    expect(indexCss).toMatch(/\.theme-riskhub,\s*:root\s*\{[^{}]*--success:/);
  });

  it('declares every new token family in every theme and wires it into Tailwind', () => {
    for (const { selector } of THEMES) {
      const block = themeBlock(indexCss, selector);
      for (const token of NEW_TOKENS) {
        expect(block, `--${token} @ ${selector}`).toMatch(new RegExp(`--${token}:`));
      }
      expect(block, `--overlay-alpha @ ${selector}`).toContain('--overlay-alpha:');
    }
    for (const token of NEW_TOKENS.filter((name) => name !== 'overlay')) {
      expect(tailwindConfig).toContain(`hsl(var(--${token}))`);
    }
    expect(tailwindConfig).toContain('hsl(var(--overlay) / var(--overlay-alpha))');
  });

  it('keeps --tint pure white in both dark themes, so tint/N stays pixel-identical to white/N (D3)', () => {
    for (const selector of [':root', '\\.theme-dark']) {
      expect(readHsl(themeBlock(indexCss, selector), 'tint'), selector).toEqual([0, 0, 100]);
    }
    const light = themeBlock(indexCss, '\\.theme-light');
    expect(readHsl(light, 'tint'), 'light tint = navy foreground').toEqual(readHsl(light, 'foreground'));
  });

  it.each(THEMES)('gives the dialog overlay a real alpha in $name', ({ selector }) => {
    const alpha = readNumber(themeBlock(indexCss, selector), 'overlay-alpha');
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  });

  it.each(THEMES)('every new fill token clears AA against its paired foreground in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    for (const token of FILL_PAIR_TOKENS) {
      const ratio = contrastRatio(readHsl(block, token), readHsl(block, `${token}-foreground`));
      expect(
        ratio,
        `--${token} vs --${token}-foreground @ ${name} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it.each(THEMES)('severity-high-text clears AA on every text surface and its soft badge in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const text = readHsl(block, 'severity-high-text');
    for (const surface of TEXT_SURFACES) {
      const ratio = contrastRatio(text, readHsl(block, surface));
      expect(ratio, `text-severity-high-text on --${surface} @ ${name} = ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      const softBadge = composite(readHsl(block, 'severity-high'), readHsl(block, surface), 0.1);
      const softRatio = contrastRatioRgb(hslToRgb(text), softBadge);
      expect(
        softRatio,
        `text-severity-high-text on bg-severity-high/10 over --${surface} @ ${name} = ${softRatio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it.each(THEMES)('every chart series clears 3:1 against the chart surfaces in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    for (const token of CHART_TOKENS) {
      for (const surface of CHART_SURFACES) {
        const ratio = contrastRatio(readHsl(block, token), readHsl(block, surface));
        expect(ratio, `--${token} vs --${surface} @ ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_UI);
      }
    }
  });

  it.each(THEMES)('heat scale is sequential: heat-0 to heat-4 move monotonically toward --destructive in $name', ({ selector, name }) => {
    const block = themeBlock(indexCss, selector);
    const luminances = HEAT_TOKENS.map((token) => relativeLuminance(hslToRgb(readHsl(block, token))));
    const steps = luminances.slice(1).map((value, index) => Math.sign(value - (luminances[index] ?? value)));
    expect(new Set(steps).size, `heat luminance ${luminances.map((l) => l.toFixed(3)).join(' → ')} @ ${name}`).toBe(1);
    expect(steps[0], `heat steps must not repeat a luminance @ ${name}`).not.toBe(0);
    expect(readHsl(block, 'heat-4'), `heat-4 = --destructive @ ${name}`).toEqual(readHsl(block, 'destructive'));
  });
});
