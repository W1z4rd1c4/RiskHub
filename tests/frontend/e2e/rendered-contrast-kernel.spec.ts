import { expect, test } from '@playwright/test';

import { normalizeComputedColor, readComputedColor } from './helpers/computedColor';
import { measureRenderedContrast, type Rgba } from './helpers/renderedContrast';
import { auditRenderedContrast } from './helpers/renderedContrastAudit';

/** Browser-only color-engine regressions; no backend, fixtures or auth needed. */
const EQUIVALENT_COLORS = [
  ['legacy RGB', 'rgb(51, 102, 153)'],
  ['percentage RGB', 'rgb(20% 40% 60%)'],
  ['percentage RGBA', 'rgba(20%, 40%, 60%, 100%)'],
  ['sRGB', 'color(srgb 0.2 0.4 0.6)'],
  ['Oklab', 'oklab(from rgb(51 102 153) l a b)'],
  ['Oklch', 'oklch(from rgb(51 102 153) l c h)'],
  ['Display P3', 'color(from rgb(51 102 153) display-p3 r g b)'],
  ['Tailwind color-mix', 'color-mix(in oklab, rgb(51 102 153) 100%, transparent)'],
] as const;

function expectColor(actual: Rgba, expected: Rgba, message?: string): void {
  for (let index = 0; index < 4; index += 1) {
    expect(actual[index], message).toBeCloseTo(expected[index], 2);
  }
}

test.describe('rendered contrast browser color normalization', () => {
  for (const [name, color] of EQUIVALENT_COLORS) {
    test(`${name} retains equivalent sRGB channels and contrast`, async ({ page }) => {
      await page.setContent(`<body style="background:white">
        <span id="sample" style="color:${color}">Sample</span>
        <span id="reference" style="color:rgb(51,102,153)">Reference</span>
      </body>`);
      expect(await page.evaluate((value) => CSS.supports('color', value), color)).toBe(true);
      const sample = await page.locator('#sample').evaluate(measureRenderedContrast);
      const reference = await page.locator('#reference').evaluate(measureRenderedContrast);
      expectColor(sample.foreground, [51, 102, 153, 1]);
      expectColor(sample.background, [255, 255, 255, 1]);
      expect(sample.ratio).toBeCloseTo(reference.ratio, 3);
      // Normalization probes must not remain on, or affect, the audited page.
      await expect(page.locator('html > span')).toHaveCount(0);
    });
  }

  test('linear sRGB preserves the browser-normalized fractional channels and contrast', async ({ page }) => {
    const color = 'color(from rgb(51 102 153) srgb-linear r g b)';
    await page.setContent(`<body style="background:white">
      <span id="sample" style="color:${color}">Sample</span>
      <span id="reference">Reference</span>
    </body>`);
    expect(await page.evaluate((value) => CSS.supports('color', value), color)).toBe(true);
    const computed = await page.locator('#sample').evaluate((element) => getComputedStyle(element).color);
    // A browser's sRGB -> linear -> sRGB round trip is not numerically lossless.
    // Use its actual computed color as the conversion oracle, rather than
    // assuming ideal [51, 102, 153] channels or rounding the measured channels.
    const normalized = await page.locator('#reference').evaluate((element, value) => {
      (element as HTMLElement).style.color = `color(from ${value} srgb r g b / alpha)`;
      return getComputedStyle(element).color;
    }, computed);
    const match = normalized.match(/^color\(srgb\s+([^)]+)\)$/);
    expect(match, `Browser normalization: ${computed} -> ${normalized}`).not.toBeNull();
    const channels = match![1].trim().split(/[\s/]+/).map(Number);
    expect([3, 4]).toContain(channels.length);
    expect(channels.every(Number.isFinite)).toBe(true);
    const expected: Rgba = [channels[0] * 255, channels[1] * 255, channels[2] * 255, channels[3] ?? 1];
    const sample = await page.locator('#sample').evaluate(measureRenderedContrast);
    const reference = await page.locator('#reference').evaluate(measureRenderedContrast);
    expectColor(sample.foreground, expected, `Browser normalization: ${computed} -> ${normalized}`);
    expectColor(sample.background, [255, 255, 255, 1]);
    expect(sample.ratio).toBeCloseTo(reference.ratio, 3);
    await expect(page.locator('html > span')).toHaveCount(0);
  });

  for (const [name, color] of [
    ['percentage RGB alpha', 'rgb(20% 40% 60% / 40%)'],
    ['percentage RGBA alpha', 'rgba(20%, 40%, 60%, 40%)'],
    ['Oklab alpha', 'oklab(from rgb(51 102 153) l a b / 40%)'],
  ] as const) {
    test(`${name} preserves channels and alpha during compositing`, async ({ page }) => {
      await page.setContent(`<body style="background:rgb(20,40,60)">
        <span id="sample" style="color:${color}">Sample</span>
        <span id="reference" style="color:rgba(51,102,153,0.4)">Reference</span>
      </body>`);
      expect(await page.evaluate((value) => CSS.supports('color', value), color)).toBe(true);
      const sample = await page.locator('#sample').evaluate(measureRenderedContrast);
      const reference = await page.locator('#reference').evaluate(measureRenderedContrast);
      expectColor(sample.background, [20, 40, 60, 1]);
      expectColor(sample.foreground, [32.4, 64.8, 97.2, 1]);
      expect(sample.ratio).toBeCloseTo(reference.ratio, 3);
    });
  }

  test('composites color-mix alpha through translucent ancestors', async ({ page }) => {
    await page.setContent(`<body style="background:rgb(20,40,60)">
      <div style="background:color-mix(in oklab, white 20%, transparent)">
        <span id="sample" style="background:color(srgb 0.2 0.4 0.6 / 0.4);color:color-mix(in oklab, white 50%, transparent)">Sample</span>
      </div>
    </body>`);
    const sample = await page.locator('#sample').evaluate(measureRenderedContrast);
    // Parent = white @ .2 over [20,40,60] => [67,83,99].
    // Background = [51,102,153] @ .4 over the parent.
    expectColor(sample.background, [60.6, 90.6, 120.6, 1]);
    expectColor(sample.foreground, [157.8, 172.8, 187.8, 1]);
  });

  test('preserves fractional channels on both sides of the unchanged AA threshold', async ({ page }) => {
    await page.setContent(`<body style="background:white">
      <span id="pass" style="color:color(srgb 0.465 0.465 0.465)">Pass</span>
      <span id="fail" style="color:color(srgb 0.466 0.466 0.466)">Fail</span>
    </body>`);
    const pass = await page.locator('#pass').evaluate(measureRenderedContrast);
    const fail = await page.locator('#fail').evaluate(measureRenderedContrast);
    expect(pass.foreground[0]).toBeCloseTo(118.575, 3);
    expect(fail.foreground[0]).toBeCloseTo(118.83, 3);
    expect(pass.ratio).toBeGreaterThanOrEqual(4.5);
    expect(fail.ratio).toBeLessThan(4.5);
  });

  test('audits a locator in its own iframe context', async ({ page }) => {
    await page.setContent('<iframe title="contrast fixture"></iframe>');
    const surface = page.frameLocator('iframe').locator('body');
    await surface.evaluate((body) => {
      body.innerHTML = `<div id="surface" style="background:white;font-size:16px;font-weight:400">
        <span style="color:white">Invisible text</span>
        <span style="color:black">Readable text</span>
      </div>`;
    });
    const audit = await auditRenderedContrast(surface.locator('#surface'));
    expect(audit.counts).toEqual({
      total: 2, belowAA: 1, below3: 1, below1_5: 1, whiteOnLight: 1, skippedGradient: 0,
    });
  });

  test('counts CSS Color 4 white-on-light and AA failures without exemptions', async ({ page }) => {
    await page.setContent(`<body>
      <div id="surface" style="background:white;font-size:16px;font-weight:400">
        <span style="color:color(srgb 1 1 1)">sRGB white</span>
        <span style="color:oklab(1 0 0)">Oklab white</span>
        <span style="color:color-mix(in oklab, white 50%, transparent)">Translucent white</span>
        <span style="color:color(srgb 0 0 0)">Readable black</span>
      </div>
    </body>`);
    const audit = await auditRenderedContrast(page.locator('#surface'));
    expect(audit.counts).toEqual({
      total: 4, belowAA: 3, below3: 3, below1_5: 3, whiteOnLight: 3, skippedGradient: 0,
    });
  });
});

