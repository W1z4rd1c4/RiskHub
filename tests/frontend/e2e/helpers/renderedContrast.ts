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
    let resolved = value;
    if (!/^(?:rgba?\(|color\(srgb\s)/.test(resolved)) {
      // Tailwind 4 alpha utilities compute to color()/oklab(), not necessarily
      // rgb(). Let the browser convert the actual color space to sRGB; treating
      // Oklab or 0..1 sRGB channels as 0..255 RGB silently corrupts the AA gate.
      // Relative color conversion preserves fractional channels and alpha,
      // unlike sampling an 8-bit canvas near the 4.5:1 threshold.
      const relative = `color(from ${value} srgb r g b / alpha)`;
      if (!CSS.supports('color', relative)) {
        throw new Error(`Cannot normalize rendered color to sRGB: ${value}`);
      }
      const probe = document.createElement('span');
      probe.hidden = true;
      probe.style.setProperty('color', relative, 'important');
      document.documentElement.append(probe);
      try {
        resolved = getComputedStyle(probe).color;
      } finally {
        probe.remove();
      }
    }
    const rgb = resolved.match(/^rgba?\(([^)]+)\)$/);
    const srgb = resolved.match(/^color\(srgb\s+([^)]+)\)$/);
    const components = (rgb?.[1] ?? srgb?.[1])?.trim().split(/[\s,/]+/);
    if (!components || components.length < 3 || components.length > 4) {
      throw new Error(`Unrecognized rendered sRGB color: ${value} -> ${resolved}`);
    }
    const channels = components.map((component, index) => {
      const percent = component.endsWith('%');
      const numeric = component === 'none' ? 0 : Number(percent ? component.slice(0, -1) : component);
      if (!Number.isFinite(numeric)) {
        throw new Error(`Invalid rendered sRGB channel: ${value} -> ${resolved}`);
      }
      const unit = percent ? numeric / 100 : numeric;
      return index < 3 && (srgb || percent) ? unit * 255 : unit;
    });
    // WCAG 2.x uses the rendered sRGB range, including colors converted from
    // wider gamuts. Keep fractional precision while clipping to that range.
    return [
      Math.max(0, Math.min(255, channels[0])),
      Math.max(0, Math.min(255, channels[1])),
      Math.max(0, Math.min(255, channels[2])),
      Math.max(0, Math.min(1, channels[3] ?? 1)),
    ];
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
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
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
