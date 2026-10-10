import { expect, test } from '@playwright/test';

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
  ['linear sRGB', 'color(from rgb(51 102 153) srgb-linear r g b)'],
  ['Tailwind color-mix', 'color-mix(in oklab, rgb(51 102 153) 100%, transparent)'],
] as const;

function expectColor(actual: Rgba, expected: Rgba): void {
  for (let index = 0; index < 4; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index]!, 2);
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