test.describe('computed color semantic equality', () => {
  for (const [name, color, legacy, differentChannel, differentAlpha, expectedKey] of [
    [
      'risk score', 'oklab(0.485555 -0.109064 0.0630848 / 0.4)',
      'rgba(19, 114, 54, 0.4)', 'rgba(20, 114, 54, 0.4)',
      'color(srgb 0.0745098 0.4470588 0.2117647 / 0.403921568627451)', 'rgba8(19, 114, 54, 102)',
    ],
    [
      'neutral hover', 'oklab(0.206403 -0.00300531 -0.0387002 / 0.1)',
      'rgba(15, 23, 41, 0.1)', 'rgba(16, 23, 41, 0.1)',
      'color(srgb 0.0588235 0.0901961 0.1607843 / 0.10588235294117647)', 'rgba8(15, 23, 41, 26)',
    ],
  ] as const) {
    test(`${name} matches legacy RGBA while rejecting one-byte channel and alpha changes`, async ({ page }) => {
      await page.setContent(`<span id="sample" style="color:${color};background-color:${color}">Sample</span>`);
      const normalized = await page.evaluate(normalizeComputedColor, color);
      expect(normalized).toBe(expectedKey);
      expect(await page.evaluate(normalizeComputedColor, legacy)).toBe(normalized);
      expect(await page.evaluate(normalizeComputedColor, differentChannel)).not.toBe(normalized);
      expect(await page.evaluate(normalizeComputedColor, differentAlpha)).not.toBe(normalized);
      expect(await readComputedColor(page.locator('#sample'), 'color')).toBe(normalized);
      expect(await readComputedColor(page.locator('#sample'), 'backgroundColor')).toBe(normalized);
      await expect(page.locator('html > span')).toHaveCount(0);
    });
  }

  test('rejects unsupported colors without leaving normalization probes', async ({ page }) => {
    await page.setContent('<body>Unchanged</body>');
    await expect(page.evaluate(normalizeComputedColor, 'not-a-color'))
      .rejects.toThrow('Cannot normalize computed color: not-a-color');
    await expect(page.locator('html > span')).toHaveCount(0);
    await expect(page.locator('body')).toHaveText('Unchanged');
  });
});
