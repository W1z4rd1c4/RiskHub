import type { Locator } from '@playwright/test';

/**
 * Semantic color equality only: normalize CSS Color 4 to legacy 8-bit RGBA
 * precision, including alpha. The result is an equality key, not CSS.
 * Relative-color conversion can expose legacy alpha 0.1 as 26/255.
 * Contrast measurements must use
 * measureRenderedContrast instead, which preserves fractional RGB channels.
 * Self-contained because Playwright serializes this function into the browser.
 */
export function normalizeComputedColor(value: string): string {
  const relative = `color(from ${value} srgb r g b / alpha)`;
  if (!CSS.supports('color', relative)) {
    throw new Error(`Cannot normalize computed color: ${value}`);
  }
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.setProperty('color', relative, 'important');
  document.documentElement.append(probe);
  let resolved: string;
  try {
    resolved = getComputedStyle(probe).color;
  } finally {
    probe.remove();
  }
  const match = resolved.match(/^color\(srgb\s+([^)]+)\)$/);
  const channels = match?.[1]?.trim().split(/[\s/]+/).map(Number);
  if (!channels || channels.length < 3 || channels.length > 4 || !channels.every(Number.isFinite)) {
    throw new Error(`Unrecognized normalized computed color: ${value} -> ${resolved}`);
  }
  const rgb = channels.slice(0, 3).map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255));
  const alpha = Math.round(Math.max(0, Math.min(1, channels[3] ?? 1)) * 255);
  return `rgba8(${[...rgb, alpha].join(', ')})`;
}

export async function readComputedColor(
  locator: Locator,
  property: 'color' | 'backgroundColor',
): Promise<string> {
  const value = await locator.evaluate((element, name) => getComputedStyle(element)[name], property);
  return locator.page().evaluate(normalizeComputedColor, value);
}
