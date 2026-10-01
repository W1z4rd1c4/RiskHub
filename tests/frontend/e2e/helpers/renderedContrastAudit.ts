import type { Locator } from '@playwright/test';

import { measureRenderedContrast, type RenderedContrastSample } from './renderedContrast';

/** Per-surface counts that G-RENDER ratchets (§4.1 of the 2026-09-30 UI audit). */
export interface RenderedContrastCounts {
  /** Visible text elements measured (own text node, or a text field with a value). */
  total: number;
  /** Below WCAG AA: 4.5:1, or 3:1 for large text (>= 24px, or >= 18.66px bold). */
  belowAA: number;
  below3: number;
  /** Effectively invisible. */
  below1_5: number;
  /** White text composited on a light background (the DS-01 signature). */
  whiteOnLight: number;
  /** Elements over a gradient background; they cannot be composited and are not counted. */
  skippedGradient: number;
}

export interface RenderedContrastFailure {
  label: string;
  ratio: number;
  required: number;
}

export interface RenderedContrastAudit {
  counts: RenderedContrastCounts;
  /** Elements below AA, worst first (capped), for attachments and failure messages. */
  failures: RenderedContrastFailure[];
}

interface AuditArgs {
  kernel: string;
  failureCap: number;
}

/**
 * In-page auditor. Runs in the browser, so it must stay self-contained; the
 * compositing kernel (`measureRenderedContrast`) is passed in as source so the
 * audit and the targeted `renderedContrast()` probes share one algorithm.
 */
function auditInPage(root: Element, { kernel, failureCap }: AuditArgs): RenderedContrastAudit {
  const measure = new Function(`return (${kernel});`)() as (element: Element) => RenderedContrastSample;
  const skippedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'OPTGROUP', 'TITLE', 'SELECT']);
  const textInputTypes = new Set([
    '', 'text', 'search', 'email', 'number', 'tel', 'url', 'password',
    'date', 'datetime-local', 'month', 'time', 'week', 'button', 'submit', 'reset',
  ]);
  const counts: RenderedContrastCounts = {
    total: 0, belowAA: 0, below3: 0, below1_5: 0, whiteOnLight: 0, skippedGradient: 0,
  };
  const failures: RenderedContrastFailure[] = [];
  const luminance = (color: number[]) => {
    const linear = color.slice(0, 3).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const textOf = (element: Element): string => {
    if (element instanceof HTMLTextAreaElement) return element.value.trim();
    if (element instanceof HTMLInputElement) {
      return textInputTypes.has(element.type) ? element.value.trim() : '';
    }
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  };

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (skippedTags.has(element.tagName) || element.closest('svg')) continue;
    const text = textOf(element);
    if (!text) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const rect = element.getBoundingClientRect();
    // Visually hidden (sr-only) text is clipped to a 1px box.
    if (rect.width < 2 || rect.height < 2) continue;
    // WCAG 1.4.3 exempts inactive user-interface components.
    if (element.closest(':disabled, [aria-disabled="true"]')) continue;

    const sample = measure(element);
    if (sample.gradient) {
      counts.skippedGradient += 1;
      continue;
    }
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const fontWeight = Number.parseInt(style.fontWeight, 10);
    const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const required = large ? 3 : 4.5;
    const { ratio } = sample;
    const color = style.color.match(/[\d.]+/g)?.map(Number) ?? [];
    const white = (color[0] ?? 0) >= 250 && (color[1] ?? 0) >= 250 && (color[2] ?? 0) >= 250;

    counts.total += 1;
    if (white && luminance(sample.background) > 0.5) counts.whiteOnLight += 1;
    if (ratio < 1.5) counts.below1_5 += 1;
    if (ratio < 3) counts.below3 += 1;
    if (ratio < required) {
      counts.belowAA += 1;
      // Colour utilities first: they are what a reader of the failure needs.
      const classList = Array.from(element.classList);
      const colorFirst = [
        ...classList.filter((name) => /^(?:[\w-]+:)*(?:text|bg)-/.test(name)),
        ...classList.filter((name) => !/^(?:[\w-]+:)*(?:text|bg)-/.test(name)),
      ];
      const classes = colorFirst.slice(0, 5).join('.');
      failures.push({
        label: `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''} "${text.slice(0, 48)}"`,
        ratio: Math.round(ratio * 100) / 100,
        required,
      });
    }
  }
  failures.sort((left, right) => left.ratio - right.ratio);
  return { counts, failures: failures.slice(0, failureCap) };
}

/**
 * G-RENDER auditor: measures every visible text element under `scope` with the
 * same compositing algorithm as `renderedContrast()` and classifies it against
 * 4.5:1 (3:1 for large text), 3:1 and 1.5:1.
 */
export async function auditRenderedContrast(scope: Locator, failureCap = 25): Promise<RenderedContrastAudit> {
  return scope.evaluate(auditInPage, { kernel: measureRenderedContrast.toString(), failureCap });
}
