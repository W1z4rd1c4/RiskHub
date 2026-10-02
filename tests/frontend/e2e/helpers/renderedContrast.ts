import type { Locator } from '@playwright/test';

export type Rgba = [number, number, number, number];

export interface RenderedContrastSample {
  /** WCAG 2.x contrast ratio of the composited text colour against the composited background. */
  ratio: number;
  /** Text colour composited over the background. */
  foreground: Rgba;
  /** Opaque background composited from the element and its ancestors (white fallback). */
  background: Rgba;
  /** A gradient `background-image` was crossed before an opaque layer, so the composite is approximate. */
  gradient: boolean;
}

/**
 * In-page measurement kernel. Composites the element's computed
 * `background-color` with each ancestor's (alpha "over") until the stack is
 * opaque, falls back to white, composites the computed text colour over that
 * background and returns the WCAG 2.x contrast ratio.
 *
 * It runs inside the browser (Playwright serialises it), so it must stay
 * self-contained: no imports and no references to module scope.
 */
export function measureRenderedContrast(element: Element): RenderedContrastSample {
  type Color = [number, number, number, number];
  const parse = (value: string): Color => {
    const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
  };
  const over = (front: Color, back: Color): Color => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (alpha === 0) return [0, 0, 0, 0];
    return [
      (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
      (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
      (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
      alpha,
    ];
  };
  const hasGradient = (node: Element) => getComputedStyle(node).backgroundImage.includes('gradient(');
  let gradient = hasGradient(element);
  let background = parse(getComputedStyle(element).backgroundColor);
  let ancestor = element.parentElement;
  while (ancestor && background[3] < 1) {
    gradient = gradient || hasGradient(ancestor);
    background = over(background, parse(getComputedStyle(ancestor).backgroundColor));
    ancestor = ancestor.parentElement;
  }
  if (background[3] < 1) background = over(background, [255, 255, 255, 1]);
  const foreground = over(parse(getComputedStyle(element).color), background);
  const luminance = (color: Color) => {
    const linear = color.slice(0, 3).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  return { ratio, foreground, background, gradient };
}

export async function renderedContrast(locator: Locator): Promise<number> {
  return (await locator.evaluate(measureRenderedContrast)).ratio;
}
